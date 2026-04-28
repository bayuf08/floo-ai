/**
 * Query-time retrieval over brand-knowledge chunks.
 *
 * Embeds the user's message and asks Postgres for the top-K nearest
 * chunks for the project. Used by the messages POST + stream endpoints
 * to populate `BuildPromptArgs.selectedChunks` — when this returns
 * empty, the prompt-builder falls back to the inline-extracted_text
 * path automatically.
 *
 * Failure modes:
 *   - No chunks for the project   → return empty array (no log noise).
 *   - Embeddings provider missing → return empty array, log warning.
 *   - Embeddings call fails       → return empty array, log warning.
 *   - RPC fails (pgvector off)    → return empty array, log warning.
 *
 * In every case the caller continues with an empty array; the
 * prompt-builder's fallback keeps the chat working until the operator
 * fixes the underlying configuration.
 */
import type { H3Event } from 'h3'
import { embedQuery } from './embeddings'
import { serviceSupabase } from './supabase'
import { log } from './logger'
import type { SelectedChunk } from './prompt-builder'

const DEFAULT_MATCH_COUNT = 5

export async function retrieveRelevantChunks(
  event: H3Event,
  args: { projectId: string; query: string; matchCount?: number }
): Promise<SelectedChunk[]> {
  const matchCount = args.matchCount ?? DEFAULT_MATCH_COUNT
  const trimmedQuery = (args.query ?? '').trim()
  if (!trimmedQuery) return []

  const admin = serviceSupabase(event)

  // Cheap pre-flight: skip the expensive embed call if the project has
  // no chunks at all. One narrow `select id limit 1` is much cheaper
  // than a 1500-d vector round-trip when no chunks exist.
  const { data: probe, error: probeErr } = await admin
    .from('brand_asset_chunks')
    .select('id')
    .eq('project_id', args.projectId)
    .limit(1)
  if (probeErr) {
    // Most likely "relation does not exist" before the migration ran.
    // Log once, then fall through to the inline path. The chat keeps
    // working — just without RAG until the migration is applied.
    log.warn('[asset-retrieval]', 'chunk probe failed (migration not run?)', {
      projectId: args.projectId,
      error: probeErr.message,
    })
    return []
  }
  if (!probe || probe.length === 0) return []

  // Embed the query. If embeddings aren't configured (no OPENAI_API_KEY)
  // or the provider 5xx's, log + degrade gracefully.
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedQuery(event, trimmedQuery)
  } catch (err: any) {
    log.warn('[asset-retrieval]', 'query embed failed; falling back to inline path', {
      projectId: args.projectId,
      error: err?.message ?? String(err),
    })
    return []
  }

  // RPC defined in 20260428000000_brand_asset_chunks.sql.
  const { data, error: rpcErr } = await admin.rpc('match_project_chunks', {
    query_embedding: queryEmbedding,
    p_project_id: args.projectId,
    match_count: matchCount,
  })

  if (rpcErr) {
    log.warn('[asset-retrieval]', 'match_project_chunks RPC failed', {
      projectId: args.projectId,
      error: rpcErr.message,
    })
    return []
  }

  const rows = Array.isArray(data) ? data : []
  return rows.map((r: any) => ({
    asset_name: r.asset_name ?? 'unknown source',
    asset_category: r.asset_category ?? null,
    text: r.text ?? '',
    similarity: typeof r.similarity === 'number' ? r.similarity : null,
  }))
}
