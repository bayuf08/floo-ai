# Vercel Deployment Plan — Floo·Content (Nuxt 4 + Supabase + Vercel)

> Stack: **Nuxt 4** (Nitro server) → **Vercel** serverless functions → **Supabase** (Postgres + Storage + S3) for data, **nuxt-auth-utils** sealed-cookie sessions over **Google OAuth**, **GLM / OpenAI / Anthropic** for AI, **Resend** for email, **Stripe** for billing (Phase 7).
>
> Linked Supabase project: `xxumxffdukpshebypzur` (`floo-content`).

This plan assumes the repo is already wired up locally and the goal is the first production deploy. Each phase produces a verifiable result before the next phase starts.

---

## Phase 0 — Pre-flight (do before touching Vercel)

These checks prevent the most common first-deploy failures.

1. **Pin the Nitro preset.** Nitro auto-detects Vercel from `VERCEL=1`, but pinning removes ambiguity for local `nuxt build` testing. Add to `nuxt.config.ts`:
   ```ts
   nitro: {
     preset: process.env.NITRO_PRESET || 'vercel',
     alias: { '~': fileURLToPath(new URL('.', import.meta.url)) }, // existing
   },
   ```
   Leave the env-var override so `npm run build` locally still defaults to `node-server`.

2. **Verify the production build works locally.**
   ```bash
   NITRO_PRESET=vercel npm run build
   ```
   The output should land in `.vercel/output/`. Check `.vercel/output/functions/__nitro.func/` exists.

3. **Audit cookie config for HTTPS.** `nuxt.config.ts` already gates `secure` on `NODE_ENV === 'production'` — Vercel sets that automatically, so the sealed session cookie will be `Secure` in prod. No change needed.

4. **Confirm `bun.lock` vs `package-lock.json`.** Both files are present. Vercel will pick the lockfile that matches the install command. Default to npm to avoid surprises:
   - Either delete `bun.lock` and commit, **or**
   - In Vercel project settings, set Install Command to `bun install --frozen-lockfile` and pin the bun version.

   Recommended: delete `bun.lock`, keep `package-lock.json`. The `postinstall: nuxt prepare` script will run regardless.

5. **Generate a real `SESSION_SECRET`** (32 bytes, hex). The sealed-cookie session is broken without it.
   ```bash
   openssl rand -hex 32
   ```
   Save this — you'll paste it into Vercel in Phase 3.

6. **Make sure `.env*` is gitignored.** Already is (`.gitignore` line 22-24). Just confirming.

7. **Push to GitHub/GitLab/Bitbucket.** Vercel needs a Git remote to deploy from.

---

## Phase 1 — Apply Supabase migrations to the remote project

The local migrations have never been pushed. Do this BEFORE the first Vercel deploy or every API route will 500.

1. Confirm the Supabase CLI is logged in and linked:
   ```bash
   supabase status         # local stack
   supabase projects list  # confirms login
   cat supabase/.temp/project-ref   # → xxumxffdukpshebypzur
   ```

2. Push migrations to the remote project:
   ```bash
   supabase db push
   ```
   This applies, in order:
   - `20240101000000_initial_schema.sql`
   - `20240101000001_rls_policies.sql`
   - `20240101000002_seed_system_data.sql` (24 built-in skills + system data)
   - `20240101000003_storage_policies.sql`
   - `20240101000004_invitations.sql`
   - `20240101000005_billing.sql`
   - `20260427000000_drop_auth_users_dep.sql`

3. **Create the three Storage buckets** in the Supabase dashboard (Storage → New bucket):
   - `brand-assets` — **Private**
   - `avatars` — **Public**
   - `message-attachments` — **Private**

   The storage RLS policies in migration `_storage_policies.sql` reference these names; bucket creation must happen first.

4. **Deploy the cleanup edge function** (separate from Vercel — runs on Supabase):
   ```bash
   supabase functions deploy cleanup-attachments
   ```
   Then schedule it via Supabase Dashboard → Edge Functions → Cron, e.g. daily at 03:00 UTC. (Vercel Cron is an alternative but the function lives in `/supabase/functions`, so keep it on Supabase.)

