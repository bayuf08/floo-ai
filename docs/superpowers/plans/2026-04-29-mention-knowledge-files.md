# @-Mention Knowledge File Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing `@` in the chat composer opens a popover listing the active project's knowledge files; selecting one inserts `@<filename>` into the message text.

**Architecture:** Two pure utility functions handle trigger detection and text replacement (testable in isolation with `bun:test`). One presentational popover component renders the file list. The existing `ChatComposer.vue` wires them together via local state plus the textarea's `@input`/`@keydown` events. No backend changes — the message text is sent as-is through the existing `chatStore.sendMessage()` path.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>` Composition API, Pinia (existing `projectsStore`), `bun:test` for unit tests.

**Spec:** [docs/superpowers/specs/2026-04-29-mention-knowledge-files-design.md](docs/superpowers/specs/2026-04-29-mention-knowledge-files-design.md)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `app/utils/mention-parsing.ts` | new | Pure functions: `detectMentionTrigger`, `replaceMentionTrigger`. No DOM, no Vue. |
| `app/utils/mention-parsing.test.ts` | new | `bun:test` unit tests for both functions. |
| `app/components/chat/MentionPopover.vue` | new | Presentational floating list. Props in, events out. No state. |
| `app/components/chat/ChatComposer.vue` | modify | Adds mention state and wires the popover. |

Auto-imports: utilities under `app/utils/` and components under `app/components/` are auto-imported by Nuxt — no explicit `import` lines needed for `detectMentionTrigger`/`replaceMentionTrigger` or `<MentionPopover>` from inside the composer. Types from `~/types/project` (`BrandAsset`) DO need explicit `import type` lines (verified: that's the existing pattern in `app/components/context/ContextAssetCard.vue:209`).

---

### Task 1: `detectMentionTrigger` (pure utility, TDD)

**Files:**
- Create: `app/utils/mention-parsing.ts`
- Create: `app/utils/mention-parsing.test.ts`

**Goal:** Given the textarea text and the caret position, return `{ start, query }` if the caret is inside a valid `@`-trigger range, or `null` otherwise. A trigger is valid only when the `@` is at index 0 OR is preceded by whitespace.

- [ ] **Step 1: Write the failing test file**

Create `app/utils/mention-parsing.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { detectMentionTrigger } from './mention-parsing'

describe('detectMentionTrigger', () => {
  test('empty text → null', () => {
    expect(detectMentionTrigger('', 0)).toBeNull()
  })

  test('text without @ → null', () => {
    expect(detectMentionTrigger('hello', 5)).toBeNull()
  })

  test('@ alone, caret right after → empty query at start 0', () => {
    expect(detectMentionTrigger('@', 1)).toEqual({ start: 0, query: '' })
  })

  test('@LK at start, caret at end → query "LK"', () => {
    expect(detectMentionTrigger('@LK', 3)).toEqual({ start: 0, query: 'LK' })
  })

  test('@ after a space, caret at end → trigger from the @', () => {
    expect(detectMentionTrigger('hi @LK', 6)).toEqual({ start: 3, query: 'LK' })
  })

  test('@ mid-word (email-like) → null', () => {
    expect(detectMentionTrigger('hi@LK', 5)).toBeNull()
  })

  test('two @ tokens, second preceded by space → second trigger wins', () => {
    expect(detectMentionTrigger('@hi @LK', 7)).toEqual({ start: 4, query: 'LK' })
  })

  test('whitespace after the trigger commits — no active trigger', () => {
    expect(detectMentionTrigger('@LK there', 9)).toBeNull()
  })

  test('caret inside the query, not at the end', () => {
    // text = "@LK", caret = 2 → caret is between @ and L? No — between L and K.
    // Walking back from caret: text[1]='L', text[0]='@' → start 0, query = slice(1, 2) = 'L'
    expect(detectMentionTrigger('@LK', 2)).toEqual({ start: 0, query: 'L' })
  })

  test('@ at index 0, caret at 0 (cursor before @) → null (no chars before caret)', () => {
    expect(detectMentionTrigger('@LK', 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Create the empty implementation file so the import resolves**

Create `app/utils/mention-parsing.ts` with just the export signature so the test can import it and fail on the assertion (not on a missing module):

```ts
export interface MentionTrigger {
  /** Index of the `@` character in the source text. */
  start: number
  /** Substring typed after `@` up to the caret (no whitespace inside). */
  query: string
}

export function detectMentionTrigger(_text: string, _caret: number): MentionTrigger | null {
  return null
}
```

- [ ] **Step 3: Run the tests — they should mostly fail**

```bash
bun test app/utils/mention-parsing.test.ts
```

Expected: most tests fail with messages like `expected null to equal { start: 0, query: '' }`. The `null`-returning cases pass trivially. This confirms the test file is wired up.

- [ ] **Step 4: Implement `detectMentionTrigger`**

Replace the stub in `app/utils/mention-parsing.ts`:

```ts
export interface MentionTrigger {
  /** Index of the `@` character in the source text. */
  start: number
  /** Substring typed after `@` up to the caret (no whitespace inside). */
  query: string
}

export function detectMentionTrigger(text: string, caret: number): MentionTrigger | null {
  // Walk backward from the caret. We're looking for an `@` that:
  //   (a) is at the start of the string, or is preceded by whitespace, and
  //   (b) has no whitespace between itself and the caret.
  // Hitting whitespace before any `@` means the trigger has been committed.
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i]!
    if (ch === '@') {
      const prev = i === 0 ? '' : text[i - 1]!
      if (i === 0 || /\s/.test(prev)) {
        return { start: i, query: text.slice(i + 1, caret) }
      }
      return null
    }
    if (/\s/.test(ch)) return null
  }
  return null
}
```

- [ ] **Step 5: Run the tests — they should all pass**

```bash
bun test app/utils/mention-parsing.test.ts
```

Expected: `10 pass, 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add app/utils/mention-parsing.ts app/utils/mention-parsing.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add detectMentionTrigger util for @-mention parsing

