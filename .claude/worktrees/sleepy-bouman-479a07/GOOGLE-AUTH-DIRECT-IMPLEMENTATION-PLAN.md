# Google Auth — Direct Nuxt ↔ Google Implementation Plan

> **Goal.** Authenticate users with Google directly from the Nuxt server.
> Drop Supabase Auth entirely. Keep Supabase Postgres + Storage as the
> data layer.
>
> **Drafted:** 2026-04-27. Supersedes `AUTH-DIRECT-GOOGLE-PLAN.md`,
> which described the same target architecture but didn't account for
> the RLS / `auth.uid()` dependency that breaks the moment Supabase Auth
> is removed.

---

## 1 — Where we are right now

`nuxt-auth-utils` is already installed (`package.json` ✅) and registered
in `nuxt.config.ts` (✅). `runtimeConfig.oauth.google` and
`runtimeConfig.session.password` are wired from the existing
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SESSION_SECRET` env
vars (✅). The OAuth event handler exists at
`server/api/auth/callback.get.ts` (✅).

**What's still wrong:** that handler does *not* call
`setUserSession`. Instead, on `onSuccess` it hands `tokens.id_token`
to `supabase.auth.signInWithIdToken`, which mints a Supabase session
cookie. Every server route then reads that cookie via
`serverSupabase(event)` and relies on Postgres RLS (`auth.uid()`) to
scope queries.

So the literal "swap auth, keep DB" task is two coupled changes:

1. **Auth swap.** Replace the `signInWithIdToken` call with
   `setUserSession`. The session lives in a sealed cookie owned by
   nuxt-auth-utils — no Supabase JWT in the picture.
2. **Authorization swap.** Move per-row authorization from RLS
   (`auth.uid()`) to **app-level checks in each server route**, using
   the Supabase service-role client. RLS goes away because the queries
   no longer carry a Supabase user JWT.

Item 2 is the part the previous plan glossed over. It's the larger
piece of work — a one-time pass through ~30 server routes — but the
pattern is mechanical.

---

## 2 — Target architecture

```
┌─────────┐  click "Continue with Google"
│ Browser │──────────────► /api/auth/callback
└─────────┘                ─────────────────────
                                  │
                                  │ 302 to accounts.google.com  (no ?code=)
                                  ▼
                           ┌───────────┐
                           │  Google   │  user signs in / consents
                           └───────────┘
                                  │
                                  │ 302 back to /api/auth/callback?code=…
                                  ▼
                          ┌─────────────────────────────────────┐
                          │ Nuxt server                         │
                          │  1. nuxt-auth-utils handles state,  │
                          │     code exchange, id_token verify  │
                          │  2. upsert profiles row by          │
                          │     google_sub (service-role)       │
                          │  3. setUserSession(event, …)        │
                          │  4. 302 to /projects                │
                          └─────────────────────────────────────┘
                                  │
                                  ▼
                           ┌─────────┐
                           │ Browser │  encrypted session cookie set
                           └─────────┘