5. **Smoke test:** open Supabase SQL editor and run `select count(*) from skills;` — should return 24.

---

## Phase 2 — Create the Vercel project

1. Sign in at [vercel.com](https://vercel.com) → **Add New → Project** → import the Git repo.
2. **Framework preset:** Nuxt.js (auto-detected).
3. **Root directory:** `./` (the repo root IS `floo-content-web`).
4. **Build & Output settings** — leave defaults:
   - Build command: `nuxt build` (from `package.json`)
   - Output directory: `.vercel/output` (Nitro Vercel preset writes here)
   - Install command: `npm install` (or `bun install --frozen-lockfile` if you keep bun)
5. **Node version:** 20.x (Vercel's current default; Nuxt 4 requires ≥18.17).
6. **Don't deploy yet** — click *Environment Variables* first (Phase 3).

---

## Phase 3 — Environment variables (the long part)

Set every variable below in Vercel → Project Settings → Environment Variables. For each, choose which environments it applies to: **Production**, **Preview**, **Development** (the last is for `vercel dev`).

> **Naming note from `nuxt.config.ts`:** runtime config is wired to read the canonical names below directly via `process.env`. Do NOT add a `NUXT_` prefix unless you also change `nuxt.config.ts`.

### App
| Var | Production value | Preview | Notes |
|---|---|---|---|
| `NUXT_PUBLIC_APP_URL` | `https://your-domain.com` | `https://floo-content-git-<branch>-<team>.vercel.app` | Used by OAuth redirect builder + email links. Preview value is hard to pin — use `${VERCEL_URL}` strategy below if you need true per-deploy URLs. |
| `NUXT_PUBLIC_APP_NAME` | `Floo·Content` | same | |
| `NODE_ENV` | leave unset — Vercel sets `production` automatically | | Setting this manually breaks Vercel's build cache. |

### Supabase (Database + Auth + Storage)
| Var | Source |
|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NUXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (**server-only**, never `NUXT_PUBLIC_`) |
| `SUPABASE_DB_URL` | Supabase → Settings → Database → Connection string (use the **pooler** URL on port `6543` for serverless — direct `5432` will exhaust connections) |
| `SUPABASE_JWT_SECRET` | Supabase → Settings → API → JWT Settings |

### Supabase Storage (S3-compatible API)
| Var | Source |
|---|---|
| `SUPABASE_S3_ACCESS_KEY_ID` | Supabase → Storage → S3 Access Keys → New |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | same |
| `SUPABASE_S3_ENDPOINT` | `https://xxumxffdukpshebypzur.supabase.co/storage/v1/s3` |
| `SUPABASE_S3_REGION` | `ap-southeast-1` (or your project region) |
| `SUPABASE_STORAGE_BUCKET_ASSETS` | `brand-assets` |
| `SUPABASE_STORAGE_BUCKET_AVATARS` | `avatars` |
| `SUPABASE_STORAGE_BUCKET_ATTACHMENTS` | `message-attachments` |
| `NUXT_PUBLIC_STORAGE_CDN_URL` | `https://xxumxffdukpshebypzur.supabase.co/storage/v1/object/public` |
| `MAX_BRAND_ASSET_SIZE_MB` | `50` |
| `MAX_AVATAR_SIZE_MB` | `5` |
| `MAX_ATTACHMENT_SIZE_MB` | `25` |

### Google OAuth
| Var | Notes |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://your-domain.com/api/auth/callback` (production) |

### Session (nuxt-auth-utils)
| Var | Notes |
|---|---|
| `SESSION_SECRET` | The 32-byte hex string from Phase 0 step 5. **Same value** in Production and Preview, otherwise preview cookies don't carry over to prod. |

### AI providers
| Var | Notes |
|---|---|
| `GLM_API_KEY` | Required (primary) |
| `GLM_API_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` |
| `GLM_MODEL` | `glm-4-flash` (default) or `glm-4-plus` |
| `OPENAI_API_KEY` | Optional fallback |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Optional fallback |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` |

### Email
| Var | Notes |
|---|---|
| `RESEND_API_KEY` | |
| `RESEND_FROM_EMAIL` | Must be on a domain you've verified in Resend before going live |
| `RESEND_FROM_NAME` | `Floo·Content` |

### Rate limiting
| Var | Notes |
|---|---|
| `RATE_LIMIT_AI_REQUESTS_PER_MINUTE` | `20` |

### Stripe (Phase 7 — optional now)
Skip unless you're shipping billing immediately. When you do, add `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` (`NUXT_PUBLIC_`), `STRIPE_WEBHOOK_SECRET`, and the `STRIPE_PRICE_ID_*` ids.

> **Tip — copy your local `.env` in bulk.** Vercel CLI: `vercel env pull .env.local` to round-trip; or use the dashboard's "import .env" feature. Just be sure to mark `*_SECRET`, `*_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as encrypted (default).

---

## Phase 4 — External services: add the production URL

The first deploy will give you a URL like `https://floo-content.vercel.app` (or your custom domain after Phase 6). Update each external service:

1. **Google Cloud Console → OAuth client:**
   - Authorized JavaScript origins: add `https://your-domain.com`
   - Authorized redirect URIs: add `https://your-domain.com/api/auth/callback`
   - Keep `http://localhost:3000/...` for local dev.

2. **Supabase → Authentication → URL Configuration:**
   - Site URL: `https://your-domain.com`
   - Additional Redirect URLs: add the Vercel preview wildcard if you want preview deploys to log in:
     `https://floo-content-*-<your-team>.vercel.app/api/auth/callback`

   *(Note: this app does Google OAuth via `nuxt-auth-utils` directly, not via Supabase Auth's social provider. Supabase's Auth URLs are still worth setting for any future Supabase-Auth flows.)*

3. **Resend → Domains:** verify your sending domain (DNS records: SPF, DKIM, return-path). Until verified, `RESEND_FROM_EMAIL` is restricted to test addresses.

4. **Stripe → Webhooks** (when enabling billing): add `https://your-domain.com/api/billing/webhook` and copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## Phase 5 — First deploy + smoke tests

1. **Deploy.** Trigger from the Vercel dashboard (or push to the production branch).

2. **Watch the build logs.** Expected steps: install → `nuxt prepare` (postinstall) → `nuxt build` → Nitro Vercel preset writes `.vercel/output/`. First build is slow (~2-4 min) due to Google Fonts download (`googleFonts.download: true`); subsequent builds use Vercel's build cache.

3. **Hit `/api/health`.** Expected: `200 {"status":"ok"}` (or whatever the handler returns). This is in `PUBLIC_PATHS` so no auth needed.

4. **OAuth round-trip:**
   - Visit `https://your-domain.com/login`.
   - Click Google login.
   - Should bounce to Google, back to `/api/auth/callback?code=...`, then redirect to `/projects`.
   - If it 401s on the redirect, the `nuxt-session` cookie isn't being set — check `SESSION_SECRET` is non-empty and that `NUXT_PUBLIC_APP_URL` matches the actual deploy URL.

5. **List skills:** GET `/api/skills` should return the 24 seeded skills. Confirms Supabase pooler is reachable.

6. **Create a project + send a chat message:** exercises the AI streaming endpoint at `/api/projects/[id]/messages/stream.post.ts`. Watch network tab for an SSE-style stream. **Streaming gotcha:** Vercel serverless functions on the **Hobby** plan have a 10s execution limit and don't fully support response streaming. Pro plan gives 60s default (configurable to 300s) and proper streaming. **Floo·Content's chat will not work on Hobby tier** — plan for at least Pro.

7. **Upload a brand asset:** exercises the S3 path. Confirms Supabase S3 keys + bucket policies.

---

## Phase 6 — Custom domain + DNS

1. Vercel → Project → Settings → Domains → Add `app.your-domain.com` (or apex).
2. Add the DNS record Vercel asks for (CNAME for subdomain, A/ALIAS for apex).
3. Wait for SSL provisioning (~1-2 min).
4. **Update env vars** to the new domain: `NUXT_PUBLIC_APP_URL`, `GOOGLE_REDIRECT_URI`.
5. **Update Google Console + Supabase** (Phase 4) with the custom domain.
6. **Redeploy** so the new env vars take effect (Vercel does NOT hot-swap envs into running functions — you must trigger a new deploy).

---

## Phase 7 — Vercel-specific operational tuning

These are not blockers but you'll want them sorted before real users.

1. **Function regions.** Default is `iad1` (US East). If your Supabase project is in `ap-southeast-1` (Singapore — likely, given the S3 region default), every DB call crosses the Pacific. Either:
   - Move Supabase to a US region (project recreation — painful), **or**
   - Set Vercel function region in `nuxt.config.ts`:
     ```ts
     nitro: {
       preset: 'vercel',
       vercel: { regions: ['sin1'] },   // Singapore
     },
     ```

2. **Connection pooling.** Always use the Supabase **pooler URL** (port `6543`) in `SUPABASE_DB_URL` for serverless. Direct `5432` will hit `too many connections` once you have any traffic. The `@supabase/supabase-js` client uses HTTP/PostgREST — fine. Only pure-pg connections need the pooler.

3. **Function size limit.** Vercel's serverless function bundle is 50 MB unzipped. Nuxt + Nitro + the bundled Iconify collections (`heroicons`, `simple-icons`, `lucide`) can push this. If the build warns, switch icons to `clientBundle: { scan: true }` only (drop `serverBundle`) so they're not in the function payload.

4. **Logs.** Vercel only retains function logs for 1 hour (Hobby) / 1 day (Pro). For longer retention, the existing `server/utils/logger.ts` should ship logs to Supabase or a third-party (Axiom, Logtail, BetterStack). Add `LOGTAIL_TOKEN` etc. once chosen.

5. **Image optimization.** `@nuxt/image` is installed. On Vercel, set the provider to `vercel` so it uses Vercel's image CDN (free quota, then metered):
   ```ts
   image: { provider: 'vercel' },
   ```
   Without this, images go through Nuxt's IPX and consume function execution time.

6. **Cron jobs.** The `cleanup-attachments` Edge Function runs on Supabase's scheduler (Phase 1). If you need other crons, use Vercel Cron (`vercel.json`) — but anything that touches storage cleanup is better as a Supabase Edge Function close to the data.

7. **Preview deploys + OAuth.** Each preview gets a unique URL, but Google OAuth requires registered redirect URIs. Two options:
   - Register a wildcard-style fixed alias (e.g. `floo-content-preview.vercel.app` via Vercel domains), point all previews there, register that one URL with Google.
   - Or skip OAuth on previews and use a `dev:bypass` login route (the AUTH plan files mention this pattern).

---

## Phase 8 — Verification checklist (run after every prod deploy)

Run through this list before declaring a deploy successful:

- [ ] `GET /api/health` → 200
- [ ] `GET /` loads, fonts render, no console errors
- [ ] Google login → lands on `/projects`, `nuxt-session` cookie set, `Secure; HttpOnly; SameSite=Lax`
- [ ] `GET /api/auth/me` → 200 with the logged-in user
- [ ] `GET /api/skills` → 24 results
- [ ] Create workspace + project → both persist after refresh
- [ ] Send a chat message in a project → AI streams a response (>1 chunk visible in DevTools Network)
- [ ] Upload a brand asset → file appears in Supabase Storage `brand-assets/` bucket
- [ ] Upload an avatar → public URL renders the image
- [ ] Logout → `nuxt-session` cookie cleared, `/api/auth/me` returns 401

---

## Rollback

Vercel keeps every deploy. To roll back: Project → Deployments → find the last good one → ⋯ → "Promote to Production". DNS doesn't change. Sub-second rollback.

For Supabase migrations, there's no automatic rollback — write a forward-only undo migration if a schema change breaks prod.

---

## Files this plan touches

- `nuxt.config.ts` — pin `nitro.preset = 'vercel'`, optionally set `vercel.regions` and `image.provider`.
- *(optional)* delete `bun.lock` to standardize on npm.
- *(optional)* `vercel.json` — only if you need cron, custom headers, or rewrites beyond what Nuxt produces.

No code changes are required to the Pinia stores or API routes — the Nitro Vercel preset wraps them as serverless functions automatically.