Pure function that scans backward from the caret to identify a valid
@-trigger range (either at start of text or preceded by whitespace),
returning { start, query } or null. Foundation for the knowledge-file
picker in the chat composer.
EOF
)"
```

---

### Task 2: `replaceMentionTrigger` (pure utility, TDD)

**Files:**
- Modify: `app/utils/mention-parsing.ts`
- Modify: `app/utils/mention-parsing.test.ts`

**Goal:** Replace the trigger range `[start, caret)` with `@<filename>` plus a single trailing space. If the character immediately after the caret is already whitespace, skip the trailing space (and advance the caret past the existing whitespace) so we don't end up with double-spacing.

- [ ] **Step 1: Append failing tests to `app/utils/mention-parsing.test.ts`**

Add the following block to the bottom of the existing test file (do NOT remove the `detectMentionTrigger` tests):

```ts
import { replaceMentionTrigger } from './mention-parsing'

describe('replaceMentionTrigger', () => {
  test('replaces @LK at end of text with @filename + trailing space', () => {
    // "hi @LK" — start=3, caret=6. Filename "LK-XL-25-Q1.pdf" (15 chars).
    // Expected: "hi @LK-XL-25-Q1.pdf " (20 chars), caret at 20.
    expect(replaceMentionTrigger('hi @LK', 3, 6, 'LK-XL-25-Q1.pdf')).toEqual({
      text: 'hi @LK-XL-25-Q1.pdf ',
      caret: 20,
    })
  })

  test('next char is whitespace — omits trailing space, jumps caret past existing whitespace', () => {
    // "hi @LK after" — start=3, caret=6. Filename "LK-XL-25-Q1.pdf" (15 chars).
    // After is " after" → starts with whitespace, so insertion is "@LK-XL-25-Q1.pdf" (16 chars, no trailing space).
    // Caret = start (3) + insertion length (16) + 1 (skip existing space) = 20.
    expect(replaceMentionTrigger('hi @LK after', 3, 6, 'LK-XL-25-Q1.pdf')).toEqual({
      text: 'hi @LK-XL-25-Q1.pdf after',
      caret: 20,
    })
  })

  test('trigger at index 0', () => {
    expect(replaceMentionTrigger('@', 0, 1, 'LK.pdf')).toEqual({
      text: '@LK.pdf ',
      caret: 8,
    })
  })

  test('trigger at index 0 with text after caret (non-whitespace)', () => {
    expect(replaceMentionTrigger('@xyz', 0, 1, 'LK.pdf')).toEqual({
      // before="" + "@LK.pdf " (8) + "xyz" → "@LK.pdf xyz", caret = 0 + 8 = 8
      text: '@LK.pdf xyz',
      caret: 8,
    })
  })

  test('caret at end of partial query, suffix preserved', () => {
    // "say @LK now" — start=4, caret=7. Filename "LK.pdf" (6 chars).
    // After = " now" → whitespace → insertion = "@LK.pdf" (7 chars, no trailing space).
    // Caret = 4 + 7 + 1 = 12.
    expect(replaceMentionTrigger('say @LK now', 4, 7, 'LK.pdf')).toEqual({
      text: 'say @LK.pdf now',
      caret: 12,
    })
  })
})
```

- [ ] **Step 2: Run tests — replaceMentionTrigger tests should fail**

```bash
bun test app/utils/mention-parsing.test.ts
```

Expected: 5 new failures with `Cannot find module './mention-parsing'` resolving but `replaceMentionTrigger is not a function` (or similar). The 10 passing `detectMentionTrigger` tests stay green.

- [ ] **Step 3: Implement `replaceMentionTrigger`**

Append to `app/utils/mention-parsing.ts`:

```ts
export interface MentionReplacement {
  text: string
  caret: number
}