For every subsequent /api/* request:
  • middleware reads getUserSession(event) → event.context.user = { id, email, … }
  • route handlers call serviceSupabase() (admin client, no JWT)
    and check `event.context.user.id` against the row themselves.
```

**Roles.** Supabase becomes pure Postgres + Storage, accessed only via
the service role from the Nuxt server. No anon key in the browser. No
RLS. No `auth.users` table involved.

---

## 3 — Decisions locked in

| # | Decision | Rationale |
|---|---|---|
| 1 | **Auth library: `nuxt-auth-utils`** | Already installed, handles state/code-exchange/id_token verify, sealed cookies. ~30 LOC of our code. |
| 2 | **Supabase: DB + Storage only** | Keep all 6 migrations and the table shape. Drop Supabase Auth (`auth.users`, `auth.uid()`). |
| 3 | **Session storage: nuxt-auth-utils sealed cookie** | No Redis, no sessions table. Scales horizontally on Vercel. `SESSION_SECRET` signs it. |
| 4 | **Refresh tokens: stored on `profiles`** | We already request `access_type=offline`. Persist `google_refresh_token` so future Gmail/Drive/YouTube features can call Google APIs without re-prompt. |
| 5 | **Authorization model: app-level, not RLS** | Once Supabase Auth is gone, `auth.uid()` is NULL. Every server route uses `serviceSupabase()` and checks membership/ownership in code. RLS policies are dropped (or kept as defense-in-depth — see §7). |

---

## 4 — Manual steps you need to do (≈3 min)

### 4.1 Google Cloud Console

Auth Platform → Clients → your Web client → **Authorized redirect URIs**. Make sure these are present:

```
http://localhost:3000/api/auth/callback        ← dev
https://<your-prod-domain>/api/auth/callback   ← prod (when you ship)
```

Remove the old Supabase callback (`https://*.supabase.co/auth/v1/callback`) once the new flow is verified.

### 4.2 Supabase Dashboard

Authentication → Providers → Google → toggle **off**. Clear the Redirect URLs allow-list. Supabase Auth is no longer used.

### 4.3 `.env` sanity check

Already configured. Just verify `SESSION_SECRET` is real (not the `.env.example` placeholder). If it's still `a-long-random-string-for-session-encryption`, regenerate:

```bash
openssl rand -base64 32
```

No new env vars are needed.

---

## 5 — Code changes (in dependency order)

### 5.1 Database migration — `supabase/migrations/20260427000000_drop_auth_users_dep.sql`

Single migration that frees the schema from Supabase Auth.

```sql
-- 1. Add google_sub as the new identity column on profiles.
alter table public.profiles
  add column if not exists google_sub text unique,
  add column if not exists google_refresh_token text;

-- 2. Profiles.id used to FK to auth.users(id). Drop that FK and let
--    profiles own its own UUID.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  alter column id set default gen_random_uuid();

-- 3. Drop the on_auth_user_created trigger and its function — we
--    insert profiles ourselves from the Nuxt server now.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 4. Drop every RLS policy that references auth.uid() / auth.users.
--    Authorization moves to the application layer (see §6 of the plan).
--    We keep RLS *enabled* on each table but with no policies, then
--    grant the service role bypass — service-role connections from the
--    Nuxt server already bypass RLS, so this is purely defense-in-depth.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
```

**Why drop the FK to `auth.users`:** the `handle_new_user` trigger
fired on `auth.users` insert. With Supabase Auth gone, no rows ever
land in `auth.users` and the FK becomes a permanent insertion blocker
on `profiles`.

**Existing rows** (if any) keep their UUIDs untouched. The next time
those users sign in, `google_sub` is backfilled in the upsert path
(§5.3).

### 5.2 Server util — `server/utils/supabase.ts`

Strip down to the service-role client only. The SSR client is no longer
useful (no Supabase session to wrap).

```ts
// server/utils/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { createError } from 'h3'

let _client: SupabaseClient | null = null

/**
 * Service-role Supabase client. Bypasses RLS. Cached across requests.
 * Authorization is enforced in route handlers — see §6 of the plan.
 */
export function serviceSupabase(event?: H3Event): SupabaseClient {
  if (_client) return _client
  const config = useRuntimeConfig(event)
  const url = config.public.supabaseUrl
  const serviceKey = config.supabaseServiceRoleKey
  if (!url || !serviceKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required.',
    })
  }
  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

/** Throws 401 if the request has no session user. */
export function requireUser(event: H3Event) {
  const u = event.context.user
  if (!u) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return u as { id: string; email: string; name: string; avatar_url: string | null; role: string }
}
```

> Drop the `serverSupabase()` export. Keep `serviceSupabase()` and add
> `requireUser()` as the standard auth helper for route handlers.

### 5.3 Replace — `server/api/auth/callback.get.ts`

```ts
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

