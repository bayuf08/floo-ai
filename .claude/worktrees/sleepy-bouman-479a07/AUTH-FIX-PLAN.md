# Auth Fix Plan — Google OAuth `auth_timeout`

## Root Cause Analysis

### What we know
- The `auth_timeout` fires every time → `onAuthStateChange` never emits `SIGNED_IN`
- The browser **can** reach Google and Supabase fine (OAuth redirect works)
- The server **cannot** reach Supabase (firewall blocks Node.js → Supabase API)
- We switched to implicit flow to avoid the server-side code exchange
- The callback page logs `URL hash` and `URL search` to the browser console

### Why `onAuthStateChange` never fires

The implicit flow sends `#access_token=...` in the **URL hash**. If Supabase is still
sending `?code=...` in the **query string** (PKCE), the hash is empty and
`detectSessionInUrl` never finds a token → `onAuthStateChange` never fires → timeout.

**Supabase sends `?code=` when "Enable implicit grant" is OFF** in the project
dashboard. That is almost certainly the cause.

### How to confirm (takes 10 seconds)
1. Open DevTools → Console
2. Click "Continue with Google", complete sign-in
3. When the callback page loads look for:
   ```
   [auth/callback] URL hash   : #access_token=...   ← implicit is working
   [auth/callback] URL hash   : (none)              ← implicit is NOT enabled
   [auth/callback] URL search : ?code=...           ← Supabase sent PKCE code
   ```

---

## Two Fix Paths

### Path A — Enable implicit grant (1 dashboard toggle, fastest)

> **Best if**: you have Supabase dashboard access and want the quickest fix.

Steps:
1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Authentication** → **URL Configuration** (left sidebar)
3. Scroll to **"Enable implicit grant"** → toggle **ON**
4. Click **Save**
5. Try signing in again — the callback URL should now have `#access_token=...`
6. No code changes needed; the current `callback.vue` handles this correctly

**Why this is the root cause**: without this toggle, Supabase always sends
`?code=...` (PKCE flow) regardless of what the client requests.

---

### Path B — PKCE with browser-side code exchange (no dashboard change)

> **Best if**: implicit grant can't be enabled, or as a more robust long-term approach.

The key insight: **only the Node.js server is firewalled from Supabase**. The browser
can reach Supabase directly. So PKCE code exchange done in the **browser** works fine.
The original PKCE error ("verifier not found") happened because we were exchanging on
the server — not the browser.

#### Changes required

**1. `app/composables/useSupabase.ts`** — remove `flowType: 'implicit'`, let PKCE run
```ts
_client = createBrowserClient(url, anonKey, {
  auth: {
    // Default is 'pkce' for @supabase/ssr — browser exchanges code directly
    detectSessionInUrl: true,
  },
})
```

**2. `app/pages/auth/callback.vue`** — handle `?code=` explicitly if auto-detect fails

`detectSessionInUrl: true` already calls `exchangeCodeForSession()` in the browser
automatically. But we need to make sure the listener is set up AFTER the exchange
completes. Refactor `onMounted` to:
```ts
onMounted(async () => {
  console.debug('[auth/callback] search:', window.location.search)
  console.debug('[auth/callback] hash  :', window.location.hash)

  const supabase = useSupabase()
  const code = new URLSearchParams(window.location.search).get('code')

  if (code) {
    // PKCE path — exchange code in the browser (browser → Supabase, no firewall)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      toast.error('Sign-in failed. Please try again.')
      return router.replace('/login?error=auth_failed')
    }
    return router.replace('/projects')
  }

  // Implicit path — tokens already in hash, handled by detectSessionInUrl
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return router.replace('/projects')

  // Fallback listener for implicit flow
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    subscription.unsubscribe()
    if (event === 'SIGNED_IN' && session) router.replace('/projects')
    else router.replace('/login?error=auth_failed')
  })

  setTimeout(() => {
    subscription.unsubscribe()
    toast.error('Sign-in timed out. Please try again.')
    router.replace('/login?error=auth_timeout')
  }, 8000)
})
```

**3. `app/composables/useAuth.ts`** — update `redirectTo` to point back at `/auth/callback`
(already correct — no change needed)

#### Why the old PKCE failed vs why this will work

| | Old attempt | Path B |
|---|---|---|
| Code exchange | Server-side (`/api/auth/callback`) | Browser-side (directly in `callback.vue`) |
| Firewall impact | Blocked — server can't reach Supabase | Not blocked — browser reaches Supabase fine |
| Verifier storage | Cookies set by browser client | Same cookies — no change |

---

## Recommended Order

```
Step 1 → Check console logs to confirm which URL format Supabase is sending
Step 2 → Try Path A (1 dashboard toggle, zero code changes)
Step 3 → If Path A isn't an option, implement Path B
```

Path A and Path B are **not mutually exclusive** — Path B's callback handles both
`?code=` and `#access_token=`, so it works regardless of which mode is active.
Implementing Path B makes the app resilient to dashboard setting changes.

---

## After the Fix — Remaining Auth Work

Once login is unblocked:
- [ ] Wire `log.error()` calls into `me.get.ts` when `profiles` table doesn't exist yet
      (currently returns 500 until the first migration is run)
- [ ] Run first Supabase migration (`supabase/migrations/`) to create `profiles` table
- [ ] Test full flow: login → `/projects` → profile loads in nav

---

*Last updated: 2026-04-27*