export function replaceMentionTrigger(
  text: string,
  start: number,
  caret: number,
  filename: string,
): MentionReplacement {
  const before = text.slice(0, start)
  const after = text.slice(caret)
  const nextCharIsWhitespace = after.length > 0 && /\s/.test(after[0]!)
  // Add a trailing space when the suffix doesn't already start with whitespace.
  // If it does, omit the trailing space and let the caret skip past the
  // existing whitespace, so we don't end up with double-spacing.
  const insertion = nextCharIsWhitespace ? `@${filename}` : `@${filename} `
  const newText = before + insertion + after
  const newCaret = nextCharIsWhitespace
    ? start + insertion.length + 1
    : start + insertion.length
  return { text: newText, caret: newCaret }
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
bun test app/utils/mention-parsing.test.ts
```

Expected: `15 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add app/utils/mention-parsing.ts app/utils/mention-parsing.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add replaceMentionTrigger util for @-mention insertion

Replaces a trigger range with `@<filename>` plus a trailing space —
unless the next character is already whitespace, in which case it
skips the extra space and advances the caret past the existing one
to avoid double-spacing. Companion to detectMentionTrigger.
EOF
)"
```

---

### Task 3: `MentionPopover.vue` component

**Files:**
- Create: `app/components/chat/MentionPopover.vue`

**Goal:** A presentational floating list. Receives the filtered file list and the currently-highlighted index; emits `select` and `hover` events. No internal state.

This component does not run automated tests — there is no Vue test harness in the repo (verified during brainstorming). Manual verification happens in Task 4.

- [ ] **Step 1: Create the component**

Write `app/components/chat/MentionPopover.vue`:

```vue
<template>
  <div :style="rootStyle" role="listbox" aria-label="Knowledge files">
    <button
      v-for="(file, idx) in files"
      :key="file.id"
      type="button"
      role="option"
      :aria-selected="idx === selectedIndex"
      @mousedown.prevent="emit('select', file)"
      @mouseenter="emit('hover', idx)"
      :style="itemStyle(idx)"
    >
      <span class="flex items-center justify-center" :style="iconBoxStyle">
        <Icon name="lucide:file-text" class="w-3.5 h-3.5" />
      </span>
      <span class="flex flex-col" :style="{ minWidth: 0, flex: 1, gap: '1px', textAlign: 'left' }">
        <span :style="nameStyle">{{ file.name }}</span>
        <span :style="metaStyle">{{ file.size }}</span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { BrandAsset } from '~/types/project'

