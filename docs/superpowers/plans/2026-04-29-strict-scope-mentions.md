# Strict-Scope `@`-Mention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user `@`-tags one or more knowledge files via the existing picker, restrict the AI's view to only those files (system prompt + RAG retrieval). Tagless behavior is unchanged.

**Architecture:** Client tracks `{assetId, filename}` for each picker-inserted mention, reconciles them against the textarea text on send, and passes UUIDs in the POST body. Server filters `brand_assets` and the chunk-retrieval RPC by those UUIDs, with a graceful fallback to default behavior when no IDs resolve.

**Tech Stack:** Nuxt 4, Vue 3 (Composition API), Pinia, Supabase (Postgres + pgvector RPC), Zod, `bun:test`.

**Spec:** [docs/superpowers/specs/2026-04-29-strict-scope-mentions-design.md](docs/superpowers/specs/2026-04-29-strict-scope-mentions-design.md)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `app/utils/mention-refs.ts` | new | `reconcileMentionRefs(text, refs) → string[]` — pure substring/dedup logic. |
| `app/utils/mention-refs.test.ts` | new | `bun:test` cases for the reconciler. |
| `app/components/chat/ChatComposer.vue` | modify | Track `mentionRefs`, reconcile on send, thread through `chatStore.sendMessage`. |
| `app/stores/chat.ts` | modify | `sendMessage` + `streamSendMessage` accept optional `referencedAssetIds`, include in POST bodies as `referenced_asset_ids` when non-empty. |
| `server/utils/asset-retrieval.ts` | modify | Optional `assetIds?: string[]` param threaded into the RPC call as `p_asset_ids`. |
| `server/api/projects/[id]/messages.post.ts` | modify | Zod schema, filter `assets` and the RAG scope by `referenced_asset_ids`, fall back when none resolve. |
| `server/api/projects/[id]/messages/stream.post.ts` | modify | Mirror of `messages.post.ts`. |
| `supabase/migrations/20260429100000_match_project_chunks_asset_filter.sql` | new | DROP + CREATE the `match_project_chunks` RPC with a new `p_asset_ids UUID[] DEFAULT NULL` parameter. |

The implementer must NOT touch unrelated files in the working tree (the user has separate WIP under `app/components/skills/`, `app/stores/skills.ts`, `app/types/skill*.ts`, `server/api/skills/`, `server/utils/skills-seed.test.ts`, several `2026-04-29*_*.sql` files about skills, and `scripts/build-prod-env.mjs` — none of these are part of D2).

The user also has uncommitted edits in `messages.post.ts` and `stream.post.ts` that touch only the `skills` SELECT and the skill-mapping (adding `description` and `examples` columns). Those edits are semantically independent from D2's filter work, but the implementer should NOT discard them — only ADD the D2 changes alongside, leaving the user's WIP intact.

---

### Task 1: `reconcileMentionRefs` pure helper (TDD)

**Files:**
- Create: `app/utils/mention-refs.ts`
- Create: `app/utils/mention-refs.test.ts`

**Goal:** Given the message text and an array of `{assetId, filename}` tracking entries, return the de-duplicated list of `assetId`s whose `@filename` substring is still present in the text.

- [ ] **Step 1: Write the failing test file**

