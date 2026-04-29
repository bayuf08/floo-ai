# Design: @-Mention Knowledge File Picker

**Date:** 2026-04-29
**Component:** Chat composer

## Goal

When the user types `@` in the chat composer, open a popover listing the active project's knowledge files (`brandAssets`). The user can filter by typing more characters and select a file with keyboard or click. Selecting a file inserts `@<filename>` as plain text into the textarea.

The feature is a UX improvement, not a context-routing change: the AI continues to receive *all* project knowledge files on every message (the existing "permanent files Floo references on every message" behavior is unchanged). The `@<filename>` literal in the message body simply tells the AI which file the user is asking about, improving response accuracy.

## Non-goals

- Inline rich chips (would require refactoring the textarea to `contenteditable`/Tiptap)
- Sending structured `referencedAssetIds: string[]` to the backend
- Hiding/dimming files based on `extractionStatus` (`error`, `pending`, etc.)
- @-mentions for non-file entities (skills, projects, members)
- Per-message file scoping (using `@` to *limit* which files the AI sees)

These can be layered on later if real usage shows they're needed.

## User flow

1. User clicks the textarea, types text. At some point they type `@`.
2. A popover appears anchored above the textarea, listing every `brandAsset` for the active project. The first item is highlighted.
3. As the user types more (`@LK`), the list filters to filenames containing the typed substring (case-insensitive). Highlight resets to first match.
4. The user navigates with `↑`/`↓`, picks with `Enter` / `Tab` / mouse click, or aborts with `Esc`.
5. On selection, the trigger range (`@` plus everything typed since) is replaced with `@<asset.name> ` — full filename including extension, plus a trailing space. The caret lands immediately after the trailing space.
6. The popover closes. The textarea remains focused. The user keeps typing.
7. On send, the message text is submitted as-is via the existing `chatStore.sendMessage(content, projectId)` path. No new fields, no backend changes.

## Trigger and close rules

`@` opens the popover only when:

- It is the first character of the textarea, **or**
- The character immediately before it is whitespace (space, tab, newline)

This rule prevents email addresses (`bayu@gmail.com`) and other in-word `@` from triggering the popover.

Once open, the popover stays open while the user is typing the "query" — the contiguous run of non-whitespace characters from `@` to the caret. The popover closes on:

- `Esc` pressed
- A space, tab, or newline typed (commits the literal `@text` as plain text)
- The trigger `@` is deleted (e.g., backspace past it)
- Click outside the popover and textarea
- The active project is null, or has zero `brandAssets`
- The current filter yields zero matches (cleaner than a "no results" empty state for a first pass)

## File structure

| File | Status | Responsibility |
|---|---|---|
| `app/utils/mention-parsing.ts` | new | Pure string/caret helpers. Two exports: `detectMentionTrigger(text, caret)` returns `{ start: number, query: string } \| null`; `replaceMentionTrigger(text, start, caret, filename)` returns `{ text: string, caret: number }`. No Vue, no DOM — easy to unit-test. |
| `app/components/chat/MentionPopover.vue` | new | Floating list UI. Props: `files: BrandAsset[]`, `selectedIndex: number`. Emits: `select(file: BrandAsset)`, `hover(index: number)`. Pure presentation; no keyboard handling (the textarea owns focus, so the composer translates keystrokes into props). |
| `app/components/chat/ChatComposer.vue` | modified | Adds mention state (`mentionOpen`, `mentionStart`, `mentionQuery`, `mentionSelectedIndex`), wires `@input` to call `detectMentionTrigger`, extends `onKeydown` to intercept `↑`/`↓`/`Enter`/`Tab`/`Esc` while the popover is open, renders `<MentionPopover>` above the textarea, calls `replaceMentionTrigger` on selection. |

`mention-parsing.ts` exists so the tricky caret-and-substring logic can be tested without a DOM. The composer file already mixes UI, styles, and behavior — adding a pure utility module keeps the new code isolated from that and avoids growing `ChatComposer.vue` further than necessary.

## Data

- **Source:** `projectsStore.activeProject?.contextRules?.brandAssets ?? []` — already loaded into the Pinia store; no new fetch needed.
- **Filter:** `asset.name.toLowerCase().includes(query.toLowerCase())` — substring match, not prefix. Matches Slack / Cursor / Notion behavior.
- **Insertion text:** literal `@${asset.name} ` — filename including extension, plus exactly one trailing space.

## Testing

**Unit tests** for `app/utils/mention-parsing.ts`:

- `detectMentionTrigger`:
  - Empty string → `null`
  - `"hello"`, caret at end → `null`
  - `"@"`, caret at 1 → `{ start: 0, query: "" }`
  - `"@LK"`, caret at 3 → `{ start: 0, query: "LK" }`
  - `"hi @LK"`, caret at 6 → `{ start: 3, query: "LK" }`
  - `"hi@LK"`, caret at 5 → `null` (mid-word `@`, e.g. email)
  - `"@hi @LK"`, caret at 7 → `{ start: 4, query: "LK" }` (most recent valid trigger)
  - `"@LK there"`, caret at 9 → `null` (whitespace after trigger commits to plain text)
- `replaceMentionTrigger`:
  - `replaceMentionTrigger("hi @LK", 3, 6, "LK-XL-25-Q1.pdf")` → `{ text: "hi @LK-XL-25-Q1.pdf ", caret: 20 }` (filename is 15 chars; replacement is `@` + 15 + trailing space = 17; new caret = `start (3) + replacement length (17)` = 20)
  - Replace when trigger is at index 0 of the textarea
  - Replace when text continues after the caret — the suffix is preserved verbatim
  - When the character immediately after the caret is already whitespace, the inserted trailing space is omitted to avoid double spaces (e.g. `"hi @LK after"` with caret at 6 → `"hi @LK-XL-25-Q1.pdf after"`, single space)

**Manual verification** for component behavior in the dev server: typing `@`, filtering, keyboard nav, click selection, `Esc`, deleting the trigger, sending the message, and confirming nothing else regressed in the composer (`Enter` to send, `⌘+Enter` to send, attachments, skills popover).

No component-level test harness is configured in this repo (verified during brainstorming exploration), so adding one is out of scope for this change.

## Open questions

None. All four design decisions were confirmed during brainstorming:

- A — explicit citation with chip-like text token
- B1 — plain text inline (keep `<textarea>`, no contenteditable refactor)
- C1 — filter as you type, case-insensitive substring match
- D1 — message text only, no backend changes
