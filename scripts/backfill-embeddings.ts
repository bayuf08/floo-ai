/**
 * Backfill embeddings for existing brand_assets.
 *
 * Walks all assets with `extraction_status='done'` that have no rows in
 * brand_asset_chunks, chunks their extracted_text, embeds via OpenAI's
 * /embeddings endpoint, and inserts chunks.
 *
 * Idempotent: assets that already have chunks are skipped (the script
 * checks `brand_asset_chunks.asset_id` before processing). To force
 * re-embedding (e.g. after model switch), delete the existing rows
 * first or POST to /api/projects/:id/assets/:assetId/reembed.
 *
 * USAGE
 *   1. Make sure pgvector is enabled in Supabase + `bun run db:push`
 *      has applied 20260428000000_brand_asset_chunks.sql.
 *   2. Make sure your `.env` (or shell) has:
 *        NUXT_PUBLIC_SUPABASE_URL
 *        SUPABASE_SERVICE_ROLE_KEY
 *        OPENAI_API_KEY
 *      Optional:
 *        EMBEDDINGS_MODEL (default: text-embedding-3-small)
 *        BACKFILL_PROJECT_ID (scope to one project)
 *        BACKFILL_DRY_RUN=1 (list what would be done; don't write)
 *   3. Run: `bun run scripts/backfill-embeddings.ts`
 *
 * Exits 0 on success, 1 on any asset failure.
 */
import { createClient } from '@supabase/supabase-js'
import { chunkText } from '../server/utils/text-chunker'

const SUPABASE_URL = process.env.NUXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_KEY = process.env.OPENAI_API_KEY
const MODEL = process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small'
const PROJECT_FILTER = process.env.BACKFILL_PROJECT_ID
const DRY_RUN = process.env.BACKFILL_DRY_RUN === '1'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NUXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}
if (!OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY (required for embeddings)')
  process.exit(2)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const EMBED_DIMENSIONS = 1536
const MAX_INPUTS_PER_REQUEST = 100
const MAX_CHARS_PER_INPUT = 30_000

interface AssetRow {
  id: string
  project_id: string
  name: string
  extracted_text: string
  has_chunks: boolean
}

/** Embed an array of texts via OpenAI /embeddings. Mirrors server/utils/embeddings.ts. */
async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return []

  const cleaned = inputs.map((raw) => {
    const trimmed = (raw ?? '').trim()
    if (!trimmed) return ' '
    return trimmed.length > MAX_CHARS_PER_INPUT ? trimmed.slice(0, MAX_CHARS_PER_INPUT) : trimmed
  })

  const all: number[][] = []
  for (let i = 0; i < cleaned.length; i += MAX_INPUTS_PER_REQUEST) {
    const batch = cleaned.slice(i, i + MAX_INPUTS_PER_REQUEST)
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, input: batch }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`)
    }
    const json: any = await res.json()
    const sorted = [...(json?.data ?? [])].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
    for (const entry of sorted) {
      const vec: number[] = entry?.embedding ?? []
      if (vec.length !== EMBED_DIMENSIONS) {
        throw new Error(`Expected ${EMBED_DIMENSIONS}-d vector, got ${vec.length}-d`)
      }
      all.push(vec)
    }
  }

  if (all.length !== inputs.length) {
    throw new Error(`Embedding count mismatch: expected ${inputs.length}, got ${all.length}`)
  }
  return all
}

async function listEligibleAssets(): Promise<AssetRow[]> {
  // Pull all done-extracted assets for the (optionally filtered) project.
  let query = supabase
    .from('brand_assets')
    .select('id, project_id, name, extracted_text')
    .eq('extraction_status', 'done')
    .not('extracted_text', 'is', null)
  if (PROJECT_FILTER) query = query.eq('project_id', PROJECT_FILTER)

  const { data: assets, error } = await query
  if (error) throw new Error(`assets query failed: ${error.message}`)
  if (!assets || !assets.length) return []

  // Find which ones already have chunks. Cheaper than a per-asset
  // round-trip — one IN (…) query, then mark each row.
  const ids = assets.map((a: any) => a.id)
  const { data: chunkRows, error: chunkErr } = await supabase
    .from('brand_asset_chunks')
    .select('asset_id')
    .in('asset_id', ids)
  if (chunkErr) throw new Error(`chunks query failed: ${chunkErr.message}`)
  const withChunks = new Set((chunkRows ?? []).map((r: any) => r.asset_id))

  return assets.map((a: any) => ({
    id: a.id,
    project_id: a.project_id,
    name: a.name,
    extracted_text: a.extracted_text,
    has_chunks: withChunks.has(a.id),
  }))
}

async function processAsset(asset: AssetRow): Promise<{ chunkCount: number; tokensTotal: number }> {
  const chunks = chunkText(asset.extracted_text)
  if (!chunks.length) return { chunkCount: 0, tokensTotal: 0 }

  if (DRY_RUN) {
    return {
      chunkCount: chunks.length,
      tokensTotal: chunks.reduce((s, c) => s + c.tokens, 0),
    }
  }

  const embeddings = await embedBatch(chunks.map((c) => c.text))

  // Wipe existing chunks first — keeps (asset_id, chunk_index) unique
  // index from colliding if a partial run left half-written rows.
  const { error: delErr } = await supabase
    .from('brand_asset_chunks')
    .delete()
    .eq('asset_id', asset.id)
  if (delErr) throw new Error(`delete existing chunks failed: ${delErr.message}`)

  const rows = chunks.map((chunk, i) => ({
    asset_id: asset.id,
    project_id: asset.project_id,
    chunk_index: chunk.index,
    text: chunk.text,
    tokens: chunk.tokens,
    embedding: embeddings[i],
  }))
  const { error: insErr } = await supabase.from('brand_asset_chunks').insert(rows)
  if (insErr) throw new Error(`insert chunks failed: ${insErr.message}`)

  return {
    chunkCount: chunks.length,
    tokensTotal: chunks.reduce((s, c) => s + c.tokens, 0),
  }
}

// ─── Main ────────────────────────────────────────────────────
console.log(`[backfill] model=${MODEL}${PROJECT_FILTER ? ` project=${PROJECT_FILTER}` : ''}${DRY_RUN ? ' DRY_RUN' : ''}`)

const all = await listEligibleAssets()
const todo = all.filter((a) => !a.has_chunks)
console.log(
  `[backfill] eligible=${all.length}  already_embedded=${all.length - todo.length}  to_process=${todo.length}`
)

if (!todo.length) {
  console.log('[backfill] nothing to do.')
  process.exit(0)
}

let okCount = 0
let failCount = 0
const startedAt = Date.now()

for (let i = 0; i < todo.length; i++) {
  const asset = todo[i]!
  const t0 = Date.now()
  try {
    const { chunkCount, tokensTotal } = await processAsset(asset)
    const ms = Date.now() - t0
    console.log(
      `[${i + 1}/${todo.length}] ${asset.name.padEnd(40).slice(0, 40)}  ${String(chunkCount).padStart(3)} chunks  ${String(tokensTotal).padStart(5)} tok  ${ms}ms`
    )
    okCount += 1
  } catch (err: any) {
    console.error(
      `[${i + 1}/${todo.length}] ${asset.name}  FAIL  ${err?.message ?? String(err)}`
    )
    failCount += 1
  }
}

const totalMs = Date.now() - startedAt
console.log(
  `[backfill] done — ${okCount} ok · ${failCount} fail · ${totalMs}ms total`
)
process.exit(failCount === 0 ? 0 : 1)
