/**
 * Frontend auth composable.
 *
 * The OAuth flow is owned by the SERVER now (see
 * server/api/auth/callback.get.ts). The browser's only job is:
 *
 *   loginWithGoogle()  → window.location.href = '/api/auth/callback'
 *                        (server 302s to Google, Google sends user back,
 *                         server mints Supabase session cookie, server
 *                         302s to /projects)
 *   fetchProfile()     → GET /api/auth/me  (reads Supabase session cookie)
 *   logout()           → POST /api/auth/logout (clears cookies, /login)
 *
 * No more @supabase/ssr in the browser. No PKCE verifier to lose. The
 * old client-side flow is gone — see AUTH-DIRECT-GOOGLE-PLAN.md for the
 * rationale.
 */
import type { User } from '~/types/user'

export interface ProfileRow {
  id: string
  name: string
  email: string
  role: string
  avatar_url: string | null
  initials: string | null
  created_at: string
  updated_at: string
}

const profileState = () => useState<ProfileRow | null>('floo-profile', () => null)
const loadingState = () => useState<boolean>('floo-profile-loading', () => false)

export function useAuth() {
  const profile = profileState()
  const loading = loadingState()
  const isAuthenticated = computed(() => !!profile.value)

  /** Fetch the current profile from /api/auth/me. Idempotent. */
  async function fetchProfile(force = false): Promise<ProfileRow | null> {
    if (profile.value && !force) return profile.value
    loading.value = true
    try {
      // SSR cookie forwarding: $fetch on the server doesn't forward request
      // cookies by default. Without this, /api/auth/me gets called with no
      // cookie during the SSR pass and returns 401 — bouncing the user back
      // to /login even though the session cookie IS in the browser.
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
      const data = await $fetch<ProfileRow>('/api/auth/me', {
        credentials: 'include',
        headers,
      })
      profile.value = data
      // Mirror into legacy userStore so existing components keep working.
      const userStore = useUserStore()
      userStore.currentUser = profileToUser(data)
      return data
    } catch {
      profile.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  /** Kick off Google OAuth — server takes it from here. */
  function loginWithGoogle() {
    // Just navigate. The server handler at /api/auth/callback handles
    // the no-code case by 302ing to Google's consent screen.
    window.location.href = '/api/auth/callback'
  }

  /** Sign out and bounce to /login. */
  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } finally {
      profile.value = null
      await navigateTo('/login')
    }
  }

  return {
    profile,
    loading,
    isAuthenticated,
    fetchProfile,
    loginWithGoogle,
    logout,
  }
}

function profileToUser(p: ProfileRow): User {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role ?? 'member',
    initials: p.initials ?? deriveInitials(p.name),
    avatarUrl: p.avatar_url ?? undefined,
  }
}

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
