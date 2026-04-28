/**
 * Global route guard. Every route except a small whitelist requires a
 * valid Supabase session. Unauthenticated visitors are bounced to /login.
 */

const PUBLIC_ROUTES = new Set<string>([
  '/login',
  '/auth/callback', // OAuth callback — must be public so Google can redirect here pre-session
])

const PUBLIC_PREFIXES = [
  // Invitation acceptance pages — viewable signed-out so the link lands somewhere
  '/invite/',
]

export default defineNuxtRouteMiddleware(async (to) => {
  // Allow public routes through
  if (PUBLIC_ROUTES.has(to.path)) return
  if (PUBLIC_PREFIXES.some((p) => to.path.startsWith(p))) return

  // On the server, the cookie is read by the API; on the client we hit /api/auth/me
  const { profile, fetchProfile } = useAuth()

  // If we already know the user, allow.
  if (profile.value) return

  // Try to hydrate the profile from the session cookie.
  const me = await fetchProfile()
  if (!me) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
