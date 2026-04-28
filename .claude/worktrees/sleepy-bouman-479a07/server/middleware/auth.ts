/**
 * Global server middleware: enforce auth on all /api/* routes except
 * the explicitly public paths below. Public list is conservative —
 * everything else requires a valid nuxt-auth-utils session.
 */
import { createError, getRequestURL, parseCookies } from 'h3'
import { log } from '~/server/utils/logger'

const PUBLIC_PATHS = new Set<string>([
  // Single OAuth entry point — handles both the initial click (302 to
  // Google) and the return hit (?code=). After success, setUserSession
  // sets the sealed cookie and we 302 to /projects.
  '/api/auth/callback',
  '/api/auth/logout',
  // Stripe webhook authenticates via signature instead of session cookie.
  '/api/billing/webhook',
  // Health check
  '/api/health',
  // Client log relay — must be reachable from unauthenticated pages
  // (/login) so we can capture auth failures.
  '/api/log',
])

const PUBLIC_PREFIXES = [
  // Invite token lookup is public (the token IS the proof of ownership).
  // Only GET /api/invites/:token is public; POST /accept is still protected.
  '/api/invites/',
]

/**
 * Paths that bypass our auth check entirely (any HTTP method, any sub-path).
 * Used for endpoints owned by libraries — they handle their own auth/empty
 * responses and our 401 would break them.
 */
const PUBLIC_PATH_PREFIXES = [
  // nuxt-auth-utils registers /api/_auth/session for client-side session
  // sync. It MUST return 200 with an empty body when unauthenticated, not
  // 401, otherwise useUserSession() on the client never resolves.
  '/api/_auth/',
]

function isPublicGetByPrefix(method: string, path: string): boolean {
  if (method !== 'GET') return false
  // Reject sub-paths like /api/invites/:token/accept
  return PUBLIC_PREFIXES.some((p) => {
    if (!path.startsWith(p)) return false
    const rest = path.slice(p.length)
    return rest.length > 0 && !rest.includes('/')
  })
}

function isPublicByPathPrefix(path: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => path.startsWith(p))
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const path = url.pathname
  const method = event.method ?? 'GET'

  // Only guard API routes
  if (!path.startsWith('/api/')) return
  if (PUBLIC_PATHS.has(path)) return
  if (isPublicByPathPrefix(path)) return
  if (isPublicGetByPrefix(method, path)) return

  const session = await getUserSession(event)
  if (!session?.user) {
    // Diagnostic: surface whether the cookie was even present so we can tell
    // "user not signed in" apart from "session cookie didn't make it here".
    const cookies = parseCookies(event)
    const hasSessionCookie = !!cookies['nuxt-session']
    log.warn('[middleware/auth]', 'Unauthenticated request', {
      path,
      method,
      has_session_cookie: hasSessionCookie,
      cookie_names: Object.keys(cookies),
    })
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Stash user on event.context so route handlers can read it without
  // re-decoding the session cookie. Shape matches H3EventContext['user']
  // declared in server/types/auth.d.ts.
  event.context.user = session.user
})