const props = defineProps<{
  files: BrandAsset[]
  selectedIndex: number
}>()

const emit = defineEmits<{
  select: [file: BrandAsset]
  hover: [index: number]
}>()

const rootStyle = {
  position: 'absolute' as const,
  bottom: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  maxHeight: '240px',
  overflowY: 'auto' as const,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  boxShadow: 'var(--shadow-md)',
  padding: '4px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '2px',
  zIndex: 30,
}

function itemStyle(idx: number) {
  const isSelected = idx === props.selectedIndex
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: 'var(--r-sm)',
    background: isSelected ? 'var(--brand-tint)' : 'transparent',
    color: 'var(--fg)',
    cursor: 'pointer',
    border: 'none',
    width: '100%',
    transition: 'background 80ms var(--ease-out)',
  }
}

const iconBoxStyle = {
  width: '24px',
  height: '24px',
  borderRadius: '5px',
  background: 'var(--bg-2)',
  color: 'var(--brand)',
  flexShrink: 0,
}

const nameStyle = {
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--fg)',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const metaStyle = {
  fontSize: '11px',
  color: 'var(--fg-3)',
}
</script>
```

Notes on the implementation choices:
- `@mousedown.prevent` (not `@click`) so clicking the popover doesn't blur the textarea before we handle the selection.
- `position: absolute; bottom: calc(100% + 6px)` anchors the popover above the textarea, since the composer sits at the bottom of the viewport.
- `role="listbox"` / `role="option"` / `aria-selected` for screen-reader support.
- No internal selection state — the parent (composer) owns `selectedIndex` because it also handles the keyboard.

- [ ] **Step 2: Commit**

```bash
git add app/components/chat/MentionPopover.vue
git commit -m "$(cat <<'EOF'
feat(chat): add MentionPopover component for knowledge-file picker

Presentational floating list anchored above the chat textarea. Renders
the filtered BrandAsset list, highlights the selected index, and emits
select/hover events. The parent composer owns all state (filter, index,
keyboard handling) — this component is pure presentation.
EOF
)"
```

---

### Task 4: Wire `@`-mention into `ChatComposer.vue`

**Files:**
- Modify: `app/components/chat/ChatComposer.vue`

**Goal:** Wire the popover and parsing utils into the composer: track mention state, detect the trigger on every input, intercept relevant keystrokes while the popover is open, render the popover above the textarea, and replace the trigger range on selection.

- [ ] **Step 1: Add the `BrandAsset` type import and mention state**

Open `app/components/chat/ChatComposer.vue`. Find the `<script setup lang="ts">` line (around line 155) and immediately after the existing `const skillsOpen = ref(false)` line (around line 163), add:

```ts
import type { BrandAsset } from '~/types/project'

// Mention popover state. The popover opens whenever the textarea content
// has a valid @-trigger between the caret and the most recent whitespace
// (or start of text). The composer owns the selected index because the
// textarea retains focus while the popover is rendered.
const mentionOpen = ref(false)
const mentionStart = ref(0)
const mentionQuery = ref('')
const mentionSelectedIndex = ref(0)

const mentionFiles = computed<BrandAsset[]>(() => {
  if (!mentionOpen.value) return []
  const all = projectsStore.activeProject?.contextRules?.brandAssets ?? []
  if (!mentionQuery.value) return all
  const q = mentionQuery.value.toLowerCase()
  return all.filter((a) => a.name.toLowerCase().includes(q))
})

