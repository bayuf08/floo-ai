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
