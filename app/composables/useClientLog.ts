/**
 * Browser-side log relay.
 *
 * Mirrors entries to console.* (so they're visible in DevTools) AND POSTs
 * to /api/log so they land in the server's logs/app.log file. Use this for
 * any error path the user might want to reproduce or audit later.
 *
 * Usage:
 *   const log = useClientLog()
 *   log.error('[client/auth/callback]', 'exchangeCodeForSession failed', { code, err })
 *   log.info ('[client/auth/login]',     'redirecting to Google consent')
 *
 * Errors are sent with `keepalive: true` so they survive a page navigation
 * (e.g. when we log right before router.replace('/login')).
 */
type Level = 'info' | 'warn' | 'error' | 'debug'

async function send(level: Level, context: string, message: string, data?: unknown) {
  // Console mirror — keeps the existing dev workflow working.
  const consoleFn =
    level === 'error' ? console.error :
    level === 'warn'  ? console.warn  :
    level === 'debug' ? console.debug :
    console.log
  consoleFn(`[${level.toUpperCase()}] ${context}`, message, data ?? '')

  // Server file — best-effort, never throws.
  if (typeof window === 'undefined') return
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({
        level,
        context,
        message,
        data: serialize(data),
      }),
    })
  } catch {
    // Drop on the floor — logging must never break the app.
  }
}

/** JSON-safe serialization. Drops circular refs, flattens Errors. */
function serialize(input: unknown): unknown {
  if (input === undefined || input === null) return input
  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack,
    }
  }
  try {
    // Round-trip to drop functions / undefined / circular refs.
    return JSON.parse(JSON.stringify(input))
  } catch {
    return String(input)
  }
}

export function useClientLog() {
  return {
    info:  (context: string, message: string, data?: unknown) => send('info',  context, message, data),
    warn:  (context: string, message: string, data?: unknown) => send('warn',  context, message, data),
    error: (context: string, message: string, data?: unknown) => send('error', context, message, data),
    debug: (context: string, message: string, data?: unknown) => send('debug', context, message, data),
  }
}
