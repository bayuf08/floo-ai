/**
 * GET /api/health/ai
 *
 * Live-pings the configured AI provider with a 1-token prompt. Public
 * (registered in `server/middleware/auth.ts`'s PUBLIC_PATHS) so uptime
 * monitors can hit it without a session.
 *
 * Response shape:
 *   { provider, model, ok: true,  latencyMs, content }            on success
 *   { provider, model, ok: false, latencyMs, error, status? }     on failure
 *
 * The endpoint always returns HTTP 200 — failures are encoded in the
 * `ok` field so monitors can parse one shape regardless of outcome.
 *
 * Cost: ~1 prompt token + 1 completion token per call. Don't poll
 * faster than every ~60s in production.
 */
import { AIProviderError, generateChat, pickProvider } from '~/server/utils/ai'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  // Single source of truth — same picker generateChat/streamChat use,
  // so the health endpoint can't disagree with the actual call path.
  const provider = pickProvider(config)

  // No provider key configured — short-circuit so we don't burn the
  // mock fallback's setTimeout on a monitor ping.
  if (provider === 'mock') {
    return {
      provider,
      model: 'mock',
      ok: false,
      latencyMs: 0,
      error: 'No AI provider configured. Set GLM_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.',
    }
  }

  const startedAt = Date.now()
  try {
    const res = await generateChat(
      event,
      {
        // Bare-minimum prompt: 1 token in, max 1 token out. Keeps the
        // monitor cheap.
        messages: [{ role: 'user', content: 'ping' }],
        temperature: 0,
        maxTokens: 1,
      },
      // No web search, no model override — exercise the default path.
      {},
    )
    return {
      provider: res.provider,
      model: res.model,
      ok: true,
      latencyMs: Date.now() - startedAt,
      // Echo the (truncated) response so a human eyeballing the JSON can
      // see the model is actually generating something rather than
      // returning empty. Bound to 80 chars so the payload stays small.
      content: (res.content ?? '').slice(0, 80),
    }
  } catch (e: unknown) {
    const latencyMs = Date.now() - startedAt
    if (e instanceof AIProviderError) {
      return {
        provider: e.provider,
        model: e.model,
        ok: false,
        latencyMs,
        status: e.status,
        error: e.providerMessage,
      }
    }
    return {
      provider,
      model: 'unknown',
      ok: false,
      latencyMs,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
})
