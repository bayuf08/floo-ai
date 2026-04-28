/**
 * Brand-asset content extraction.
 *
 * The AI prompt previously only saw the *filenames* of uploaded brand assets,
 * which is useless — the model can't read what it can't see. This module
 * downloads each asset from Supabase Storage and extracts plaintext, which
 * gets cached on `brand_assets.extracted_text` so we don't re-parse on every
 * AI call.
 *
 * Supported formats:
 *   - .txt / .md / .csv     →  read directly as UTF-8
 *   - .pdf                   →  unpdf (zero-dep, edge-compatible)
 *   - .docx                  →  mammoth
 *   - images / videos / pptx →  skipped (status='skipped')
 */
import type { H3Event } from 'h3'
import { serviceSupabase } from './supabase'
import { embedTexts } from './embeddings'
import { chunkText } from './text-chunker'
import { log } from './logger'

/** Soft cap so a 200-page PDF doesn't blow out the GLM context window. */
const MAX_EXTRACT_CHARS = 60_000

export interface ExtractionResult {
  status: 'done' | 'skipped' | 'error'
  text?: string
  error?: string
}

/** Decide if we should bother trying to extract this file. */
export function isExtractable(extension: string): boolean {
  const ext = extension.toLowerCase().replace(/^\./, '')
  return ['txt', 'md', 'csv', 'tsv', 'pdf', 'docx'].includes(ext)
}

/**
 * Fetch the file body from Supabase Storage and extract plaintext.
 * Does NOT write to the DB — call updateExtractionResult() with the result.
 */
export async function extractAssetText(
  event: H3Event,
  asset: {
    id: string
    storage_path: string
    extension: string
    name: string
  }
): Promise<ExtractionResult> {
  const ext = asset.extension.toLowerCase().replace(/^\./, '')
  if (!isExtractable(ext)) return { status: 'skipped' }

  const config = useRuntimeConfig(event)
  const admin = serviceSupabase(event)
  const bucket = config.storageBucketAssets

  // Download as a Blob; convert to ArrayBuffer for parser libs.
  const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(asset.storage_path)
  if (dlErr || !blob) {
    return { status: 'error', error: dlErr?.message ?? 'Storage download failed' }
  }
  const buffer = new Uint8Array(await blob.arrayBuffer())

  try {
    let text = ''
    if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'tsv') {
      text = new TextDecoder('utf-8').decode(buffer)
    } else if (ext === 'pdf') {
      text = await extractPdf(buffer)
    } else if (ext === 'docx') {
      text = await extractDocx(buffer)
    } else {
      return { status: 'skipped' }
    }

    // Normalize whitespace + truncate so we don't OOM the LLM context.
    text = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
    if (text.length > MAX_EXTRACT_CHARS) {
      text = text.slice(0, MAX_EXTRACT_CHARS) + '\n\n[…truncated]'
    }
    if (!text) return { status: 'error', error: 'No text content found' }
    return { status: 'done', text }
  } catch (e: any) {
    return { status: 'error', error: e?.message ?? 'Extraction failed' }
  }
}

async function extractPdf(buffer: Uint8Array): Promise<string> {
  // Dynamic import keeps cold-start fast and avoids loading PDF.js when it
  // isn't needed. unpdf is edge-compatible (no native bindings).
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(buffer)
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join('\n\n') : (text ?? '')
}

async function extractDocx(buffer: Uint8Array): Promise<string> {
  // mammoth uses Buffer in node — coerce.
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'))
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  return result.value ?? ''
}

/** Persist the extraction outcome onto the brand_assets row. */
export async function updateExtractionResult(
  event: H3Event,
  assetId: string,
  result: ExtractionResult
) {
  const admin = serviceSupabase(event)
  await admin
    .from('brand_assets')
    .update({
      extracted_text: result.text ?? null,
      extraction_status: result.status,
      extraction_error: result.error ?? null,
      extracted_at: new Date().toISOString(),
    })
    .eq('id', assetId)
}

/**
 * Convenience: run extraction + persist atomically. Errors are swallowed and
 * stored as `error` status so an upload never fails just because parsing did.
 *
 * After a successful extraction, this also kicks off embedding the asset
 * (chunk → text-embedding-3-small → brand_asset_chunks rows) on a
 * best-effort basis. Embedding failures don't change the extraction
 * status — the prompt-builder falls back to the inline-extracted_text
 * path when chunks are missing.
 */