Create `app/utils/mention-refs.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { reconcileMentionRefs } from './mention-refs'

describe('reconcileMentionRefs', () => {
  test('empty refs → empty array', () => {
    expect(reconcileMentionRefs('hello @anything', [])).toEqual([])
  })

  test('one ref present in text → returns its id', () => {
    expect(
      reconcileMentionRefs('analyze @LK.pdf please', [
        { assetId: 'a-1', filename: 'LK.pdf' },
      ]),
    ).toEqual(['a-1'])
  })

  test('one ref deleted from text → returns []', () => {
    expect(
      reconcileMentionRefs('plain text now', [
        { assetId: 'a-1', filename: 'LK.pdf' },
      ]),
    ).toEqual([])
  })

  test('two refs, second deleted → returns first only', () => {
    expect(
      reconcileMentionRefs('compare @LK.pdf with the other doc', [
        { assetId: 'a-1', filename: 'LK.pdf' },
        { assetId: 'a-2', filename: 'XL.pdf' },
      ]),
    ).toEqual(['a-1'])
  })

  test('duplicate refs (same assetId twice, both filenames present) → de-duplicated', () => {
    expect(
      reconcileMentionRefs('@LK.pdf again @LK.pdf', [
        { assetId: 'a-1', filename: 'LK.pdf' },
        { assetId: 'a-1', filename: 'LK.pdf' },
      ]),
    ).toEqual(['a-1'])
  })

  test('two different files with same filename string but different ids → both kept', () => {
    // brand_assets.name is not unique per project (no DB constraint), so this
    // is a legal state. Both ids must survive.
    expect(
      reconcileMentionRefs('see @LK.pdf', [
        { assetId: 'a-1', filename: 'LK.pdf' },
        { assetId: 'a-2', filename: 'LK.pdf' },
      ]),
    ).toEqual(['a-1', 'a-2'])
  })

  test('preserves insertion order in the output', () => {
    expect(
      reconcileMentionRefs('@a.pdf @b.pdf @c.pdf', [
        { assetId: 'id-c', filename: 'c.pdf' },
        { assetId: 'id-a', filename: 'a.pdf' },
        { assetId: 'id-b', filename: 'b.pdf' },
      ]),
    ).toEqual(['id-c', 'id-a', 'id-b'])
  })
})
```

- [ ] **Step 2: Create stub implementation so the test file imports cleanly**

Create `app/utils/mention-refs.ts`:

```ts
export interface MentionRef {
  assetId: string
  filename: string
}

export function reconcileMentionRefs(_text: string, _refs: MentionRef[]): string[] {
  return []
}
```

- [ ] **Step 3: Run tests — most should fail**

```bash
bun test app/utils/mention-refs.test.ts
```

Expected: empty-refs and "ref deleted" tests pass; the others fail with arrays not matching.

- [ ] **Step 4: Implement the reconciler**

Replace the stub in `app/utils/mention-refs.ts`:

```ts
export interface MentionRef {
  assetId: string
  filename: string
}

export function reconcileMentionRefs(text: string, refs: MentionRef[]): string[] {
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

- [ ] **Step 5: Run tests — all should pass**

```bash
bun test app/utils/mention-refs.test.ts
```

Expected: `7 pass, 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add app/utils/mention-refs.ts app/utils/mention-refs.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add reconcileMentionRefs util for @-tag → asset-id resolution

Pure helper that takes the textarea text and a list of tracked
{ assetId, filename } picker insertions, then returns the de-duplicated
asset-id list whose `@filename` substring is still present in the text.
This bridges the popover-driven mention insertions to the strict-scope
referencedAssetIds payload sent to the server.
EOF
)"
```

---

### Task 2: Postgres migration — add `p_asset_ids` filter to `match_project_chunks`

**Files:**
- Create: `supabase/migrations/20260429100000_match_project_chunks_asset_filter.sql`

**Goal:** Add an optional `p_asset_ids UUID[]` parameter to the existing RPC. When `NULL` (the default), behavior is unchanged; when non-NULL, chunks are filtered to those asset ids.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260429100000_match_project_chunks_asset_filter.sql`:

```sql
-- ============================================================
-- match_project_chunks: add optional asset-id filter
--
-- Strict-scope @-mention work (D2). When the user explicitly tags one
-- or more knowledge files in their message, the message API needs to
-- restrict RAG retrieval to those files only — otherwise the prompt's
-- "Brand knowledge files" block (which we filter to the same ids in
-- TS) and the RAG chunks block would reference different files.
--
-- Postgres CREATE OR REPLACE FUNCTION cannot change a function's
-- parameter list, so we drop the existing function before recreating
-- it with the new optional parameter at the end.
--
-- p_asset_ids = NULL  → no filter (today's behavior)
-- p_asset_ids non-empty → c.asset_id = ANY(p_asset_ids)
--
-- An empty array is treated like NULL because `ANY('{}')` matches
-- nothing — the explicit IS NULL check makes that branch readable.
-- ============================================================

SET LOCAL search_path = public, extensions;

DROP FUNCTION IF EXISTS public.match_project_chunks(extensions.vector, UUID, INT);

CREATE OR REPLACE FUNCTION public.match_project_chunks(
  query_embedding extensions.vector(1536),
  p_project_id    UUID,
  match_count     INT      DEFAULT 5,
  p_asset_ids     UUID[]   DEFAULT NULL
)
RETURNS TABLE (
  chunk_id     UUID,
  asset_id     UUID,
  asset_name   TEXT,
  asset_category TEXT,
  chunk_index  INT,
  text         TEXT,
  similarity   REAL
)
LANGUAGE SQL STABLE
SET search_path = public, extensions
AS $$
  SELECT
    c.id           AS chunk_id,
    c.asset_id     AS asset_id,
    a.name         AS asset_name,
    a.category     AS asset_category,
    c.chunk_index  AS chunk_index,
    c.text         AS text,
    (1 - (c.embedding <=> query_embedding))::REAL AS similarity
  FROM public.brand_asset_chunks c
  JOIN public.brand_assets a ON a.id = c.asset_id
  WHERE c.project_id = p_project_id
    AND (p_asset_ids IS NULL OR c.asset_id = ANY(p_asset_ids))
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_project_chunks(extensions.vector, UUID, INT, UUID[]) TO service_role;
```

