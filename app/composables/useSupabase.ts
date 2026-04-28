/**
 * REMOVED — there is no browser-side Supabase client.
 *
 * Auth lives in the Nuxt server (server/api/auth/callback.get.ts via
 * nuxt-auth-utils). Data access from the browser goes through the
 * /api/* routes, which use the service-role Supabase client on the
 * server (server/utils/supabase.ts).
 *
 * This stub stays only because Nuxt auto-imports composables — if any
 * stale call site survives, it throws clearly instead of returning a
 * broken client.
 */
export function useSupabase(): never {
  throw new Error(
    'useSupabase() has been removed. Auth is server-side via nuxt-auth-utils; ' +
    'all data access should go through /api/* routes.',
  )
}
