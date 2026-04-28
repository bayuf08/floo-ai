/**
 * Token-aware text chunker for the brand-knowledge embedding pipeline.
 *
 * Splits an asset's extracted plaintext into ~512-token windows with
 * ~50-token overlap, preferring paragraph and sentence boundaries so a
 * chunk doesn't end mid-sentence whenever it can be helped.
 *
 * Tokenisation uses a chars-per-token heuristic instead of pulling in
 * tiktoken — text-embedding-3-small ratchets between 3.5–4.5 chars per
 * token for English, so the heuristic is accurate to within ~15%, which
 * is fine for "stay under 8191" (the model's hard limit). When precision
 * matters (e.g. cost-budgeting at scale), swap in a real tokeniser.
 *
 * Why not just use a recursive splitter from langchain? A 1.2MB dep tree
 * for one regex split is overkill, and the existing codebase has no
 * langchain elsewhere.
 */

const CHARS_PER_TOKEN = 4
const TARGET_TOKENS = 512
const OVERLAP_TOKENS = 50

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN
// Hard upper bound — text-embedding-3-small accepts up to 8191 tokens
// per input. We stay well under it so overlap can grow into the next
// window without re-chunking.
const MAX_CHARS = 6_000

export interface TextChunk {
  /** Ordinal within the source document, 0-based. */
  index: number
  /** Verbatim slice of the source text (post-normalisation). */
  text: string
  /** Approximate token count — chars / 4, floored. */
  tokens: number
}

/**
 * Split `source` into overlapping chunks. The returned text is verbatim
 * apart from the whitespace normalisation already applied by
 * extractAssetText() in asset-content.ts — no further trimming, so the
 * chunk text can be quoted in the prompt without double-processing.
 *
 * Strategy:
 *   1. Tokenise into paragraphs (split on blank lines).
 *   2. Greedily pack paragraphs into a window until the next paragraph
 *      would exceed TARGET_CHARS.
 *   3. If a single paragraph exceeds TARGET_CHARS, fall back to a
 *      sentence split (split on `.!?` followed by whitespace).
 *   4. If a single sentence exceeds MAX_CHARS, hard-cut at MAX_CHARS.
 *   5. Each new window starts with the trailing OVERLAP_CHARS of the
 *      previous one so we don't lose context that straddles a boundary.
 *
 * Empty input returns an empty array.
 */
export function chunkText(source: string): TextChunk[] {
  if (!source || !source.trim()) return []

  const paragraphs = splitParagraphs(source)
  const windows: string[] = []
  let buffer = ''

  for (const para of paragraphs) {
    // A single paragraph that's already too big — flush whatever's
    // buffered, then explode the paragraph itself into sentence
    // sub-windows.
    if (para.length > TARGET_CHARS) {
      if (buffer) {
        windows.push(buffer)
        buffer = ''
      }
      for (const sub of splitOversizedParagraph(para)) {
        windows.push(sub)
      }
      continue
    }

    // Would adding this paragraph push us over? Flush the buffer first.
    const projected = buffer ? buffer.length + 2 + para.length : para.length
    if (buffer && projected > TARGET_CHARS) {
      windows.push(buffer)
      buffer = ''
    }

    buffer = buffer ? `${buffer}\n\n${para}` : para
  }

  if (buffer) windows.push(buffer)

  // Apply overlap. Each window from index 1 onward gets prefixed with the
  // last OVERLAP_CHARS of the previous window — keeps phrases that
  // straddle a boundary findable from either side.
  const withOverlap: string[] = []
  for (let i = 0; i < windows.length; i++) {
    const current = windows[i]!
    if (i === 0) {
      withOverlap.push(current)
      continue
    }
    const prev = windows[i - 1]!
    const tail = prev.slice(Math.max(0, prev.length - OVERLAP_CHARS))
    // If the overlap would push the chunk over MAX_CHARS, drop it. Better
    // to lose the overlap than to overflow the model's input limit.
    const candidate = `${tail}\n\n${current}`
    withOverlap.push(candidate.length <= MAX_CHARS ? candidate : current)
  }

  return withOverlap.map((text, index) => ({
    index,
    text,
    tokens: Math.floor(text.length / CHARS_PER_TOKEN),
  }))
}

/**
 * Split on blank lines (one or more newlines surrounding optional
 * whitespace). Trims each piece — empty paragraphs are dropped.
 */
function splitParagraphs(source: string): string[] {
  return source
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Fallback for paragraphs that are themselves bigger than TARGET_CHARS.
 * Sentence-splits and re-packs into target-sized windows. If even a
 * single sentence exceeds MAX_CHARS (e.g. a wall of text with no
 * punctuation), hard-cut at MAX_CHARS. We accept the awkward boundary —
 * embedding a half-sentence is still better than a 502 from OpenAI.
 */
function splitOversizedParagraph(paragraph: string): string[] {
  const sentences = paragraph
    // Split on sentence-ending punctuation followed by whitespace, but
    // keep the punctuation attached to the preceding sentence.
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 0)

  const out: string[] = []
  let buffer = ''

  for (const sentence of sentences) {
    // Sentence on its own is too big — hard-cut into MAX_CHARS slices.
    if (sentence.length > MAX_CHARS) {
      if (buffer) {
        out.push(buffer)
        buffer = ''
      }
      for (let i = 0; i < sentence.length; i += MAX_CHARS) {
        out.push(sentence.slice(i, i + MAX_CHARS))
      }
      continue
    }

    const projected = buffer ? buffer.length + 1 + sentence.length : sentence.length
    if (buffer && projected > TARGET_CHARS) {
      out.push(buffer)
      buffer = sentence
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence
    }
  }

  if (buffer) out.push(buffer)
  return out
}

// Test-only export — keeps the public surface (chunkText) clean while
// letting the test runner inspect the helpers directly.
export const __testInternals = {
  splitParagraphs,
  splitOversizedParagraph,
  CHARS_PER_TOKEN,
  TARGET_CHARS,
  OVERLAP_CHARS,
  MAX_CHARS,
}
