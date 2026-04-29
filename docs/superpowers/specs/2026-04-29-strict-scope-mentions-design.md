# Design: Strict-Scope `@`-Mention (Tagged Files Restrict the AI's Knowledge View)

**Date:** 2026-04-29
**Component:** Chat composer + message API + RAG retrieval

## Goal

When a chat message contains one or more `@`-tagged knowledge files (inserted via the picker shipped on 2026-04-29), the server restricts the AI's knowledge view to only those files. With zero tags, behavior is unchanged from today (all knowledge files included).

This implements decision **D2** that was explicitly deferred in [`2026-04-29-mention-knowledge-files-design.md`](./2026-04-29-mention-knowledge-files-design.md).

## Files touched

| File | Status | What |
|---|---|---|
| `app/utils/mention-refs.ts` | new | Pure helper: `reconcileMentionRefs(text, refs) → string[]`. Easy to unit-test. |
| `app/utils/mention-refs.test.ts` | new | `bun:test` cases for the reconciler. |
| `app/components/chat/ChatComposer.vue` | modify | Track `mentionRefs`, reconcile on send, pass `referencedAssetIds` into `chatStore.sendMessage`. |
| `app/stores/chat.ts` | modify | `sendMessage` gains optional third arg, threads into both streaming and non-streaming POST bodies. (No shared request-body type exists — bodies are built inline.) |
| `server/api/projects/[id]/messages.post.ts` | modify | Zod schema + filter + fallback. |
| `server/api/projects/[id]/messages/stream.post.ts` | modify | Same Zod field + filter + fallback as messages.post.ts. |
| `server/utils/asset-retrieval.ts` | modify | Optional `assetIds` parameter threaded into RPC call. |
| `supabase/migrations/2026XXXX_match_project_chunks_asset_filter.sql` | new | DROP + CREATE the RPC with the new `p_asset_ids` parameter. |

The streaming endpoint must change in lockstep with `messages.post.ts` because the streaming path is tried first (see `chat.ts:streamSendMessage`); if only the non-streaming endpoint is updated, scoped requests will silently fall back to today's behavior whenever streaming succeeds.

## Confirmed decisions

- **A1 — Strict scope:** Tagged files are included; untagged files are completely excluded from both the system prompt and RAG chunk retrieval.
- **B1 — Picker only:** Only files inserted via the `@`-popover count as tags. Manual typing of `@filename` is treated as plain text and gets default behavior. Filename-name matching is unreliable (no DB unique constraint on `brand_assets.name` per project), so identification is by UUID.

## Non-goals