// If the filter narrows to zero, close the popover instead of showing an
// empty list. If the index falls off the end after filtering, snap back to 0.
watch(mentionFiles, (files) => {
  if (!mentionOpen.value) return
  if (files.length === 0) {
    mentionOpen.value = false
  } else if (mentionSelectedIndex.value >= files.length) {
    mentionSelectedIndex.value = 0
  }
})
```

- [ ] **Step 2: Replace `autoResize` wiring with a unified `onInput` handler**

The current template binds `@input="autoResize"` (line 40). Change it to use a new `onInput` function that does both, by editing the `<textarea>` opening tag:

Find this block (around lines 36-46):

```vue
<textarea
  ref="inputRef"
  v-model="inputText"
  @keydown="onKeydown"
  @input="autoResize"
  @focus="focused = true"
  @blur="focused = false"
  placeholder="Ask Floo for a concept, copy, or research — drop files for context"
  :rows="2"
  :style="textareaStyle"
/>
```

Change `@input="autoResize"` to `@input="onInput"` and add a `@blur` handler that ALSO closes the popover, like so:

```vue
<textarea
  ref="inputRef"
  v-model="inputText"
  @keydown="onKeydown"
  @input="onInput"
  @focus="focused = true"
  @blur="onBlur"
  placeholder="Ask Floo for a concept, copy, or research — drop files for context"
  :rows="2"
  :style="textareaStyle"
