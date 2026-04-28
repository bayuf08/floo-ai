/**
 * Embeddings client.
 *
 * Wraps OpenAI's /embeddings endpoint behind a small interface that
 * matches the shape the rest of the codebase needs:
 *   - embedTexts()  → batch a list of inputs into one or more API calls,
 *                     return one Float-array per input in order.
 *   - embedQuery()  → convenience for the single-string query path.
 *
 * Default model is `text-embedding-3-small` (1536 dims). To swap models,
 * set EMBEDDINGS_MODEL in `.env` — but remember the migration's
 * `vector(1536)` column is sized for the default; switching to a model
 * with different dimensionality requires a migration AND re-embedding
 * every existing chunk.
 *
 * Why not GLM here? text-embedding-3-small is well-understood, cheap
 * ($0.02/1M tokens), and the migration's vector column is sized for it.
 * If you switch later, change EMBEDDING_DIMENSIONS, write a migration,
 * and re-embed.
 */
import type { H3Event } from 'h3'
import { log } from './logger'

/**
 * Vector dimensionality. Must match the `vector(N)` size in
 * supabase/migrations/20260428000000_brand_asset_chunks.sql.
 */
export const EMBEDDING_DIMENSIONS = 1536

/**
 * OpenAI's stated upper bound for text-embedding-3-* per request.
 * We batch up to this size — anything bigger comes back as 400.
 */
const MAX_INPUTS_PER_REQUEST = 100

/**
 * Per-input character cap. text-embedding-3-small allows 8191 tokens
 * which at ~4 chars/token is ~32k chars. We cap a little under to
 * leave headroom for the chunker's tokens-per-char heuristic being off.
 */
const MAX_CHARS_PER_INPUT = 30_000

export class EmbeddingsProviderError extends Error {
  constructor(
    public status: number,
    public providerMessage: string,
    public model: string
  ) {
    super(`embeddings ${status}: ${providerMessage}`)
    this.name = 'EmbeddingsProviderError'
  }
}

export interface EmbeddingsResponse {
  embeddings: number[][]
  model: string
  usage?: {
    promptTokens?: number
    totalTokens?: number
  }
}

/**
 * Embed many inputs in one batched call (or several, if the input set
 * exceeds OpenAI's per-request limit). Returns one Float-array per input
 * in the SAME ORDER the inputs were given — callers can zip the result
 * back to source rows by index.
 *
 * Throws EmbeddingsProviderError on a non-2xx response. Throws plain
 * Error on a missing API key, so the calling pipeline can decide whether
 * to log + skip (for the best-effort embed-on-extract path) or surface
 * (for the synchronous query-time path).
 */
export async function embedTexts(
  event: H3Event,
  inputs: string[]
): Promise<EmbeddingsResponse> {
  const config = useRuntimeConfig(event)
  const apiKey = config.openaiApiKey
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured — embeddings unavailable')
  }
  const model = (config.embeddingsModel as string | undefined) ?? 'text-embedding-3-small'
  const baseUrl = ((config.openaiApiBaseUrl as string | undefined) ?? 'https://api.openai.com/v1').replace(/\/$/, '')

  if (inputs.length === 0) {
    return { embeddings: [], model }
  }

  // Pre-clean: trim & truncate each input so a single oversized chunk
  // can't 400 the whole batch. Empty inputs after trimming get replaced
  // with a single space so the index alignment is preserved (OpenAI
  // returns 400 on a literally-empty string).
  const cleaned = inputs.map((raw) => {
    const trimmed = (raw ?? '').trim()
    if (!trimmed) return ' '
    if (trimmed.length > MAX_CHARS_PER_INPUT) {
      return trimmed.slice(0, MAX_CHARS_PER_INPUT)
    }
    return trimmed
  })

  const allEmbeddings: number[][] = []
  let promptTokens = 0
  let totalTokens = 0

  for (let i = 0; i < cleaned.length; i += MAX_INPUTS_PER_REQUEST) {
    const batch = cleaned.slice(i, i + MAX_INPUTS_PER_REQUEST)
    const startedAt = Date.now()

    const httpRes = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: batch,
        // text-embedding-3-* accept an explicit `dimensions` arg to
        // truncate the returned vector. We use the default (full size)
        // because the index is sized for it — passing dimensions here
        // would silently break the index match.
      }),
    })

    if (!httpRes.ok) {
      const text = await httpRes.text().catch(() => '')
      let providerMessage = text || `HTTP ${httpRes.status}`
      try {
        const j = JSON.parse(text)
        providerMessage = j?.error?.message ?? j?.message ?? providerMessage
      } catch { /* keep raw text */ }
      log.error('[ai/embeddings]', 'OpenAI rejected batch', {
        status: httpRes.status,
        model,
        batchSize: batch.length,
        latencyMs: Date.now() - startedAt,
        providerMessage: String(providerMessage).slice(0, 500),
      })
      throw new EmbeddingsProviderError(
        httpRes.status,
        String(providerMessage).slice(0, 500),
        model
      )
    }

    const json = (await httpRes.json()) as any
    const data = Array.isArray(json?.data) ? json.data : []

    // OpenAI returns `data: [{ index, embedding, object }]` ordered by
    // request index, but sort defensively in case that contract drifts.
    const sorted = [...data].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
    for (const entry of sorted) {
      const vec: number[] = entry?.embedding ?? []
      if (vec.length !== EMBEDDING_DIMENSIONS) {
        // If a future model returns a different dim, fail loudly
        // instead of writing rows the index can't store.
        throw new EmbeddingsProviderError(
          500,
          `Expected ${EMBEDDING_DIMENSIONS}-d vector, got ${vec.length}-d (model ${model})`,
          model
        )
      }
      allEmbeddings.push(vec)
    }

    promptTokens += json?.usage?.prompt_tokens ?? 0
    totalTokens += json?.usage?.total_tokens ?? 0
  }

  if (allEmbeddings.length !== inputs.length) {
    // Defensive — if OpenAI returns fewer vectors than we sent, the
    // index alignment is broken. Better to fail fast than silently
    // misalign chunk-text and embedding rows in the DB.
    throw new EmbeddingsProviderError(
      500,
      `Embedding count mismatch: expected ${inputs.length}, got ${allEmbeddings.length}`,
      model
    )
  }

  return {
    embeddings: allEmbeddings,
    model,
    usage: { promptTokens, totalTokens },
  }
}

/**
 * Convenience wrapper for the query-time path (one user message → one
 * vector). Throws on failure — the caller (prompt-builder) is expected
 * to catch and fall back to the no-RAG path so a flaky embeddings call
 * doesn't break chat entirely.
 */
export async function embedQuery(event: H3Event, text: string): Promise<number[]> {
  const { embeddings } = await embedTexts(event, [text])
  const first = embeddings[0]
  if (!first) {
    throw new EmbeddingsProviderError(500, 'Embeddings response was empty', 'unknown')
  }
  return first
}
