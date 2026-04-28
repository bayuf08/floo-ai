# Direct Google OAuth in Nuxt — Implementation Plan

> Replaces Supabase Auth with a Nuxt-native Google OAuth flow. Supabase
> stays in the project for database/storage only (via the service-role
> key on the server). After three failed iterations chasing the
> `@supabase/ssr` PKCE-verifier-missing bug, the cleanest fix is to take
> auth off Supabase entirely.

---

## Why this works

`@supabase/ssr` couples Auth to its own opinionated cookie/PKCE machinery.
The 4th-iteration diagnostic (2026-04-27) proved the verifier was never
written to *any* storage — neither cookies nor localStorage — despite our
explicit handler. The library is fighting us, and we don't actually need
its Auth piece.

By owning the OAuth flow ourselves we:

- Eliminate the verifier-persistence problem (we control storage end-to-end).
- Simplify the architecture: Auth is one Nuxt server route; Supabase is
  pure data layer.
- Keep one source of truth for sessions — an HttpOnly cookie issued by
  our own server, no browser/firewall edge cases.

Trade-off: we own the `users` table, the session signing, and the
refresh logic. ~150 LOC total, all server-side, no third-party PKCE
abstraction in the way.

---

## Architecture

```
┌─────────┐  click "Continue with Google"
│ Browser │──────────────► /api/auth/login/google
└─────────┘                ─────────────────────
                                  │
                                  │ 302 to https://accounts.google.com/o/oauth2/auth?…
                                  ▼
                           ┌───────────┐
                           │  Google   │  user signs in / consents
                           └───────────┘
                                  │
                                  │ 302 to /api/auth/callback?code=…&state=…
                                  ▼
                          ┌─────────────────────────────────┐
                          │ Nuxt server                     │
                          │  1. validate state cookie       │
                          │  2. POST /token to Google       │
                          │  3. verify id_token (RS256)     │
                          │  4. upsert profiles row         │
                          │  5. issue HttpOnly session JWT  │
                          │  6. 302 to /projects            │
                          └─────────────────────────────────┘
                                  │
                                  ▼
                           ┌─────────┐
                           │ Browser │  session cookie set, app loads
                           └─────────┘
```

No browser-side OAuth code, no PKCE verifier to lose. State protection
via a short-lived HttpOnly cookie set on `/api/auth/login/google` and
verified on `/api/auth/callback`.

---

## Choice point: library

Two paths. **Recommendation: `nuxt-auth-utils`** — it's exactly this
flow, ~10 lines of config, well maintained by the Nuxt team.

| Approach | LOC | Pros | Cons |
|---|---|---|---|
| **`nuxt-auth-utils`** | ~30 | Battle-tested. Built-in Google provider. Built-in session helpers (`getUserSession`, `requireUserSession`, `setUserSession`). Sealed cookies (iron-session style). | Opinionated session shape (extendable). One more dep. |
| **Hand-rolled with `google-auth-library` + `jose`** | ~150 | Full control. Zero new deps beyond the JWT verifier. | We re-implement state, PKCE, JWT signing, session cookie ourselves. More surface for bugs. |

The rest of this plan assumes `nuxt-auth-utils`. If you want hand-rolled
instead, say so and I'll rewrite the steps.

---

## Plan — step by step

### 1. Google Cloud — adjust the OAuth client (≈2 min)

Same OAuth client we already have (`22951285233-…apps.googleusercontent.com`).
Only the redirect URI changes — Google now redirects directly to our
Nuxt server instead of via Supabase.

**Authorized redirect URIs** — replace existing entries with:

```
http://localhost:3000/api/auth/callback        ← dev
https://floo-content.com/api/auth/callback     ← prod (when you ship)
```

You can leave the Supabase callback URI in place for now — it just
becomes unused. Removing it is fine too.

**Authorized JavaScript origins** — add:

```
http://localhost:3000
https://floo-content.com
```

Nothing else changes (client ID, client secret, branding, audience all
stay).

### 2. Supabase dashboard — disable Google provider (≈30 sec)

Authentication → Sign In / Providers → Google → toggle **off**. We're
not using it anymore. The Supabase project stays for DB + Storage; only
its Auth half is unused.

You can also clear the **Redirect URLs** allow list — those entries
were for the old flow.

### 3. Install `nuxt-auth-utils`

```bash
bunx nuxi module add auth-utils
```

