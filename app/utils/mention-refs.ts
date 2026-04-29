export interface MentionRef {
  assetId: string
  filename: string
}

/**
 * Resolve picker-tracked `{assetId, filename}` insertions against the final
 * textarea content at send time. Returns the de-duplicated list of asset ids
 * whose `@filename` token is still present in `text`, in original ref order.
 *
 * The boundary check after each match prevents false positives when one
 * filename is a string-prefix of another (e.g. `brief.doc` matching inside
 * `@brief.docx`). A genuine match must be followed by a non-filename
 * character — whitespace, end-of-string, or punctuation that wouldn't
 * legally extend a filename.
 */
export function reconcileMentionRefs(text: string, refs: MentionRef[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of refs) {
    const needle = '@' + r.filename
    const idx = text.indexOf(needle)
    if (idx === -1) continue
    const after = text[idx + needle.length]
    // A match is genuine only when the next char (if any) cannot legally
    // be part of a filename. Letters, digits, '.', '-', '_' would extend
    // the name, so reject those.
    if (after !== undefined && /[A-Za-z0-9._-]/.test(after)) continue
    if (seen.has(r.assetId)) continue
    seen.add(r.assetId)
    out.push(r.assetId)
  }
  return out
}