export default defineOAuthGoogleEventHandler({
  config: {
    scope: ['email', 'profile', 'openid'],
    authorizationParams: {
      access_type: 'offline',
      prompt: 'select_account',
    },
  },

  async onSuccess(event, { user, tokens }) {
    const parsed = GoogleUser.parse(user)

    const supabase = serviceSupabase(event)
    const { data: profile, error } = await supabase
      .from('profiles')
      .upsert(
        {
          google_sub: parsed.sub,
          email: parsed.email,
          name: parsed.name ?? parsed.email,
          avatar_url: parsed.picture ?? null,
          // Only overwrite the refresh token when Google actually returns one.
          // (Google omits it on subsequent consents unless prompt=consent.)
          ...(tokens.refresh_token ? { google_refresh_token: tokens.refresh_token } : {}),
        },
        { onConflict: 'google_sub' },
      )
      .select('id, email, name, avatar_url, role')
      .single()

    if (error || !profile) {
      log.error('[api/auth/callback]', 'profile upsert failed', { error: error?.message })
      return sendRedirect(event, '/login?error=profile_upsert_failed', 302)
    }

    await setUserSession(event, {
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        avatar_url: profile.avatar_url,
        role: profile.role ?? 'member',
      },
      // Google sub is useful for debugging / re-issuing tokens later.
      googleSub: parsed.sub,
      loggedInAt: Date.now(),
    })

    return sendRedirect(event, '/projects', 302)
  },

  onError(event, err) {
    log.error('[api/auth/callback]', 'OAuth handler error', {
      message: (err as any)?.message,
    })
    return sendRedirect(event, '/login?error=oauth_failed', 302)
  },
})
```

### 5.4 Replace — `server/api/auth/me.get.ts`

```ts
import { serviceSupabase } from '~/server/utils/supabase'
import { requireUser } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const u = requireUser(event)
  // We could return the session.user as-is, but pulling fresh from DB
  // keeps name/avatar/role in sync after profile edits.
  const supabase = serviceSupabase(event)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, avatar_url, initials, created_at, updated_at')
    .eq('id', u.id)
    .single()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
```

### 5.5 Replace — `server/api/auth/logout.post.ts`

```ts
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
```

### 5.6 Replace — `server/middleware/auth.ts`

```ts
import { createError, getRequestURL } from 'h3'
import { getUserSession } from '#auth-utils'

const PUBLIC_PATHS = new Set<string>([
  '/api/auth/callback',          // OAuth entry + callback
  '/api/auth/logout',
  '/api/billing/webhook',        // Stripe — signature-authed
  '/api/health',
  '/api/log',
])

const PUBLIC_PREFIXES = ['/api/invites/']

function isPublicGetByPrefix(method: string, path: string): boolean {
  if (method !== 'GET') return false
  return PUBLIC_PREFIXES.some((p) => {
    if (!path.startsWith(p)) return false
    const rest = path.slice(p.length)
    return rest.length > 0 && !rest.includes('/')
  })
}

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  const method = event.method ?? 'GET'

  if (!path.startsWith('/api/')) return
  if (PUBLIC_PATHS.has(path)) return
  if (isPublicGetByPrefix(method, path)) return

  const session = await getUserSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  event.context.user = session.user
})
```

### 5.7 Delete — obsolete files

| Path | Why |
|---|---|
| `server/api/auth/login/google.post.ts` | Already marked deprecated. The flow has a single entry point now. |
| `server/api/auth/set-session.post.ts` | Already marked deprecated. PKCE bridge is gone. |
| `app/pages/auth/callback.vue` | Already marked deprecated. Google redirects to the *server* route now. |
| `app/composables/useSupabase.ts` | Already a stub that throws. Clear it out. |

### 5.8 Frontend — `app/composables/useAuth.ts`

The current file is mostly correct. Two small tweaks:

- The `loginWithGoogle()` URL stays `/api/auth/callback` (works with both naming choices since the handler IS at `/api/auth/callback`).
- `fetchProfile` already shape-matches the new server response — no change needed.

The mirror into `useUserStore().currentUser` keeps the existing UI components working unchanged.

### 5.9 Type augmentation — `server/types/auth.d.ts`

So `event.context.user` has the right shape everywhere.

```ts
// server/types/auth.d.ts
declare module 'h3' {
  interface H3EventContext {
    user?: {
      id: string
      email: string
      name: string
      avatar_url: string | null
      role: string
    }
  }
}