This adds `nuxt-auth-utils` to `nuxt.config.ts` modules and to
`package.json`. No further config needed in nuxt.config.

### 4. Environment variables — `.env` (NO NEW VARS NEEDED)

You already have all three:

```bash
GOOGLE_CLIENT_ID=...        # already in your .env (line 28 of .env.example)
GOOGLE_CLIENT_SECRET=...    # already in your .env (line 29)
SESSION_SECRET=...          # already in your .env (line 99)
```

These are already wired into `runtimeConfig` as `googleClientId`,
`googleClientSecret`, and `sessionSecret` (see `nuxt.config.ts` lines
58, 59, 75). We'll reuse those existing slots instead of introducing
new `NUXT_OAUTH_GOOGLE_*` variants.

**Action: just verify `SESSION_SECRET` in your `.env` is at least 32
characters of random data.** If it's still the placeholder
`a-long-random-string-for-session-encryption` from `.env.example`,
regenerate it once with:

```bash
openssl rand -base64 32
```

That's the only env-side change.

### 5. Wire existing runtimeConfig keys for `nuxt-auth-utils`

We reuse the env vars and runtimeConfig keys you already have — no
new `NUXT_OAUTH_*` variants. Two pieces of wiring:

**OAuth credentials → passed explicitly to the handler.** No
`nuxt.config.ts` edit needed; the handler in step 6 pulls
`useRuntimeConfig().googleClientId` / `googleClientSecret` directly.

**Session password → must live at `runtimeConfig.session.password`** —
`nuxt-auth-utils`'s `setUserSession` / `getUserSession` read this slot
with no per-call override. Add this nested key in `nuxt.config.ts`,
populated from your existing `SESSION_SECRET` env var:

```ts
runtimeConfig: {
  // … all existing keys stay exactly as they are …
  sessionSecret: '',                  // SESSION_SECRET (existing — leave alone)

  // New: nuxt-auth-utils reads this. Aliased from the same env var.
  session: {
    password: process.env.SESSION_SECRET || '',
  },
},
```

That's the *only* nuxt.config.ts edit. Everything else stays.

### 6. New endpoint — `server/api/auth/google.get.ts`

Initiates the OAuth dance. `nuxt-auth-utils` provides
`oauthGoogleEventHandler` which handles state, PKCE, the redirect to
Google, the callback exchange, and the ID-token verification — all in
one event handler.

```ts
// server/api/auth/google.get.ts
import { z } from 'zod'
import { serverSupabaseAdmin } from '~/server/utils/supabase'

const GoogleUser = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
})

export default defineOAuthGoogleEventHandler({
  // Pull credentials from our existing runtimeConfig keys instead of
  // forcing new NUXT_OAUTH_* env vars.
  config: {
    clientId: useRuntimeConfig().googleClientId,
    clientSecret: useRuntimeConfig().googleClientSecret,
    scope: ['email', 'profile', 'openid'],
    authorizationParams: { access_type: 'offline', prompt: 'select_account' },
  },

  async onSuccess(event, { user, tokens }) {
    const parsed = GoogleUser.parse(user)

    // Upsert into our profiles table (existing schema). We already have
    // the table from the Supabase migration; this just becomes a server-
    // side write using the service-role key.
    const supabase = serverSupabaseAdmin()
    const { data: profile, error } = await supabase
      .from('profiles')
      .upsert({
        google_sub: parsed.sub,
        email: parsed.email,
        name: parsed.name ?? parsed.email,
        avatar_url: parsed.picture ?? null,
      }, { onConflict: 'google_sub' })
      .select()
      .single()

    if (error || !profile) {
      throw createError({ statusCode: 500, statusMessage: 'Profile upsert failed' })
    }

    // Seal session into HttpOnly cookie.
    await setUserSession(event, {
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        avatar_url: profile.avatar_url,
        role: profile.role,
      },
      // Optional: keep the Google refresh token if we ever need to call
      // Google APIs on behalf of the user later. Not used today.
      googleRefreshToken: tokens.refresh_token ?? null,
    })

    return sendRedirect(event, '/projects')
  },

  onError(event, err) {
    console.error('[auth/google] failure', err)
    return sendRedirect(event, '/login?error=oauth_failed')
  },
})
```

The endpoint serves *both* the initiating redirect and the callback,
controlled by whether `?code=` is present. `nuxt-auth-utils` handles
that internally.

### 6. Update — `server/api/auth/me.get.ts`

