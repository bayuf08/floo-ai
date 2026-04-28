/**
 * GET /api/auth/callback
 *
 * Single endpoint that drives the entire Google OAuth flow.
 *
 *   First hit  (no ?code=)         → 302 to https://accounts.google.com/...
 *   Return hit (?code=&state=)     → exchange code, validate id_token,
 *                                    upsert profiles row,
 *                                    setUserSession (sealed cookie),
 *                                    302 to /projects.
 *
 * Powered by `nuxt-auth-utils`, which handles the state cookie, the
 * code-for-tokens exchange, and the id_token signature verification.
 *
 * No Supabase Auth in the loop. The session lives in a sealed cookie
 * owned by nuxt-auth-utils; per-request authorization is enforced in
 * each route handler via requireUser() + assertWorkspaceMember /
 * assertProjectMember (see server/utils/authz.ts).
 */
import { z } from 'zod'
import { serviceSupabase } from '~/server/utils/supabase'
import { log } from '~/server/utils/logger'

const GoogleUser = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
})

/** Derive 1–2 char initials from a display name (e.g. "Rara Anjani" → "RA"). */
function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default defineOAuthGoogleEventHandler({
  // clientId / clientSecret are read by nuxt-auth-utils at request-time
  // from runtimeConfig.oauth.google (see nuxt.config.ts), which is
  // populated from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars.
  config: {
    scope: ['email', 'profile', 'openid'],
    authorizationParams: {
      access_type: 'offline',
      prompt: 'select_account',
    },
  },

  async onSuccess(event, { user, tokens }) {
    const parsed = GoogleUser.safeParse(user)
    if (!parsed.success) {
      log.error('[api/auth/callback]', 'Google user payload failed validation', {
        issues: parsed.error.issues,
      })
      return sendRedirect(event, '/login?error=bad_google_payload', 302)
    }

    const g = parsed.data
    log.info('[api/auth/callback]', 'Google OAuth success', {
      email: g.email,
      sub: g.sub,
      has_refresh_token: !!tokens.refresh_token,
    })

    // Diagnostic: confirm session.password AND service-role key are actually
    // loaded at runtime. An empty service-role key here was the silent culprit
    // that killed the cookie-set step before it ran (runtimeConfig auto-mapping
    // only reads `NUXT_*` env vars; .env had `SUPABASE_SERVICE_ROLE_KEY`).
    // nuxt-auth-utils session.password must be ≥32 chars.
    const cfg = useRuntimeConfig(event)
    log.info('[api/auth/callback]', 'Session config check', {
      session_password_length: (cfg.session?.password ?? '').length,
      cookie_name: (cfg.session as any)?.name ?? '(default)',
      service_role_key_length: (cfg.supabaseServiceRoleKey ?? '').length,
      supabase_url_set: !!cfg.public?.supabaseUrl,
      node_env: process.env.NODE_ENV,
    })

    // serviceSupabase() throws if NUXT_PUBLIC_SUPABASE_URL or the service-role
    // key are missing. Catch that loudly — without this, the throw bubbles
    // out of onSuccess uncaught (nuxt-auth-utils doesn't wrap onSuccess), the
    // response becomes a 500, and setUserSession never runs so the browser
    // never gets a session cookie.
    const name = g.name ?? g.email
    let supabase
    try {
      supabase = serviceSupabase(event)
    } catch (e) {
      log.error('[api/auth/callback]', 'serviceSupabase threw', {
        message: (e as any)?.message,
      })
      return sendRedirect(event, '/login?error=supabase_config', 302)
    }

    // Resolve-or-create the profile.
    //
    // The `profiles` table has TWO unique constraints: `google_sub` (added by
    // the 20260427000000 migration) AND `email` (from the original schema).
    // A naive `.upsert(..., { onConflict: 'google_sub' })` only covers the
    // first one, so the very first Google sign-in for a user whose row was
    // originally created via the old Supabase-Auth flow blows up with
    // 23505 / "duplicate key value violates unique constraint
    // profiles_email_key" — the row exists by email, but `google_sub` is
    // still NULL, so Postgres tries to INSERT a new row instead of updating
    // the existing one.
    //
    // Strategy:
    //   1. Look up by google_sub (returning user, fast path).
    //   2. If not found, look up by email (first sign-in after the
    //      auth-flow migration, or any case where email already exists
    //      without a sub yet).
    //   3. If a row was found either way, UPDATE it by id and backfill
    //      google_sub.
    //   4. Otherwise, INSERT a new row.
    //
    // Only overwrite google_refresh_token when Google actually returned
    // one — Google omits the refresh token on subsequent consents unless
    // we force prompt=consent.
    const baseFields: Record<string, unknown> = {
      google_sub: g.sub,
      email: g.email,
      name,
      avatar_url: g.picture ?? null,
      initials: deriveInitials(name),
    }
    if (tokens.refresh_token) {
      baseFields.google_refresh_token = tokens.refresh_token
    }

    log.info('[api/auth/callback]', 'About to resolve profile', { google_sub: g.sub, email: g.email })

    let profile: any
    let upsertErr: any
    try {
      // Step 1: by google_sub
      let existing = await supabase
        .from('profiles')
        .select('id')
        .eq('google_sub', g.sub)
        .maybeSingle()

      // Step 2: fall back to email (first-time backfill case)
      if (!existing.data && !existing.error) {
        existing = await supabase
          .from('profiles')
          .select('id')
          .eq('email', g.email)
          .maybeSingle()
      }

      if (existing.error) {
        upsertErr = existing.error
      } else if (existing.data?.id) {
        // Step 3: update the existing row (backfills google_sub if it was NULL).
        const result = await supabase
          .from('profiles')
          .update(baseFields)
          .eq('id', existing.data.id)
          .select('id, email, name, avatar_url, role')
          .single()
        profile = result.data
        upsertErr = result.error
      } else {
        // Step 4: brand-new user.
        const result = await supabase
          .from('profiles')
          .insert(baseFields)
          .select('id, email, name, avatar_url, role')
          .single()
        profile = result.data
        upsertErr = result.error
      }
    } catch (e) {
      // Network errors / thrown exceptions bypass the {error} return shape.
      log.error('[api/auth/callback]', 'Profile resolve THREW (not just errored)', {
        message: (e as any)?.message,
        stack: (e as any)?.stack,
      })
      return sendRedirect(event, '/login?error=upsert_threw', 302)
    }

    if (upsertErr || !profile) {
      log.error('[api/auth/callback]', 'profile upsert failed', {
        message: upsertErr?.message,
        code: (upsertErr as any)?.code,
        details: (upsertErr as any)?.details,
        hint: (upsertErr as any)?.hint,
      })
      return sendRedirect(event, '/login?error=profile_upsert_failed', 302)
    }

    log.info('[api/auth/callback]', 'Profile upserted', {
      profileId: profile.id,
      email: profile.email,
    })

    // Seal the session into an HttpOnly cookie. Subsequent requests
    // hit server/middleware/auth.ts which reads this and stashes the
    // user on event.context.user.
    try {
      await setUserSession(event, {
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          avatar_url: profile.avatar_url,
          role: profile.role ?? 'member',
        },
        googleSub: g.sub,
        loggedInAt: Date.now(),
      })
    } catch (e) {
      // setUserSession throws if NUXT_SESSION_PASSWORD (runtimeConfig.session.password)
      // is missing or shorter than 32 chars. Surface that loudly.
      log.error('[api/auth/callback]', 'setUserSession threw', {
        message: (e as any)?.message,
      })
      return sendRedirect(event, '/login?error=session_seal_failed', 302)
    }

    log.info('[api/auth/callback]', 'Session minted, redirecting to /projects')
    return sendRedirect(event, '/projects', 302)
  },

  onError(event, err) {
    log.error('[api/auth/callback]', 'OAuth handler error', {
      message: (err as any)?.message,
      stack: (err as any)?.stack,
    })
    return sendRedirect(event, '/login?error=oauth_failed', 302)
  },
})