// nuxt-auth-utils session shape
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    avatar_url: string | null
    role: string
  }
  interface UserSession {
    googleSub?: string
    loggedInAt?: number
  }
}

export {}
```

---

## 6 — App-level authorization (the part the old plan missed)

Every server route used to lean on RLS to scope rows. Now each route
has to do its own membership / ownership check. The pattern:

```ts
// Example: server/api/workspaces/index.get.ts (BEFORE)
const supabase = serverSupabase(event)
const { data, error } = await supabase
  .from('workspaces')
  .select('id, name, …, workspace_members!inner(role)')   // RLS scopes this
  .order('created_at', { ascending: true })
```

```ts
// AFTER
const u = requireUser(event)
const supabase = serviceSupabase(event)
const { data, error } = await supabase
  .from('workspaces')
  .select('id, name, …, workspace_members!inner(role)')
  .eq('workspace_members.user_id', u.id)                  // explicit scope
  .order('created_at', { ascending: true })
```

Three categories of route, and what each needs:

| Category | Authorization rule | Helper |
|---|---|---|
| **Workspace-scoped** (`/api/workspaces/[id]/…`) | Caller must be a member of the workspace. | `assertWorkspaceMember(supabase, workspaceId, userId)` |
| **Project-scoped** (`/api/projects/[id]/…`) | Caller must be a member of the project (or of the parent workspace, depending on existing rules). | `assertProjectMember(supabase, projectId, userId)` |
| **User-scoped** (`/api/auth/me`, `/api/auth/avatar`, `/api/invites` listing) | Just `requireUser(event)`. | — already covered. |

Add a small `server/utils/authz.ts` for the assertion helpers so the
pattern stays one line per route:

```ts
// server/utils/authz.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'h3'

export async function assertWorkspaceMember(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<{ role: string }> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return data
}