/>
```

- [ ] **Step 3: Add `onInput`, `onBlur`, and `selectMention` functions**

In the `<script setup>` section, add the following functions just above the existing `function autoResize() {` (around line 306):

```ts
function onInput() {
  autoResize()
  const ta = inputRef.value
  if (!ta) return
  const trigger = detectMentionTrigger(inputText.value, ta.selectionStart ?? 0)
  if (trigger) {
    mentionOpen.value = true
    mentionStart.value = trigger.start
    mentionQuery.value = trigger.query
    mentionSelectedIndex.value = 0
  } else {
    mentionOpen.value = false
  }
}

function onBlur() {
  focused.value = false
  // Close the popover on blur. The popover items use @mousedown.prevent so
  // clicking an option fires `select` BEFORE blur, not after — meaning a
  // click selection still works.
  mentionOpen.value = false
}

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

- [ ] **Step 4: Extend `onKeydown` to handle popover navigation**

Find the existing `onKeydown` function (around lines 294-304):

```ts
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    send()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    send()
  }
}
```

Replace it with the popover-aware version:

```ts
function onKeydown(e: KeyboardEvent) {
  // Mention popover takes priority over send / newline.
  if (mentionOpen.value && mentionFiles.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionSelectedIndex.value =
        (mentionSelectedIndex.value + 1) % mentionFiles.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionSelectedIndex.value =
        (mentionSelectedIndex.value - 1 + mentionFiles.value.length) %
        mentionFiles.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const file = mentionFiles.value[mentionSelectedIndex.value]
      if (file) selectMention(file)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      mentionOpen.value = false
      return
    }
  }

  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    send()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    send()
  }
}
```

- [ ] **Step 5: Render `<MentionPopover>` above the textarea**

In the template, find the `<!-- Input box -->` block (around lines 35-129). The outer `<div :style="inputBoxStyle">` is the visual input container. Wrap it (or add a sibling positioned ancestor) with `position: relative` so the absolutely-positioned popover anchors correctly.

The cleanest edit: change the inputBoxStyle's wrapper context. Look at line 35:

```vue
<!-- Input box -->
<div :style="inputBoxStyle">
```

Change it to:

```vue
<!-- Input box -->
<div :style="[inputBoxStyle, { position: 'relative' }]">
  <MentionPopover
    v-if="mentionOpen && mentionFiles.length > 0"
    :files="mentionFiles"
    :selected-index="mentionSelectedIndex"
    @select="selectMention"
    @hover="(idx: number) => (mentionSelectedIndex = idx)"
  />
```

The closing `</div>` for the input box (around line 129) stays as-is. The popover sits as the FIRST child of the input box and uses `position: absolute; bottom: calc(100% + 6px)` (defined inside `MentionPopover.vue`) to float above.

- [ ] **Step 6: Manual verification — start the dev server**

```bash
bun run dev
```

Wait for `➜ Local: http://localhost:3000/`. Open that URL in a browser, sign in, and pick a project that already has at least one file in **Project context → Knowledge** (e.g. the "Stockbit Instagram" project from the screenshot).

- [ ] **Step 7: Manual verification — run through the test matrix**

In the chat composer at the bottom of the page, verify each of the following. Each item should pass; if any fails, debug before moving on.

- Type `@` at the start of an empty input → popover appears above the textarea, listing knowledge files. First item highlighted.
- Type `@LK` → list filters to filenames containing "LK".
- Type `@nonexistent` → popover closes (filter empty).
- Press `↓` and `↑` → highlight moves; `↓` past the end wraps to the top, `↑` past the start wraps to the bottom.
- Press `Enter` while popover is open → selected file inserted as `@<filename> `, popover closes, caret lands after the trailing space, message NOT sent.
- Press `Tab` while popover is open → same as Enter.
- Press `Esc` → popover closes, no insertion.
- Click a file in the popover → file inserted, popover closes.
- Type some text, then `@` again → popover reopens for the new trigger.
- Type `bayu@gmail.com` → popover does NOT open (the `@` is mid-word).
- Press `Enter` with the popover closed → message sends as before (no regression).
- Press `⌘+Enter` with the popover closed → message sends as before (no regression).
- Send a message containing an `@<filename>` → the rendered message in the thread shows the literal `@<filename>` as plain text. No console errors.
- Project with zero knowledge files: type `@` → popover does not open.

- [ ] **Step 8: Commit**

```bash
git add app/components/chat/ChatComposer.vue
git commit -m "$(cat <<'EOF'
feat(chat): wire @-mention knowledge-file picker into ChatComposer

Adds local mention state (open/start/query/selectedIndex), wires the
textarea's input/keydown/blur events to detectMentionTrigger and
replaceMentionTrigger, and renders MentionPopover above the input.

Selecting a file inserts the literal `@<filename>` plus a trailing
space into the textarea. The message is sent as-is — no backend
changes — since all knowledge files are already auto-included on
every message; the citation just helps the AI focus.
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- A — explicit citation with chip-like text → Tasks 1, 2, 4 (insertion logic + composer wiring) ✓
- B1 — plain text inline (no contenteditable refactor) → Task 4 keeps `<textarea>` intact ✓
- C1 — filter as you type, case-insensitive substring → Task 4 `mentionFiles` computed ✓
- D1 — message text only, no backend → no server task; existing `chatStore.sendMessage()` unchanged ✓
- Trigger rules (start of text or after whitespace; closes on whitespace/Esc/empty match) → Task 1 + Task 4 watch + Task 4 keydown ✓
- Popover anchored above textarea → Task 3 styles + Task 5 wrapper change ✓
- Keyboard nav (↑↓/Enter/Tab/Esc) → Task 4 Step 4 ✓
- No-results behavior (close, not empty state) → Task 4 Step 1 watch ✓
- Unit tests on parsing → Tasks 1, 2 ✓
- Manual verification matrix → Task 4 Steps 6-7 ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later". All code blocks are complete and runnable. All commands have expected output.

**Type/name consistency:**
- `MentionTrigger { start, query }` — used identically in Task 1 implementation, Task 4 `onInput` (`trigger.start`, `trigger.query`).
- `MentionReplacement { text, caret }` — used identically in Task 2 implementation, Task 4 `selectMention` (`result.text`, `result.caret`).
- `mentionOpen` / `mentionStart` / `mentionQuery` / `mentionSelectedIndex` / `mentionFiles` / `selectMention` — used consistently across Steps 1-5 of Task 4.
- `BrandAsset` import path `~/types/project` matches the existing pattern in `app/components/context/ContextAssetCard.vue:209`.
- Auto-import assumption (no explicit imports for `detectMentionTrigger`/`replaceMentionTrigger`/`MentionPopover` from the composer) is consistent with the existing codebase — `ChatComposer.vue` already uses auto-imported `useChatStore`, `useProjectsStore`, `<Icon>`, `<ChatModeSelector>`, `<ComposerSkillsPopover>` without explicit imports.