- [ ] **Step 2: Apply the migration**

This step requires DB access. Do NOT run `bun run db:push` from a subagent — it touches the remote Supabase project. Instead, leave a manual instruction in the report and let the controller / user apply it.

Manual command (controller will run, not the subagent):

```bash
bun run db:push
```

Expected output: shows the new migration as "would apply" in the diff, then prompts for confirmation. After confirming, `match_project_chunks` is replaced. If applied successfully, the supabase migration history table records the new migration's timestamp.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/20260429100000_match_project_chunks_asset_filter.sql
git commit -m "$(cat <<'EOF'
feat(rag): add optional asset-id filter to match_project_chunks

DROP + CREATE the RPC to add p_asset_ids UUID[] DEFAULT NULL. When
NULL (the existing call signature's behavior), retrieval is unchanged;
when non-empty, chunks are filtered to those asset ids — used by the
strict-scope @-mention path.
EOF
)"
```

---

### Task 3: `retrieveRelevantChunks` accepts `assetIds`

**Files:**
- Modify: `server/utils/asset-retrieval.ts`

**Goal:** Thread an optional `assetIds?: string[]` parameter into the RPC call as `p_asset_ids`. Treat empty array as no-filter.

- [ ] **Step 1: Update the function signature and RPC call**

Open `server/utils/asset-retrieval.ts`. Find this block:

```ts
export async function retrieveRelevantChunks(
  event: H3Event,
  args: { projectId: string; query: string; matchCount?: number }
): Promise<SelectedChunk[]> {
```

Replace with:

```ts
export async function retrieveRelevantChunks(
  event: H3Event,
  args: { projectId: string; query: string; matchCount?: number; assetIds?: string[] }
): Promise<SelectedChunk[]> {
```

Then find this block (the RPC call):

```ts
  // RPC defined in 20260428000000_brand_asset_chunks.sql.
  const { data, error: rpcErr } = await admin.rpc('match_project_chunks', {
    query_embedding: queryEmbedding,
    p_project_id: args.projectId,
    match_count: matchCount,
  })
```

Replace with:

```ts
  // RPC defined in 20260428000000_brand_asset_chunks.sql, with the
  // optional p_asset_ids parameter added in 20260429100000.
  const scopeIds = args.assetIds && args.assetIds.length > 0 ? args.assetIds : null
  const { data, error: rpcErr } = await admin.rpc('match_project_chunks', {
    query_embedding: queryEmbedding,
    p_project_id: args.projectId,
    match_count: matchCount,
    p_asset_ids: scopeIds,
  })
```

Empty array becomes `null` so the SQL takes the `p_asset_ids IS NULL` branch (= no filter), matching the "tagless message" semantics.

- [ ] **Step 2: Commit**

```bash
git add server/utils/asset-retrieval.ts
git commit -m "$(cat <<'EOF'
feat(rag): retrieveRelevantChunks accepts optional assetIds

Threads the new p_asset_ids RPC parameter through from the message
endpoints so strict-scope @-mention requests only retrieve chunks
from tagged files. Empty array is normalised to NULL so unscoped
calls hit the no-filter SQL branch.
EOF
)"
```

---

### Task 4: `messages.post.ts` — Zod schema, filter, RAG scope, fallback

**Files:**
- Modify: `server/api/projects/[id]/messages.post.ts`

**Goal:** Accept `referenced_asset_ids` in the request body, filter `brand_assets` by those ids before they flow into the prompt builder, scope RAG retrieval to the same ids, and fall back to "all assets" when the requested ids don't resolve to real rows.

The implementer must preserve any uncommitted changes already in this file (the user's WIP touches the `skills` SELECT and skill mapping; D2 only adds new lines and a new field, never overwriting WIP content).

- [ ] **Step 1: Add `referenced_asset_ids` to the Zod schema**

Find this block:

```ts
const Schema = z.object({
  content: z.string().min(1).max(10_000),
  mode: z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional(),
```

ADD a new field right after `mode` (so it sits before any further fields below). Find the line `  mode: z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional(),` and replace it with:

```ts
  mode: z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional(),
  /** UUIDs of brand_assets the user explicitly @-tagged. When non-empty,
   *  the AI's knowledge view is restricted to these assets only; tagless
   *  requests get the default "all assets" behavior. */
  referenced_asset_ids: z.array(z.string().uuid()).optional(),
```

- [ ] **Step 2: Filter `assets` and add the fallback**

After the `Promise.all` that fetches `assets` (look for the destructuring line `{ data: assets },` around the parallel queries), and AFTER the `if (!project) { throw ... }` block, INSERT the filter logic. Find this exact line near the prompt-building section:

```ts
  // 2b. Selective RAG — embed the user message and pull the top-K most
```

INSERT this block IMMEDIATELY ABOVE that comment:

```ts
  // 2a. Strict-scope @-mention — when the user @-tagged specific files,
  // restrict the AI's knowledge view to those files. Falls back to all
  // assets when none of the requested ids resolve (file deleted, RLS
  // rejected, stale client) so the answer isn't context-stripped.
  const requestedIds = parsed.data.referenced_asset_ids ?? []
  const filteredAssets = requestedIds.length > 0
    ? (assets ?? []).filter((a: any) => requestedIds.includes(a.id))
    : (assets ?? [])
  const effectiveAssets = (requestedIds.length > 0 && filteredAssets.length === 0)
    ? (assets ?? [])
    : filteredAssets
  const ragScopeIds = (requestedIds.length > 0 && filteredAssets.length > 0)
    ? requestedIds
    : undefined

```

- [ ] **Step 3: Pass `assetIds` into `retrieveRelevantChunks`**

Find this block:

```ts
  const selectedChunks = await retrieveRelevantChunks(event, {
    projectId,
    query: parsed.data.content,
    matchCount: 5,
  })
```

Replace with:

```ts
  const selectedChunks = await retrieveRelevantChunks(event, {
    projectId,
    query: parsed.data.content,
    matchCount: 5,
    assetIds: ragScopeIds,
  })
```

- [ ] **Step 4: Use `effectiveAssets` in the prompt builder call**

Find this exact block (the user's WIP may have added `description` and `examples` fields to the `skills` mapping just above; do NOT touch those — only the `brandAssets` line below):

```ts
    brandAssets: (assets ?? []).map((a: any) => ({
      name: a.name,
      description: a.description,
      category: a.category,
      extracted_text: a.extracted_text,
      extraction_status: a.extraction_status,
    })),
```

Replace `(assets ?? [])` with `effectiveAssets`:

```ts
    brandAssets: effectiveAssets.map((a: any) => ({
      name: a.name,
      description: a.description,
      category: a.category,
      extracted_text: a.extracted_text,
      extraction_status: a.extraction_status,
    })),
```

- [ ] **Step 5: Type-check the file**

```bash
bun run --bun nuxt typecheck 2>&1 | grep -E "messages.post.ts|asset-retrieval.ts" | head -20
```

Expected: no new errors in those files. Pre-existing repo-wide errors (e.g. `Cannot find module '~/server/utils/...'` in unrelated server files) are not your concern.

- [ ] **Step 6: Commit**

```bash
git add server/api/projects/[id]/messages.post.ts
git commit -m "$(cat <<'EOF'
feat(chat): strict-scope @-mention in messages.post.ts

Accepts referenced_asset_ids in the request body. When non-empty,
filters brand_assets and scopes RAG retrieval to those ids only.
Falls back to all assets if the requested ids don't resolve, so
the answer isn't silently context-stripped on a stale client.
EOF
)"
```

---

### Task 5: `stream.post.ts` — same edits as Task 4

**Files:**
- Modify: `server/api/projects/[id]/messages/stream.post.ts`

**Goal:** Mirror Task 4 in the streaming endpoint. The streaming path is tried first by the client, so without this change scoped requests would silently fall back to today's behavior whenever streaming succeeds.

The implementer must preserve any uncommitted user WIP in this file (skills SELECT + mapping additions, identical to what's in `messages.post.ts`).

- [ ] **Step 1: Add `referenced_asset_ids` to the Zod schema**

Find this block in `server/api/projects/[id]/messages/stream.post.ts`:

```ts
const Schema = z.object({
  content: z.string().min(1).max(10_000),
  mode: z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional(),
```

Find the line `  mode: z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional(),` and replace it with:

```ts
  mode: z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional(),
  /** UUIDs of brand_assets the user explicitly @-tagged. When non-empty,
   *  the AI's knowledge view is restricted to these assets only; tagless
   *  requests get the default "all assets" behavior. */
  referenced_asset_ids: z.array(z.string().uuid()).optional(),
```

- [ ] **Step 2: Insert the filter logic**

Find this exact comment line in the file:

```ts
  // 2b. Selective RAG — embed the user message and pull the top-K most
```

INSERT this block IMMEDIATELY ABOVE that comment:

```ts
  // 2a. Strict-scope @-mention — when the user @-tagged specific files,
  // restrict the AI's knowledge view to those files. Falls back to all
  // assets when none of the requested ids resolve (file deleted, RLS
  // rejected, stale client) so the answer isn't context-stripped.
  const requestedIds = parsed.data.referenced_asset_ids ?? []
  const filteredAssets = requestedIds.length > 0
    ? (assets ?? []).filter((a: any) => requestedIds.includes(a.id))
    : (assets ?? [])
  const effectiveAssets = (requestedIds.length > 0 && filteredAssets.length === 0)
    ? (assets ?? [])
    : filteredAssets
  const ragScopeIds = (requestedIds.length > 0 && filteredAssets.length > 0)
    ? requestedIds
    : undefined

```

- [ ] **Step 3: Pass `assetIds` into `retrieveRelevantChunks`**

Find this block:

```ts
  const selectedChunks = await retrieveRelevantChunks(event, {
    projectId,
    query: parsed.data.content,
    matchCount: 5,
  })
```

Replace with:

```ts
  const selectedChunks = await retrieveRelevantChunks(event, {
    projectId,
    query: parsed.data.content,
    matchCount: 5,
    assetIds: ragScopeIds,
  })
```

- [ ] **Step 4: Use `effectiveAssets` in the prompt builder call**

Find this exact block (the user's WIP may have added `description` and `examples` fields to the `skills` mapping just above; do NOT touch those — only the `brandAssets` line below):

```ts
    brandAssets: (assets ?? []).map((a: any) => ({
      name: a.name,
      description: a.description,
      category: a.category,
      extracted_text: a.extracted_text,
      extraction_status: a.extraction_status,
    })),
```

Replace `(assets ?? [])` with `effectiveAssets`:

```ts
    brandAssets: effectiveAssets.map((a: any) => ({
      name: a.name,
      description: a.description,
      category: a.category,
      extracted_text: a.extracted_text,
      extraction_status: a.extraction_status,
    })),
```

- [ ] **Step 5: Type-check the file**

```bash
bun run --bun nuxt typecheck 2>&1 | grep -E "stream.post.ts" | head -10
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add server/api/projects/[id]/messages/stream.post.ts
git commit -m "$(cat <<'EOF'
feat(chat): strict-scope @-mention in stream.post.ts

Mirrors messages.post.ts. The streaming endpoint is tried first by
the client, so without this change scoped requests would silently
fall back to today's behavior whenever streaming succeeds.
EOF
)"
```

---

### Task 6: `chat.ts` — thread `referencedAssetIds` through send paths

**Files:**
- Modify: `app/stores/chat.ts`

**Goal:** Add an optional third parameter to `sendMessage` and `streamSendMessage`. Include `referenced_asset_ids` in the POST body of both paths only when the array is non-empty.

- [ ] **Step 1: Update `sendMessage` signature and threading**

In `app/stores/chat.ts`, find this exact line:

```ts
  async function sendMessage(content: string, projectId: string) {
```

Replace it with:

```ts
  async function sendMessage(
    content: string,
    projectId: string,
    referencedAssetIds?: string[],
  ) {
```

Then find this exact block (the streaming call site, around line 269):

```ts
      const ok = await streamSendMessage(content, projectId, tempUserId)
```

Replace with:

```ts
      const ok = await streamSendMessage(content, projectId, tempUserId, referencedAssetIds)
```

Then find the non-streaming POST body. Look for this exact block:

```ts
      const result = await $fetch<{ user_message: any; assistant_message: any }>(
        `/api/projects/${projectId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          body: { content, mode: selectedMode.value },
        }
      )
```

Replace with:

```ts
      const result = await $fetch<{ user_message: any; assistant_message: any }>(
        `/api/projects/${projectId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          body: {
            content,
            mode: selectedMode.value,
            ...(referencedAssetIds && referencedAssetIds.length > 0
              ? { referenced_asset_ids: referencedAssetIds }
              : {}),
          },
        }
      )
```

The conditional spread keeps the field absent (rather than `undefined` or `[]`) when there are no tags — preserving existing wire format for tagless requests.

- [ ] **Step 2: Update `streamSendMessage` signature and threading**

Find this block:

```ts
  async function streamSendMessage(
    content: string,
    projectId: string,
    tempUserId: string
  ): Promise<boolean> {
    let response: Response
    try {
      response = await fetch(`/api/projects/${projectId}/messages/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ content, mode: selectedMode.value }),
      })
```

Replace with:

```ts
  async function streamSendMessage(
    content: string,
    projectId: string,
    tempUserId: string,
    referencedAssetIds?: string[],
  ): Promise<boolean> {
    let response: Response
    try {
      const body: Record<string, unknown> = { content, mode: selectedMode.value }
      if (referencedAssetIds && referencedAssetIds.length > 0) {
        body.referenced_asset_ids = referencedAssetIds
      }
      response = await fetch(`/api/projects/${projectId}/messages/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
      })
```

- [ ] **Step 3: Type-check**

```bash
bun run --bun nuxt typecheck 2>&1 | grep "chat.ts" | head -10
```

Expected: no new errors in `chat.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/stores/chat.ts
git commit -m "$(cat <<'EOF'
feat(chat): chatStore.sendMessage accepts referencedAssetIds

Adds an optional third parameter to both sendMessage and
streamSendMessage. When non-empty, included in the POST body as
referenced_asset_ids; when omitted/empty, the field is absent so
the wire format for tagless requests is unchanged.
EOF
)"
```

---

### Task 7: `ChatComposer.vue` — track `mentionRefs` and reconcile on send

**Files:**
- Modify: `app/components/chat/ChatComposer.vue`

**Goal:** Track every picker-inserted mention, reconcile against the textarea text on send, and pass the surviving asset ids into `chatStore.sendMessage`.

- [ ] **Step 1: Add the `MentionRef` type import and tracking ref**

In `app/components/chat/ChatComposer.vue`, find the existing line:

```ts
import type { BrandAsset } from '~/types/project'
```

ADD a second import line right after it:

```ts
import type { MentionRef } from '~/utils/mention-refs'
```

Then find this existing line (the last of the mention state declarations, just before the `mentionFiles` computed):

```ts
const mentionSelectedIndex = ref(0)
```

ADD a new ref directly after that line:

```ts

// Tracks every file the user inserted via the @-popover. We reconcile
// this against the textarea text on send (the user may have deleted
// the @filename text by hand) to build the referencedAssetIds payload.
const mentionRefs = ref<MentionRef[]>([])
```

- [ ] **Step 2: Record the picker selection**

Find the existing `selectMention` function:

```ts
function selectMention(file: BrandAsset) {
  const ta = inputRef.value
  if (!ta) return
  const caret = ta.selectionStart ?? inputText.value.length
  const result = replaceMentionTrigger(
    inputText.value,
    mentionStart.value,
    caret,
    file.name,
  )
  inputText.value = result.text
  mentionOpen.value = false
  nextTick(() => {
    inputRef.value?.setSelectionRange(result.caret, result.caret)
    inputRef.value?.focus()
    autoResize()
  })
}
```

Add a single line that pushes the ref onto `mentionRefs`. Replace the function with:

```ts
function selectMention(file: BrandAsset) {
  const ta = inputRef.value
  if (!ta) return
  const caret = ta.selectionStart ?? inputText.value.length
  const result = replaceMentionTrigger(
    inputText.value,
    mentionStart.value,
    caret,
    file.name,
  )
  inputText.value = result.text
  mentionOpen.value = false
  // Track this insertion so we can resolve filenames → asset ids on send.
  // Reconciliation drops entries whose @filename was later deleted from
  // the textarea, and de-duplicates by assetId.
  mentionRefs.value.push({ assetId: file.id, filename: file.name })
  nextTick(() => {
    inputRef.value?.setSelectionRange(result.caret, result.caret)
    inputRef.value?.focus()
    autoResize()
  })
}
```

- [ ] **Step 3: Reconcile and pass into `chatStore.sendMessage`**

Find the existing `send` function:

```ts
function send() {
  const text = inputText.value.trim()
  if (!text || !projectsStore.activeProjectId) return
  const fullText = attachments.value.length
    ? `${text}\n\n[Attached: ${attachments.value.map((a) => a.name).join(', ')}]`
    : text
  chatStore.sendMessage(fullText, projectsStore.activeProjectId)
  inputText.value = ''
  attachments.value = []
  // Send-button click doesn't blur the textarea, so onBlur won't fire to
  // close the popover. Close it explicitly here for both keyboard and click
  // send paths.
  mentionOpen.value = false
  nextTick(() => {
    if (inputRef.value) inputRef.value.style.height = 'auto'
  })
}
```

Replace the function with:

```ts
function send() {
  const text = inputText.value.trim()
  if (!text || !projectsStore.activeProjectId) return
  const fullText = attachments.value.length
    ? `${text}\n\n[Attached: ${attachments.value.map((a) => a.name).join(', ')}]`
    : text
  // Resolve picker-tracked refs against the (full) message text. Tags whose
  // filename was deleted by hand drop out; duplicates collapse to one id.
  const referencedAssetIds = reconcileMentionRefs(fullText, mentionRefs.value)
  chatStore.sendMessage(
    fullText,
    projectsStore.activeProjectId,
    referencedAssetIds.length > 0 ? referencedAssetIds : undefined,
  )
  inputText.value = ''
  attachments.value = []
  mentionRefs.value = []
  // Send-button click doesn't blur the textarea, so onBlur won't fire to
  // close the popover. Close it explicitly here for both keyboard and click
  // send paths.
  mentionOpen.value = false
  nextTick(() => {
    if (inputRef.value) inputRef.value.style.height = 'auto'
  })
}
```

`reconcileMentionRefs` is auto-imported via `app/utils/`. Passing `undefined` (rather than `[]`) when nothing is tagged keeps `chatStore.sendMessage` from including the field at all — preserving the current wire format for tagless requests.

- [ ] **Step 4: Type-check**

```bash
bun run --bun nuxt typecheck 2>&1 | grep "ChatComposer.vue" | head -10
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/components/chat/ChatComposer.vue
git commit -m "$(cat <<'EOF'
feat(chat): wire mentionRefs tracking + send-time reconciliation

Picker selection pushes { assetId, filename } onto mentionRefs.
On send, reconcileMentionRefs drops entries whose @filename text
the user deleted, de-duplicates, and the surviving ids ride the
POST body as referenced_asset_ids — restricting the AI's view to
the tagged files. Untagged messages are unchanged on the wire.
EOF
)"
```

---

### Task 8: Manual verification

**Files:** none.

**Goal:** Verify the end-to-end strict-scope behavior in the dev server.

- [ ] **Step 1: Apply the migration (if not already done)**

```bash
bun run db:push
```

Confirm the diff shows the `match_project_chunks` function being recreated, then accept.

- [ ] **Step 2: Start the dev server**

```bash
bun run dev
```

Wait for `➜ Local: http://localhost:3000/`.

- [ ] **Step 3: Walk through the test matrix**

Pick a project that already has at least 2 knowledge files. The "Stockbit Instagram" project from prior testing has `LK-WINE-25-Q1.pdf` and `LK-XL-25-Q1.pdf`.

Each scenario should pass; debug before moving on if any fails.

1. **Tagless request unchanged.** Send a message without any `@`. The AI should answer using all knowledge files as before. Inspect the dev server log for the `messages.post` / `messages.stream` prompt — the "Brand knowledge files (N)" header should show all project files.
2. **Single-file scope.** Send `@LK-WINE-25-Q1.pdf summarize the key numbers`. The AI should answer using only the wine file. The prompt log should show "Brand knowledge files (1)" with just that file.
3. **Cross-file isolation.** With only the wine file tagged, ask a question whose answer requires the *other* file (e.g. *"What does this say about XL Q1?"*). The AI should explicitly say it doesn't have that info — proving the other file was excluded.
4. **Multiple-file scope.** Send `@LK-WINE-25-Q1.pdf and @LK-XL-25-Q1.pdf compare quarterly revenue`. The AI should synthesize across both. The prompt log should show "Brand knowledge files (2)".
5. **Manual @ typing.** Type `@LK-WINE-25-Q1.pdf` by hand (no popover). Send. The popover doesn't open, no UUID is tracked, the request is tagless — AI sees all files (default behavior).
6. **Picked then deleted.** Pick a file via popover, then manually delete the inserted `@filename` text. Send. Reconciliation drops the id; the request is tagless.
7. **Tag persistence reset.** Tag and send one message. Send a second message immediately with no `@`. The second message must be tagless (no leakage of prior `mentionRefs`).
8. **Send-button click while popover open.** Type `@`, popover opens, click the **Send** button (not Enter). Popover closes; the message goes through with whatever ids reconciled (likely none, since the trigger `@` alone has no filename).
9. **Stale tag fallback.** Tag a file, then in another tab delete it from the project's Knowledge panel, return and send. The server should fall back to "all assets" — answer is grounded but not strictly scoped.

- [ ] **Step 4: No commit needed for this task**

Manual verification produces no artifact to commit.

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Client tracking via picker selections (B1) | Task 1 (helper), Task 7 (tracking + reconcile) |
| `referencedAssetIds` in POST body | Task 6 (chat store), Task 4 (server schema), Task 5 (stream schema) |
| Server filter on `brand_assets` | Task 4 Step 2, Task 5 Step 2 |
| RAG retrieval scoped (RPC + caller) | Task 2 (migration), Task 3 (caller), Tasks 4 + 5 Step 3 (passing in) |
| Fallback when no IDs resolve | Task 4 Step 2, Task 5 Step 2 |
| Manual typing → no scope | Implicit — only `selectMention` writes to `mentionRefs` |
| Reset on send | Task 7 Step 3 (`mentionRefs.value = []`) |
| Same-name files keep distinct ids | Task 1 test "two different files with same filename string" |
| Streaming endpoint mirrors non-streaming | Task 5 |
| Unit tests on the reconciler | Task 1 |
| Manual test matrix | Task 8 |

**Placeholder scan:** No "TBD" / "TODO" / "implement later" in the plan. Every code step has a complete code block. Every test step has the actual assertion code. Every command has expected output described.

**Type / name consistency:**

- `MentionRef { assetId, filename }` — declared in Task 1, imported in Task 7.
- `reconcileMentionRefs(text, refs): string[]` — defined in Task 1, called in Task 7 Step 3.
- `referencedAssetIds` (camelCase) is the JS-side variable; `referenced_asset_ids` (snake_case) is the wire/Zod field. This convention is consistent across Tasks 4-7.
- `requestedIds` / `filteredAssets` / `effectiveAssets` / `ragScopeIds` — these names appear in both Task 4 and Task 5 with identical semantics, on purpose.
- `assetIds` parameter on `retrieveRelevantChunks` — defined in Task 3, passed in Tasks 4 + 5 as `ragScopeIds`. Correct.
- The Postgres parameter is `p_asset_ids` (Task 2), passed by JS as `p_asset_ids: scopeIds` (Task 3). Correct.