export async function assertProjectMember(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<{ role: string }> {
  const { data, error } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return data
}
```

Then each route becomes:

```ts
const u = requireUser(event)
const supabase = serviceSupabase(event)
await assertWorkspaceMember(supabase, workspaceId, u.id)
// … original query …
```

**Routes to touch (≈30 files).** Group them by category and walk
through them in one sitting:

```
server/api/workspaces/[id].get.ts
server/api/workspaces/[id].patch.ts
server/api/workspaces/[id].delete.ts
server/api/workspaces/[id]/members.post.ts
server/api/workspaces/[id]/members/[uid].delete.ts
server/api/workspaces/[id]/members/[uid].patch.ts
server/api/projects/index.get.ts
server/api/projects/index.post.ts
server/api/projects/[id].get.ts
server/api/projects/[id].patch.ts
server/api/projects/[id].delete.ts
server/api/projects/[id]/duplicate.post.ts
server/api/projects/[id]/context.patch.ts
server/api/projects/[id]/context/template.post.ts
server/api/projects/[id]/members.get.ts
server/api/projects/[id]/members.post.ts
server/api/projects/[id]/members/[uid].patch.ts
server/api/projects/[id]/members/[uid].delete.ts
server/api/projects/[id]/skills.get.ts
server/api/projects/[id]/skills.post.ts
server/api/projects/[id]/assets.get.ts
server/api/projects/[id]/assets.post.ts
server/api/projects/[id]/assets/[assetId].patch.ts
server/api/projects/[id]/assets/[assetId].delete.ts
server/api/projects/[id]/messages.get.ts
server/api/projects/[id]/messages.post.ts
server/api/projects/[id]/messages.delete.ts
server/api/projects/[id]/messages/stream.post.ts
server/api/projects/[id]/messages/more.post.ts
server/api/projects/[id]/messages/upload.post.ts
server/api/projects/[id]/messages/[msgId]/save.post.ts
server/api/projects/[id]/saved.get.ts
server/api/projects/[id]/saved/[savedId].delete.ts
server/api/skills/index.post.ts            # owner check on user_skills
server/api/invites/index.get.ts
server/api/invites/index.post.ts
server/api/invites/[token]/accept.post.ts
server/api/invites/[token].delete.ts
server/api/invites/by-id/[id].delete.ts
server/api/billing/checkout.post.ts        # workspace-owner check
server/api/billing/portal.post.ts
server/api/billing/[workspaceId].get.ts
```

Public routes (no auth) — leave alone:
`/api/health`, `/api/log`, `/api/auth/callback`, `/api/auth/logout`,
`/api/billing/webhook`, `/api/invites/[token].get.ts`.

---

## 7 — Defense in depth (optional, recommended later)

After §6 is done and tested, you can re-add narrow RLS as a safety
net (so even a bug in a route handler can't leak cross-tenant data).
The shape:

- `revoke all on schema public from anon, authenticated;` — kill the
  unused roles entirely.
- Keep `service_role` access (it bypasses RLS by default).
- Add minimal RLS that keys off a custom JWT claim if you later
  introduce per-request signed tokens.

This is **not** required for §1–§6 to work. The service-role client
running on the Nuxt server can read/write everything; the only gate
is your route handler's `assertWorkspaceMember` / `assertProjectMember`
call. Skip §7 until the basics are green.

---

## 8 — Storage / signed URLs

`server/utils/storage.ts` already uses the service-role client for
signed URL generation (it bypasses RLS). The current storage policies
in migration `20240101000003_storage_policies.sql` reference
`auth.uid()` — once §5.1 wipes them, **uploads from the server keep
working** because the service role bypasses storage RLS too.

**Action:** confirm `storage.ts` calls `serviceSupabase()` (not
`serverSupabase()`). Adjust if not.

---

## 9 — Testing checklist

1. **Migration applies cleanly.** `supabase db push` → no errors. `\d profiles` shows `google_sub` + `google_refresh_token` columns, no FK to `auth.users`.
2. **Sign in.** Click "Continue with Google" → redirected to Google → bounced to `/projects`. One row in `profiles` with `google_sub` populated.
3. **Session reads.** `GET /api/auth/me` returns the profile. Refresh the page → still authenticated.
4. **App-level authz.** Try `GET /api/projects/<some-other-users-project-id>` → 403, not 200. Critical to verify before shipping — RLS used to do this for free.
5. **Refresh token.** Sign out, sign in again. `google_refresh_token` row updates only when Google sends a new one (i.e. first consent or `prompt=consent`).
6. **Logout.** `POST /api/auth/logout` → cookie cleared. Hitting `/api/auth/me` → 401.
7. **Storage.** Upload a brand asset → file lands in `brand-assets/<projectId>/…`. Get a signed URL back.

---

## 10 — Ordered work list

The order matters — DB migration first so the new code path doesn't
race FK violations.

1. Run migration `20260427000000_drop_auth_users_dep.sql` (§5.1).
2. Rewrite `server/utils/supabase.ts` (§5.2). Add `server/utils/authz.ts` (§6).
3. Add `server/types/auth.d.ts` (§5.9).
4. Replace `server/api/auth/callback.get.ts` (§5.3), `me.get.ts` (§5.4), `logout.post.ts` (§5.5), `middleware/auth.ts` (§5.6).
5. Walk the route list (§6) and convert each handler to the
   `requireUser` + `serviceSupabase` + `assert…` pattern. Do this in
   one sitting so the app never half-runs on broken RLS + half-runs on
   app authz.
6. Delete obsolete files (§5.7).
7. Manual test pass (§9).
8. Once green: in `package.json`, drop `@supabase/ssr` (no longer
   imported anywhere). Keep `@supabase/supabase-js`.
9. Optional later: §7 defense-in-depth pass.

---

## 11 — Estimated effort

| Block | Time |
|---|---|
| Migration + util rewrites + auth handler swap (§5.1–§5.6, §5.9) | 30–45 min |
| Route conversion sweep (§6) — ~30 routes, ≈3 min each | 90–120 min |
| Manual test pass (§9) | 20–30 min |
| **Total** | **~3 hours focused work** |

Most of the time is in §6 — mechanical, but you have to be thorough.
A scripted find-and-replace for `serverSupabase(event)` →
`serviceSupabase(event)` plus inserting the `requireUser` +
`assert…` calls will save half the time.
