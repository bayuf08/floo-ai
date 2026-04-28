/**
 * Supabase client — service-role only.
 *
 * Auth has moved out of Supabase entirely (see server/api/auth/callback.get.ts
 * and server/middleware/auth.ts). The Nuxt server holds the session,
 * identifies the user from the sealed cookie, and uses the service-role
 * Supabase client for every DB and Storage call.
 *
 * Authorization (membership / ownership checks) lives in the route
 * handlers via `requireUser(event)` + the assertions in
 * `server/utils/authz.ts`. RLS is intentionally not used — see
 * supabase/migrations/20260427000000_drop_auth_users_dep.sql.
 */
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Service-role Supabase client. Bypasses RLS. Cached across requests.
 * Use for every DB and Storage interaction from the server.
 */
export function serviceSupabase(event?: H3Event): SupabaseClient {
  if (_client) return _client
  const config = useRuntimeConfig(event)
  const url = config.public.supabaseUrl
  const serviceKey = config.supabaseServiceRoleKey
  if (!url || !serviceKey) {
    throw createError({
      statusCode: 500,
      statusMessage:
        'NUXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required.',
    })
  }
  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

/**
 * Shape of the user object the auth middleware stashes on
 * event.context.user (mirrors the User shape declared in
 * server/types/auth.d.ts).
 */
export interface SessionUser {
  id: string
  email: string
  name: string
  avatar_url: string | null
  role: string
}

/**
 * Throws 401 if the request has no authenticated user attached by
 * server/middleware/auth.ts. Returns the session user otherwise.
 */
export function requireUser(event: H3Event): SessionUser {
  const u = event.context.user as SessionUser | undefined
  if (!u || !u.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return u
}