- Server-side regex parsing of `@filename` from message text (B2 was rejected).
- UI indicator showing "scoped to N files" — could be added later if user feedback warrants.
- AI-generated metadata in the response saying which files it referenced.
- Changes to non-text modes (`image` mode at `messages/image.post.ts` is unchanged — image generation doesn't currently consume brand knowledge).

## User flow

1. User types `@`, picks `LK-WINE-25-Q1.pdf` from the popover. Composer records `{ assetId: 'uuid-A', filename: 'LK-WINE-25-Q1.pdf' }`.
2. User types `@`, picks `LK-XL-25-Q1.pdf`. Composer records the second entry.
3. User sends `Compare @LK-WINE-25-Q1.pdf vs @LK-XL-25-Q1.pdf`.
4. Composer reconciles: both filenames are still substrings of the message text, both UUIDs survive. POST body includes `referencedAssetIds: ['uuid-A', 'uuid-B']`.
5. Server filters `brand_assets` to those two UUIDs. RAG retrieval also scopes to chunks belonging to those two files. The `Brand knowledge files` block in the system prompt now lists only the two tagged files. Other project files are not visible to the AI.
6. AI answer is grounded only in the tagged files.

## Client-side changes

### [app/components/chat/ChatComposer.vue](app/components/chat/ChatComposer.vue)

A tracking array is added next to the existing mention state:

```ts
const mentionRefs = ref<{ assetId: string; filename: string }[]>([])
```

Wiring:

- **`selectMention(file)`** — after the existing trigger replacement runs, push `{ assetId: file.id, filename: file.name }` onto `mentionRefs`. Duplicates of the same `assetId` are allowed at insert time and resolved at send time.
- **`send()`** — before calling `chatStore.sendMessage`, "reconcile" `mentionRefs` against `inputText.value`:
  - For each entry, check `inputText.value.includes('@' + entry.filename)`. Drop entries whose substring is no longer present (the user manually deleted the inserted text).
  - De-duplicate by `assetId`.
  - Build `referencedAssetIds: string[]` from the surviving entries.
  - If `referencedAssetIds.length === 0`, omit the field entirely (passes `undefined` to `sendMessage`).
- After successful send (or send-failure cleanup), reset `mentionRefs.value = []`.

The reconciliation lives in a small pure helper to keep `ChatComposer.vue` lean and so it's testable without a Vue harness:

```ts
// app/utils/mention-refs.ts
export function reconcileMentionRefs(
  text: string,
  refs: { assetId: string; filename: string }[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of refs) {
    if (!text.includes('@' + r.filename)) continue
    if (seen.has(r.assetId)) continue
    seen.add(r.assetId)
    out.push(r.assetId)
  }
  return out
}
```

### [app/stores/chat.ts](app/stores/chat.ts)

`sendMessage` gains a third optional parameter:

```ts
async function sendMessage(
  content: string,
  projectId: string,
  referencedAssetIds?: string[],
)
```

- The non-streaming POST body (`/api/projects/[id]/messages`) gets `referenced_asset_ids` (snake_case to match server convention) populated only when the array is non-empty.
- The streaming path (`streamSendMessage`, called first) accepts the same parameter and includes it in its POST body.
- The mock and image-mode paths ignore the new parameter (they don't touch knowledge files anyway).

Default `undefined` keeps existing call sites unchanged — only the composer needs updating.

## Server-side changes

### [server/api/projects/[id]/messages.post.ts](server/api/projects/[id]/messages.post.ts)

The Zod schema (currently around line ~30) adds:

```ts
referenced_asset_ids: z.array(z.string().uuid()).optional()
```

After the `assets` query (~line 108-109), filter:

```ts
const requestedIds = parsed.data.referenced_asset_ids ?? []
const filteredAssets = requestedIds.length > 0
  ? (assets ?? []).filter((a: any) => requestedIds.includes(a.id))
  : (assets ?? [])

// Fallback: if the user requested specific assets but none of them resolved
// to real rows (file deleted server-side, RLS rejected, or stale client
// state), fall back to all assets rather than answering with no context.
const effectiveAssets = (requestedIds.length > 0 && filteredAssets.length === 0)
  ? (assets ?? [])
  : filteredAssets
```

`effectiveAssets` is then passed into `buildChatPrompt` instead of `assets`. The prompt builder doesn't change — it just renders fewer files when scoped.

### [server/utils/asset-retrieval.ts](server/utils/asset-retrieval.ts) + new migration

The retrieval path uses a Postgres RPC defined in [supabase/migrations/20260428000000_brand_asset_chunks.sql](supabase/migrations/20260428000000_brand_asset_chunks.sql):

```sql
match_project_chunks(query_embedding vector, p_project_id uuid, match_count int)
```

A new migration adds an `asset_ids` filter to the function. Postgres `CREATE OR REPLACE FUNCTION` cannot change a function's parameter list, so the migration `DROP`s the existing function and `CREATE`s the new one with an additional `p_asset_ids UUID[] DEFAULT NULL` parameter at the end. SQL change inside the function:

```sql
WHERE c.project_id = p_project_id
  AND (p_asset_ids IS NULL OR c.asset_id = ANY(p_asset_ids))
```

When `p_asset_ids` is `NULL`, behavior is identical to today (no filter).

`retrieveRelevantChunks` gets an optional `assetIds?: string[]` parameter and threads it into the RPC call as `p_asset_ids`. When the caller doesn't supply `assetIds` (or supplies an empty array), the RPC parameter is `null` — preserving today's behavior.

Caller in `messages.post.ts` passes the **same** id set used for asset filtering:

```ts
const ragScopeIds = (requestedIds.length > 0 && filteredAssets.length > 0)
  ? requestedIds
  : undefined
const selectedChunks = await retrieveRelevantChunks(event, {
  projectId,
  query: parsed.data.content,
  matchCount: 5,
  assetIds: ragScopeIds,
})
```

When the user is scoped, RAG only surfaces chunks from tagged files. When unscoped (default), the existing project-wide retrieval is unchanged.

If RAG returns zero chunks for the scoped files (e.g., they aren't yet embedded), the existing fallback in [prompt-builder.ts:232-242](server/utils/prompt-builder.ts#L232-L242) kicks in — `renderBrandKnowledge` inlines the full extracted text of `effectiveAssets`. So both retrieval paths respect the scope.

## Edge cases

| Case | Behavior |
|---|---|
| Zero tags (today's behavior) | All assets included; RAG project-wide. Identical to current code. |
| One tag | Only that asset; RAG scoped. |
| Multiple tags | Union — all tagged assets included; RAG scoped to those. |
| User pastes `@filename` from another message | No UUID tracked → default behavior. |
| User types `@filename` manually (no picker) | No UUID tracked → default behavior. |
| User picks file then deletes the `@filename` text in textarea | Reconciliation drops that ID before send. |
| Picked file gets deleted between pick and send | Server fallback (case "all requested IDs missing") → default behavior. |
| Picked file's RLS denies row at fetch time | Same as above — falls back to default. |
| Same file picked twice (duplicate insert) | De-duplicated at reconciliation (single ID in payload). |
| `referencedAssetIds: []` sent (empty array) | Treated as "omitted" — default behavior. |

## Testing

### Unit tests

**`app/utils/mention-refs.test.ts`** (new, `bun:test`):

- Empty refs → `[]`
- One ref present in text → returns that ID
- One ref deleted from text → returns `[]`
- Two refs, second deleted → returns `[firstId]`
- Duplicate refs (same `assetId` twice in array, both filenames present) → returns one ID
- Two different files with same filename string but different IDs (legal per schema) → both IDs returned, both kept

**Server-side filter tests** — extend whatever test setup exists for `messages.post.ts` if any. If there's no integration test harness for the message endpoint, a small unit test of the filter logic extracted into a pure helper is acceptable.

### Manual verification

1. Tag one file, ask a question whose answer requires that file → AI answers correctly.
2. Tag one file, ask a question whose answer requires a *different* file in the same project → AI explicitly says it doesn't have the information (proves untagged files are excluded).
3. Tag none → behavior unchanged from today.
4. Tag two files, ask a comparison question → AI synthesizes across both.
5. Pick a file, then delete the `@text` from the textarea, then send → AI behavior matches "no tag".
6. Pick a file, send, then send a second message with no tag → second message is unscoped (no leakage of prior tags).

## Out of scope (future, if needed)

- UI indicator showing "scoped to N files" before/after send.
- Server-side text parsing as a B2-style fallback for users who type without picker.
- Automatically including referenced/cited files (e.g., if the user tags A but A references B, optionally include B).
- Per-mode override (e.g., `image` mode behavior — the image endpoint is unchanged here).