export async function extractAndPersist(
  event: H3Event,
  asset: {
    id: string
    storage_path: string
    extension: string
    name: string
    project_id?: string
  }
): Promise<ExtractionResult> {
  const result = await extractAssetText(event, asset).catch((e) => ({
    status: 'error' as const,
    error: e?.message ?? 'Extraction crashed',
  }))
  await updateExtractionResult(event, asset.id, result).catch(() => undefined)

  // Best-effort embed. If we don't have a project_id (older callers
  // didn't pass it), we still skip embedding rather than guess — the
  // backfill CLI can pick this up later.
  if (result.status === 'done' && result.text && asset.project_id) {
    embedAssetChunks(event, {
      assetId: asset.id,
      projectId: asset.project_id,
      text: result.text,
    }).catch((err) => {
      // Non-fatal — extraction status stays 'done', the prompt-builder
      // just won't have chunks to retrieve from for this asset until
      // the next reembed call.
      log.warn('[asset-content/embed]', 'embedAssetChunks failed (best-effort)', {
        assetId: asset.id,
        projectId: asset.project_id,
        error: err?.message ?? String(err),
      })
    })
  }
  return result
}

/**
 * Chunk + embed an asset's extracted text and replace its rows in
 * brand_asset_chunks. Idempotent: a re-call deletes the asset's
 * existing chunks before inserting new ones, so the (asset_id,
 * chunk_index) unique index can't collide.
 *
 * Throws on embedding-provider failure. Callers in the hot path (e.g.
 * the upload pipeline) should catch and log; callers that explicitly
 * want to surface failure (e.g. the manual reembed endpoint) should let
 * it propagate.
 */
export async function embedAssetChunks(
  event: H3Event,
  args: { assetId: string; projectId: string; text: string }
): Promise<{ chunkCount: number; tokensTotal: number }> {
  const admin = serviceSupabase(event)
  const chunks = chunkText(args.text)

  // Always wipe existing chunks first — both the empty-chunks case (no
  // text after re-extraction) and the new-chunks case need this to keep
  // the index in sync with reality.
  await admin
    .from('brand_asset_chunks')
    .delete()
    .eq('asset_id', args.assetId)

  if (chunks.length === 0) {
    return { chunkCount: 0, tokensTotal: 0 }
  }

  const { embeddings } = await embedTexts(event, chunks.map((c) => c.text))

  const rows = chunks.map((chunk, i) => ({
    asset_id: args.assetId,
    project_id: args.projectId,
    chunk_index: chunk.index,
    text: chunk.text,
    tokens: chunk.tokens,
    // pgvector accepts a JSON-array literal for vector columns when
    // sent over the REST/PostgREST wire. supabase-js handles the
    // formatting automatically when you pass an array of numbers.
    embedding: embeddings[i],
  }))

  const { error: insertErr } = await admin
    .from('brand_asset_chunks')
    .insert(rows)

  if (insertErr) {
    log.error('[asset-content/embed]', 'chunk insert failed', {
      assetId: args.assetId,
      projectId: args.projectId,
      chunkCount: chunks.length,
      error: insertErr.message,
    })
    throw new Error(`chunk insert failed: ${insertErr.message}`)
  }

  const tokensTotal = chunks.reduce((sum, c) => sum + (c.tokens ?? 0), 0)
  log.info('[asset-content/embed]', 'embedded asset chunks', {
    assetId: args.assetId,
    projectId: args.projectId,
    chunkCount: chunks.length,
    tokensTotal,
  })
  return { chunkCount: chunks.length, tokensTotal }
}

/**
 * Defensive: poll for any recently-uploaded extractable assets that are still
 * in `pending` state. Returns when none remain, or when the timeout expires.
 *
 * Extraction normally completes synchronously inside the upload request, but
 * if a separate /extract.post.ts call is in flight, or if the upload races
 * with a chat message, we'd otherwise build the prompt without the file.
 *
 * Caller passes a max-age cutoff so we never block on truly-old pending rows
 * (which means extraction crashed and the row just never got marked).
 */
export async function awaitPendingExtractions(
  event: H3Event,
  projectId: string,
  options: { timeoutMs?: number; maxAgeSeconds?: number } = {}
): Promise<{ waitedMs: number; stillPending: number }> {
  const timeoutMs = options.timeoutMs ?? 3_000
  const maxAgeSeconds = options.maxAgeSeconds ?? 30
  const admin = serviceSupabase(event)
  const start = Date.now()
  const cutoffISO = new Date(Date.now() - maxAgeSeconds * 1000).toISOString()

  while (Date.now() - start < timeoutMs) {
    const { data } = await admin
      .from('brand_assets')
      .select('id')
      .eq('project_id', projectId)
      .eq('extraction_status', 'pending')
      .gt('uploaded_at', cutoffISO)

    const pending = data?.length ?? 0
    if (pending === 0) return { waitedMs: Date.now() - start, stillPending: 0 }
    await new Promise((r) => setTimeout(r, 500))
  }

  // Timeout — return how many were still pending so caller can log it.
  const { data } = await admin
    .from('brand_assets')
    .select('id')
    .eq('project_id', projectId)
    .eq('extraction_status', 'pending')
    .gt('uploaded_at', cutoffISO)
  return { waitedMs: Date.now() - start, stillPending: data?.length ?? 0 }
}
