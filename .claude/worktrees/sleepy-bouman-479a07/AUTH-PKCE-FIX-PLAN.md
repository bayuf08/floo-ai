# PKCE Verifier-Missing — Fix Plan

> Drafted **before** any further code changes. Review and confirm before
> implementation continues. Two diagnostic + fix iterations have already
> shipped (cookies → localStorage); this plan covers the next iteration.

---

## What we know from the logs

```
[client/auth/login]    Starting signInWithOAuth          → OK
[client/auth/login]    OAuth URL acquired — redirecting   → OK
[client/auth/callback] Callback page mounted              → has_code: true
[client/auth/callback] PKCE branch — exchanging code      → OK
[client/auth/callback] exchangeCodeForSession returned error
                       AuthPKCECodeVerifierMissingError
                       "PKCE code verifier not found in storage"
```

Two configurations have been tried. Both fail the same way:

| Iteration | Storage | Result |
|---|---|---|
| 1 | `@supabase/ssr` `createBrowserClient`, default cookies | verifier missing |
| 2 | `@supabase/supabase-js` `createClient`, `localStorage` | verifier missing |

Both should work in theory. The fact that both fail means **either**:

- **A** — the verifier is being written, but to a different key than the
  callback reads from (e.g. URL trailing slash, stale singleton, multiple
  client instances each with their own storage prefix)
- **B** — the verifier is being written, but cleared between sign-in and
  callback (Brave Shields, private browsing isolation, extension)
- **C** — the verifier is never being written (some startup state issue
  with the client)

We don't know yet which of A/B/C is true because we haven't logged
storage state at the time of the failure.

---

## The plan

Three steps in this order. Stop after step 1 to confirm the root cause
before committing to step 2's bigger change.

### Step 1 — Diagnostics first (read-only, no behaviour change)

Add a "storage snapshot" log entry to `app/pages/auth/callback.vue` that
runs **before** `exchangeCodeForSession`. It logs:

- All keys in `localStorage` whose name starts with `sb-`
- All cookies whose name starts with `sb-`
- The Supabase URL the client was initialised with (from
  `useRuntimeConfig().public.supabaseUrl`)
- The `storageKey` the client is using (read from a tiny accessor we'll
  add to `useSupabase`)

Also add a snapshot **immediately after `signInWithOAuth`** on the login
page. That gives us before/after pictures we can compare in
`logs/app.log`.

After this step lands, **the user runs sign-in once** and pastes the
log. We diagnose:

- Snapshot 1 has `sb-*-code-verifier` AND snapshot 2 has it      → key
  mismatch (case A) — fix is to align storage keys
- Snapshot 1 has it AND snapshot 2 does NOT                      → storage
  cleared (case B) — fix is to use a more durable store
- Snapshot 1 does NOT have it                                    → never
  written (case C) — fix is to instrument signInWithOAuth itself

### Step 2 — Targeted fix based on the diagnostic

Branches based on what step 1 reveals:

**A. Key mismatch.** Hard-code the same `storageKey` on both pages
(currently we don't set one — the SDK derives it from the project URL).
Force `storageKey: 'sb-floo-auth'` and audit that nothing else passes a
different key.

**B. Storage cleared.** Move the verifier into a server-side session
record keyed by the OAuth `state` parameter:

```
1. signInWithOAuth: server generates verifier + state
2. Store { state → verifier } in a short-TTL Supabase table or in-memory map
3. Browser is redirected to Google with challenge + state
4. Callback: server reads verifier by state, exchanges with Supabase
```

This survives any browser-side storage clearing. Trade-off: the code
exchange has to happen on the server, which we previously avoided
because of the firewall worry. Mitigation: the exchange request is to
`api.supabase.co`, not `<project>.supabase.co/auth/v1` — slightly
different surface, may not be firewalled the same way. We'll test.

If server exchange still fails the firewall, the only remaining option
is **enable implicit grant in the Supabase dashboard** — a 30-second
manual setting that sidesteps PKCE entirely.

**C. Verifier never written.** Wrap `signInWithOAuth` with our own
storage write so we control the timing:

```ts
// Override skipBrowserRedirect, do the redirect ourselves, but only
// after we've explicitly confirmed the verifier is in storage.
const { data } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo, skipBrowserRedirect: true },
})

// At this point storage should hold the verifier. Confirm.
const stored = window.localStorage.getItem('sb-floo-auth-code-verifier')
if (!stored) throw new Error('Verifier write failed')

window.location.href = data.url
```

### Step 3 — Belt-and-braces fallback (optional)

Regardless of which fix lands, add a "fallback to magic link" UI path so
the user can sign in via email if Google OAuth fails three times in a
row. Out of scope for this plan unless the user wants it.

---

## What I've already changed in this iteration

These edits are LIVE in the working tree (made before this plan was
drafted; happy to revert if you want):

- `app/composables/useSupabase.ts` — switched back to
  `@supabase/ssr` `createBrowserClient` with **explicit** cookies
  handlers that force `Path=/; SameSite=Lax`.

That change alone may resolve case B if the issue was that the default
cookie handler was setting unsafe SameSite values. But step 1's
diagnostic will tell us for certain.

---

## What I have NOT yet changed

- `app/pages/auth/callback.vue` — has not been touched in this iteration.
- `app/composables/useAuth.ts` — has not been touched in this iteration.
- `server/api/auth/set-session.post.ts` — created in the previous
  iteration; still in place.

---

## Decision needed

Ready to:

- [ ] **Run sign-in once with the current (cookies-handler) state and
      paste the new `logs/app.log`** — that may already be enough
      because the explicit-cookies handler may have fixed it without
      needing diagnostics.
- [ ] **Approve step 1 (diagnostics) and stop there** — adds the storage
      snapshot logging, ships nothing else, you run sign-in, we read
      the snapshot, we pick A/B/C based on what we see.
- [ ] **Skip diagnostics, go straight to step 2-B (server-side verifier
      session)** — biggest change, most robust, ~150 LOC.
- [ ] **Just enable implicit grant in the Supabase dashboard** —
      30 seconds, no code change, works today, but only resilient as
      long as the dashboard setting stays on.

Tell me which path and I'll proceed.

---

*Last updated: 2026-04-27*
