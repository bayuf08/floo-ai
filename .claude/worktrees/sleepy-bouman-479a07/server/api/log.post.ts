/**
 * POST /api/log
 *
 * Client → server log relay. The browser uses this to push diagnostic events
 * into the server's logs/app.log file. Writes through the same `log.*`
 * helpers as the rest of the server so client + server entries interleave
 * in chronological order.
 *
 * This route is intentionally PUBLIC (whitelisted in server/middleware/auth.ts)
 * because we need to be able to report auth failures from unauthenticated
 * pages like /login and /auth/callback.
 *
 * Body shape:
 *   {
 *     level:   'info' | 'warn' | 'error' | 'debug'
 *     context: string                    // e.g. '[client/auth/callback]'
 *     message: string
 *     data?:   unknown                   // anything JSON-serializable
 *   }
 */
import { z } from 'zod'
import { log } from '~/server/utils/logger'

const Schema = z.object({
  level: z.enum(['info', 'warn', 'error', 'debug']).default('info'),
  context: z.string().min(1).max(120).default('[client]'),
  message: z.string().min(1).max(2000),
  data: z.unknown().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    log.warn('[api/log]', 'Invalid log payload', {
      issues: parsed.error.flatten(),
      received: body,
    })
    throw createError({ statusCode: 400, statusMessage: 'Invalid log payload' })
  }

  const { level, context, message, data } = parsed.data

  // Augment with a few request-scoped fields so we can correlate with the
  // user's browser session.
  const userAgent = getRequestHeader(event, 'user-agent') ?? null
  const referer = getRequestHeader(event, 'referer') ?? null
  const augmented = {
    ...((data && typeof data === 'object') ? data as Record<string, unknown> : {}),
    _ua: userAgent,
    _referer: referer,
  }

  log[level](context, message, augmented)

  return { ok: true }
})