Replace the Supabase-session check with `requireUserSession`:

```ts
// server/api/auth/me.get.ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return user
})
```

That's the whole file. The session cookie is read, validated, and
unwrapped inside `requireUserSession` — 401s on missing/expired.

### 7. Update — `server/api/auth/logout.post.ts`

```ts
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
```

### 8. Update — `server/middleware/auth.ts`

Replace the `serverSupabase(event).auth.getUser()` check with:

```ts
import { getUserSession } from '#auth-utils'   // alias provided by the module

const session = await getUserSession(event)
if (!session?.user) {
  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}
event.context.user = session.user
```

The PUBLIC_PATHS list shrinks: drop `/api/auth/callback` and
`/api/auth/set-session` (gone), keep `/api/auth/google` (single
public entry point now), keep webhook/health/log/invites.

### 9. Frontend — `app/composables/useAuth.ts`

Goes from ~130 LOC to ~40. No more browser-side Supabase, no more PKCE.

```ts
export function useAuth() {
  const profile = useState<ProfileRow | null>('floo-profile', () => null)
  const isAuthenticated = computed(() => !!profile.value)

  async function fetchProfile(force = false) {
    if (profile.value && !force) return profile.value
    try {
      profile.value = await $fetch<ProfileRow>('/api/auth/me')
      return profile.value
    } catch {
      profile.value = null
      return null
    }
  }

  function loginWithGoogle() {
    // Just navigate — server handles everything from here.
    window.location.href = '/api/auth/google'
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    profile.value = null
    await navigateTo('/login')
  }

  return { profile, isAuthenticated, fetchProfile, loginWithGoogle, logout }
}
```

### 10. Frontend — `app/composables/useSupabase.ts`

Either delete it (if nothing else references the browser-side client),
or strip it down to data-only with anon key — no auth, no cookies
handler. Most likely we just delete it; all DB reads should now go
through API routes anyway.

### 11. Database — schema tweak (one short migration)

Our existing `profiles` table currently keys off Supabase's `auth.users`
UUID. We need a stable join key for Google's `sub`:

```sql
-- supabase/migrations/0007_profiles_google_sub.sql
alter table profiles add column if not exists google_sub text unique;
```

Existing user rows can stay; new sign-ups populate `google_sub`. Drop
the FK to `auth.users` in a follow-up migration once we're confident
nothing else depends on it.

### 12. Delete obsolete files

- `app/pages/auth/callback.vue` — no longer hit; Google redirects to
  `/api/auth/callback` (server) instead of `/auth/callback` (page).
- `server/api/auth/set-session.post.ts` — bridge endpoint no longer needed.
- `server/api/auth/login/google.post.ts` if it exists — replaced by
  `/api/auth/google`.

### 13. Test

Sign in once. Expected log shape (much shorter than today's):

```
GET  /api/auth/google           → 302 to accounts.google.com
GET  /api/auth/google?code=…    → 302 to /projects, session cookie set
GET  /api/auth/me               → 200 { id, email, name, … }
```

No more PKCE verifier in the picture at all.

### 14. (Later) — clean up Supabase Auth

Once direct OAuth is verified working in dev and prod, you can:

- Remove `@supabase/ssr` from package.json (not just stop importing it —
  uninstall it).
- Drop the `auth.users` foreign key from `profiles`.
- Delete the unused Google provider config in the Supabase dashboard.

---

## What you actually need to do

**On your end (manual, ≈2 min — no new env vars):**

1. **Google Cloud Console** → Auth Platform → Clients → your Web client → Authorized redirect URIs. Replace existing entries with `http://localhost:3000/api/auth/callback`. Save.
2. **Supabase Dashboard** → Authentication → Sign In / Providers → Google → toggle **off**. Save.
3. **Verify your existing `.env` has these three** (already documented in `.env.example`):
   - `GOOGLE_CLIENT_ID` — populated from Google Cloud
   - `GOOGLE_CLIENT_SECRET` — populated from Google Cloud
   - `SESSION_SECRET` — at least 32 chars of random data. If it's still the placeholder from `.env.example`, regenerate once with `openssl rand -base64 32`.
4. Tell me you're done.

**On my end (when you confirm):**

- Steps 3 (install module), 5–12 (code edits and migration).
- Verify-pass at step 13.
- Then we test end-to-end together.

---

*Drafted: 2026-04-27. Replaces AUTH-PKCE-FIX-PLAN.md.*
