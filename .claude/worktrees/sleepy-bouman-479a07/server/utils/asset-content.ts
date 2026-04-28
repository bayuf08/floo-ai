/**
 * Brand-asset text extraction.
 *
 * Pulls a file from Supabase Storage, runs it through the appropriate parser
 * (unpdf for PDF, mammoth for DOCX, TextDecoder for plain text), and writes
 * the result back to brand_assets.extraction_status / extracted_text.
 *
 * Every step writes a structured line to logs/app.log under context
 * "[extraction]" — grep that file when extractions go wrong.
 */
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'
import { serviceSupabase } from './supabase'
import { log } from './logger'

export type ExtractionStatus = 'pending' | 'done' | 'skipped' | 'error'

export interface ExtractionResult {
  status: ExtractionStatus
  text?: string
  error?: string
  truncated?: boolean
}

/** Per-asset hard cap so we don't blow the LLM's context window. */
const MAX_EXTRACT_CHARS = 60_000

const TEXT_LIKE = new Set(['txt', 'md', 'csv', 'tsv'])
const PDF_EXTS = new Set(['pdf'])
const DOCX_EXTS = new Set(['docx'])

interface AssetRow {
  id: string
  name: string
  extension: string
  size_bytes: number
  storage_path: string
}

export async function extractAssetText(
  event: H3Event,
  asset: AssetRow,
): Promise<ExtractionResult> {
  const { id, name, extension, size_bytes, storage_path } = asset
  const ext = (extension || '').toLowerCase().replace(/^\./, '')

  log.info('[extraction]', 'start', {
    assetId: id,
    name,
    extension: ext,
    sizeBytes: size_bytes,
    storagePath: storage_path,
  })

  if (!PDF_EXTS.has(ext) && !DOCX_EXTS.has(ext) && !TEXT_LIKE.has(ext)) {
    log.info('[extraction]', 'skipped', { assetId: id, reason: 'unsupported-extension' })
    return { status: 'skipped' }
  }

  const config = useRuntimeConfig(event)
  const bucket = config.storageBucketAssets
  const supabase = serviceSupabase(event)

  let bytes: Uint8Array
  try {
    const { data, error } = await supabase.storage.from(bucket).download(storage_path)
    if (error || !data) {
      const msg = error?.message || 'Storage download returned no data'
      log.error('[extraction]', 'download-failed', { assetId: id, message: msg })
      return { status: 'error', error: `Storage download failed: ${msg}` }
    }
    const ab = await data.arrayBuffer()
    bytes = new Uint8Array(ab)
    log.info('[extraction]', 'downloaded', { assetId: id, bytes: bytes.byteLength })
  } catch (err: any) {
    log.error('[extraction]', 'download-threw', {
      assetId: id,
      message: err?.message,
      stack: err?.stack,
    })
    return { status: 'error', error: `Download exception: ${err?.message ?? 'unknown'}` }
  }

  let parser: 'unpdf' | 'mammoth' | 'text-decoder' = 'text-decoder'
  let raw = ''
  try {
    if (PDF_EXTS.has(ext)) {
      parser = 'unpdf'
      log.info('[extraction]', 'parser-invoked', { assetId: id, parser })
      const doc = await getDocumentProxy(bytes)
      const result = await extractText(doc, { mergePages: true })
      raw = typeof result.text === 'string' ? result.text : (result.text as string[]).join('\n')
      log.info('[extraction]', 'pdf-pages', { assetId: id, pages: result.totalPages })
    } else if (DOCX_EXTS.has(ext)) {
      parser = 'mammoth'
      log.info('[extraction]', 'parser-invoked', { assetId: id, parser })
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
      raw = result.value ?? ''
      if (result.messages?.length) {
        log.warn('[extraction]', 'mammoth-messages', {
          assetId: id,
          messages: result.messages.slice(0, 5),
        })
      }
    } else {
      parser = 'text-decoder'
      log.info('[extraction]', 'parser-invoked', { assetId: id, parser })
      raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    }
  } catch (err: any) {
    log.error('[extraction]', 'parser-threw', {
      assetId: id,
      parser,
      message: err?.message,
      stack: err?.stack,
    })
    return { status: 'error', error: `${parser} failed: ${err?.message ?? 'unknown'}` }
  }

  // Collapse whitespace runs but preserve paragraph breaks.
  const normalized = raw
    .replace(/ /g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) {
    log.warn('[extraction]', 'empty-text', { assetId: id, parser })
    return {
      status: 'error',
      error: 'No text content found (file may be image-only or scanned).',
    }
  }

  let text = normalized
  let truncated = false
  if (text.length > MAX_EXTRACT_CHARS) {
    text = text.slice(0, MAX_EXTRACT_CHARS)
    truncated = true
  }

  log.info('[extraction]', 'parsed', {
    assetId: id,
    parser,
    chars: text.length,
    truncated,
  })

  return { status: 'done', text, truncated }
}

/**
 * Run extraction and persist the result back to brand_assets.
 * Safe to call from upload handlers and the manual retry endpoint.
 */
export async function extractAndPersist(
  event: H3Event,
  projectId: string,
  assetId: string,
): Promise<ExtractionResult> {
  const supabase = serviceSupabase(event)

  const { data: asset, error: fetchErr } = await supabase
    .from('brand_assets')
    .select('id, name, extension, size_bytes, storage_path')
    .eq('id', assetId)
    .eq('project_id', projectId)
    .single()

  if (fetchErr || !asset) {
    log.error('[extraction]', 'asset-row-not-found', {
      assetId,
      projectId,
      message: fetchErr?.message,
    })
    return {
      status: 'error',
      error: `Asset row not found: ${fetchErr?.message ?? 'no row'}`,
    }
  }

  const result = await extractAssetText(event, asset as AssetRow)

  const { error: updateErr } = await supabase
    .from('brand_assets')
    .update({
      extracted_text: result.text ?? null,
      extraction_status: result.status,
      extraction_error: result.error ?? null,
      extracted_at: result.status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', assetId)

  if (updateErr) {
    log.error('[extraction]', 'persist-failed', {
      assetId,
      status: result.status,
      message: updateErr.message,
    })
  } else {
    log.info('[extraction]', 'persisted', {
      assetId,
      status: result.status,
      hasText: !!result.text,
      truncated: !!result.truncated,
    })
  }

  return result
}
