/**
 * localStorage codec for the optional task-intent (chat mode) selection.
 *
 * Why it lives here: the chat store is a heavy Pinia/Nuxt module that's
 * painful to instantiate in unit tests. The persistence rules are tiny but
 * load-bearing — a regression that silently snaps users back to a
 * previously-set mode would defeat the whole "task intent is optional"
 * change. Extracting the codec keeps it directly testable without booting
 * the full store.
 *
 * Encoding rules:
 *   - missing key (fresh browser) → undefined (default to "no intent")
 *   - 'none' sentinel             → undefined (user explicitly cleared)
 *   - any allowed mode string     → that mode
 *   - anything else (legacy / corrupt) → undefined (safe default)
 */

import type { ContentMode } from '~/types/chat'

export const CHAT_MODE_LS_KEY = 'floo:chat:selectedMode'

/**
 * Sentinel persisted to localStorage when the user has explicitly cleared
 * the task intent. Distinct from a missing key so we can tell "user opted
 * out" apart from "fresh browser, never picked".
 */
export const CHAT_MODE_LS_NONE = 'none'

/**
 * Resolve a raw localStorage value (or null) to a ContentMode or undefined.
 * Pure function — no localStorage / window access here, callers handle that.
 */
export function decodePersistedMode(
  raw: string | null,
  allowed: readonly ContentMode[],
): ContentMode | undefined {
  if (!raw) return undefined
  if (raw === CHAT_MODE_LS_NONE) return undefined
  return (allowed as readonly string[]).includes(raw) ? (raw as ContentMode) : undefined
}

/**
 * Encode a (possibly undefined) mode for persistence. Returns the literal
 * to write into localStorage. The store's setter does the actual write.
 */
export function encodeModeForStorage(mode: ContentMode | undefined): string {
  return mode ?? CHAT_MODE_LS_NONE
}
