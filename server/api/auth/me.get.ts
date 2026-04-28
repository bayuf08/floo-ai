/**
 * GET /api/auth/me
 *
 * Returns the current user's profile row. The auth middleware has
 * already verified the session — we just hydrate the latest profile
 * fields from Postgres so name/avatar/role edits are reflected
 * immediately rather than only after a fresh sign-in.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { log } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  const u = requireUser(event)

  const supabase = serviceSupabase(event)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, avatar_url, initials, created_at, updated_at')
    .eq('id', u.id)
    .single()

  if (error) {
    // 42P01 — table doesn't exist. Almost always means the migrations
    // weren't applied yet.
    if (error.code === '42P01') {
      log.error('[api/auth/me]', 'profiles table does not exist', { userId: u.id })
      throw createError({
        statusCode: 500,
        statusMessage:
          'Database not initialized — run `supabase db push` to apply the migrations under supabase/migrations/.',
      })
    }
    // PGRST116 — single() returned 0 rows. The session points at a
    // profile that no longer exists; force a re-login.
    if (error.code === 'PGRST116') {
      log.warn('[api/auth/me]', 'No profile row for session user', { userId: u.id })
      await clearUserSession(event)
      throw createError({ statusCode: 401, statusMessage: 'Profile no longer exists. Please sign in again.' })
    }
    log.error('[api/auth/me]', 'Failed to fetch profile', { userId: u.id, code: error.code, error: error.message })
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  log.info('[api/auth/me]', 'Profile fetched', { userId: u.id, email: data.email })
  return data
})
