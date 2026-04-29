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
