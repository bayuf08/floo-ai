/**
 * Tiny in-memory token-bucket rate limiter.
 *
 * Per-user buckets, refills continuously. Good enough for a single
 * Nuxt instance — for multi-region deployments, swap the Map for Redis or
 * Supabase realtime presence later. Each bucket has its own capacity and
 * refill rate so callers can use different limits per endpoint.
 *
 * Throws a 429 createError if the request would deplete the bucket below 0.
 */
import type { H3Event } from 'h3'

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets: Map<string, Bucket> = new Map()

export interface RateLimitOptions {
  /** Bucket capacity (max burst). */
  capacity: number
  /** Tokens added per millisecond. e.g. 20/min = 20/60000 ≈ 0.000333 */
  refillPerMs: number
  /** Bucket key — usually the user id, prefixed with the route name. */
  key: string
  /** Cost of this request, default 1. */
  cost?: number
}

/**
 * Throws 429 if the bucket can't cover `cost`. Otherwise debits and returns.
 *
 * Example for AI endpoints (20 requests / minute):
 *   rateLimit(event, {
 *     key: `ai:${user.id}`,
 *     capacity: 20,
 *     refillPerMs: 20 / 60_000,
 *   })
 */
export function rateLimit(event: H3Event, opts: RateLimitOptions) {
  const cost = opts.cost ?? 1
  const now = Date.now()

  let bucket = buckets.get(opts.key)
  if (!bucket) {
    bucket = { tokens: opts.capacity, lastRefill: now }
    buckets.set(opts.key, bucket)
  } else {
    // Refill since last touch.
    const elapsed = now - bucket.lastRefill
    bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsed * opts.refillPerMs)
    bucket.lastRefill = now
  }

  if (bucket.tokens < cost) {
    const waitMs = Math.ceil((cost - bucket.tokens) / opts.refillPerMs)
    setHeader(event, 'Retry-After', String(Math.ceil(waitMs / 1000)))
    throw createError({
      statusCode: 429,
      statusMessage: `Rate limit exceeded. Try again in ${Math.ceil(waitMs / 1000)}s.`,
    })
  }

  bucket.tokens -= cost
}

/**
 * Convenience: AI endpoint limiter — 20 requests/minute per user.
 * Override via the `RATE_LIMIT_AI_REQUESTS_PER_MINUTE` env var (read by the caller).
 */
export function rateLimitAi(event: H3Event, userId: string, perMinute = 20) {
  rateLimit(event, {
    key: `ai:${userId}`,
    capacity: perMinute,
    refillPerMs: perMinute / 60_000,
  })
}
