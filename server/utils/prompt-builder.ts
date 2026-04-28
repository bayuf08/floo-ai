/**
 * Builds the AI prompt for chat generation.
 *
 * Layers (in priority order — earlier wins when truncation hits):
 *   1. System prompt — Floo·Content persona + content-mode instructions
 *   2. Project context — brand voice, DO/DON'T, hashtags, platform profile
 *   3. Active skills — name + instructions for each enabled skill
 *   4. Saved exemplars — outputs the user explicitly saved (style anchors)
 *   5. Brand knowledge — extracted text from uploaded PDF/DOCX/TXT files
 *   6. Recent chat history — last N turns for continuity
 *   7. Current user message + mode label (+ optional image attachments)
 */
import type { ChatTurn, ContentPart } from './ai'
import { log } from './logger'

export type ContentMode = 'research' | 'competitor' | 'trend' | 'copy' | 'image' | 'video'

const MODE_INSTRUCTIONS: Record<string, string> = {
  research: `The user is asking for research or insight.
Format: lead with a 2–4 sentence synthesis paragraph, then return 3–6 distinct insights as a numbered list. Each numbered item is one standalone insight (not commentary on the previous one).
Quality bar: every insight must be specific — a concrete example, number, behaviour, or named source. No generic platitudes ("brands should be authentic", "engagement is key"). If you can't be specific, omit the point.
Web-search rule: if web search is enabled, ground every factual claim in a returned result and surface the source — the UI will render citations automatically. Don't fabricate URLs or paraphrase a source you didn't see.
Brand-voice interplay: the synthesis paragraph should mirror the project's brand voice if one is set; the numbered insights stay neutral and analytical.`,

  competitor: `The user is asking for competitor analysis.
Format: 1 short framing sentence, then 3–5 numbered findings. Each finding follows the shape: **What [competitor] does** → **Why it works (or doesn't)** → **What the user could borrow.**
Quality bar: name names. Call out the specific account, post format, hook pattern, or visual cue — not a vague category. If web search returns recent posts, quote one line from the actual post and link the source.
Anti-pattern: do not produce SWOT-style abstractions ("their strength is consistency"). Reference observable artifacts (a hook, a thumbnail style, a posting cadence).
Brand-voice interplay: the "what to borrow" line must filter through the project's brand voice — if a competitor's tactic violates a DON'T rule, say so explicitly instead of recommending it.`,

  trend: `The user is asking for current trends.
Format: 3–5 numbered trends. Each trend has: **Trend name** → **Why it's working right now** (1 sentence, with a reason, not just "engagement is up") → **How this brand could ride it** (1 sentence, brand-voice aware, not a copy of someone else's execution).
Quality bar: prefer trends from the last 30 days. Generic evergreen advice ("post more reels") is not a trend — skip it. If web search is on, cite the source post or article that proves the trend exists.
Anti-pattern: don't recommend the brand simply replicate a viral format that conflicts with their voice. Say "this trend is hot but not a fit because [DON'T rule]" rather than forcing it.
Brand-voice interplay: the "how to ride it" line is where brand voice does the heavy lifting — every recommendation must read like the brand could plausibly do it.`,

  copy: `The user is asking you to write copy.
Format: return 5–8 variations as a numbered list. Each variation is one standalone piece of copy (caption, hook, or headline) — no commentary, rationale, or "here's another option" between items.
Quality bar: every line must work as a standalone post. No filler phrases ("in today's world", "it's time to", "let's talk about"). No empty hype words unless the brand voice explicitly uses them.
Brand-voice rule: if brand voice is set, read it before writing and check every line against it. If the brand voice forbids a word, tone, or punctuation choice, never use it — even if the user asked for it explicitly. After the numbered list, add a single short line confirming which brand-voice cues you applied.
If no brand voice is set: produce the copy in a neutral, on-platform default, then add a one-line nudge at the end asking the user to set a brand voice for sharper future output.`,

  image: `The user is asking for image concepts (text descriptions, not generated images).
Format: return exactly 3 distinct visual directions as a numbered list. Each direction has:
  - **Title** (one short noun phrase)
  - **Shot description** (2–3 sentences covering composition, lighting, subject, mood)
  - **Style tag** (one short descriptor — e.g. "editorial film", "flat illustration", "candid iphone")
Quality bar: the three directions must be genuinely distinct — different mood, framing, or medium — not three variations on the same idea. Reference the platform's visual conventions (e.g. vertical 9:16 for TikTok/Reels, square for grid, etc.).
Brand-voice interplay: every direction must be deliverable within the brand's visual rules. If a brand asset (logo, colour palette, font reference) is in the knowledge files, name-drop it where it'd appear in the shot.`,

  video: `The user is asking for video concepts (short-form, hook-led).
Format: return 3 distinct concepts as a numbered list. Each concept follows a beat structure:
  - **Hook (0–2s)** — the first frame / first line that stops the scroll
  - **Build (2–10s)** — what gets developed, with timing cues
  - **Payoff (10–25s)** — the punchline, twist, or value-drop
  - **CTA (final 2s)** — the explicit ask (follow, comment, save, link)
Quality bar: hooks must be visual or verbal in a way that survives no-sound autoplay. CTAs must be one specific verb, not "engage with us." Avoid generic concepts ("a day in the life") unless you give it a specific, brand-distinct twist.
Brand-voice interplay: the hook and CTA carry the brand voice; the build/payoff carry the idea. If brand voice forbids exclamation marks or specific slang, the hook must still work without them.`,
}

const SYSTEM_BASE = `You are Floo, the in-house creative collaborator for Floothink — a digital creative agency.
Your job is to help content strategists generate social-media concepts, copy, and image briefs that match a brand's voice exactly.

Default rules:
- Match the brand voice on file. Don't volunteer your own style.
- Be concise. Front-load the most useful idea.
- When generating multiple variations, return them as a numbered list.
- Match the platform's character limits and content norms.
- If the brand voice forbids hype words, exclamation marks, or specific slang — never use them, even when the user is enthusiastic.
- When the user has uploaded brand-knowledge files, treat them as canonical context — read them before responding and reference what's actually in them rather than inventing generic advice.
- Saved exemplars (when present) are the strongest possible brand signal — when writing copy, prioritise matching their length, vocabulary, and structure over any abstract guidance.
- If you don't have enough context to follow a rule, ask one clarifying question rather than guessing.
- If you have no brand voice, no DO rules, and no DON'T rules in this project, acknowledge in one short line at the start of your first response that you're working without brand context, and invite the user to set it up in Project context → Rules. Only do this once per conversation; subsequent turns proceed normally.`

/** Modes that benefit from web-search grounding. */
export const WEB_SEARCH_MODES = new Set(['research', 'competitor', 'trend'])

export interface BrandAssetForPrompt {
  name: string
  description?: string | null
  category: string
  extracted_text?: string | null
  /**
   * Reflects the asset_content extractor pipeline. When 'pending' or 'error'
   * we surface a marker to the model instead of silently shipping just a
   * filename — the user expects file CONTENT to be used.
   */
  extraction_status?: 'pending' | 'done' | 'error' | 'skipped' | null
}

export interface SavedExemplar {
  label?: string | null
  sub?: string | null
  items: string[]
}

/**
 * One retrieval hit from `match_project_chunks`. When the messages
 * endpoint successfully embeds the user's query and gets chunks back,
 * it passes them via BuildPromptArgs.selectedChunks — the prompt-builder
 * uses these in the brand-knowledge block instead of inlining every
 * asset's full extracted_text.
 */
export interface SelectedChunk {
  asset_name: string
  asset_category?: string | null
  text: string
  /** 0..1 cosine similarity (higher = closer to the query). */
  similarity?: number | null
}

export interface BuildPromptArgs {
  mode?: string
  project: {
    name: string
    platform: string
  }
  context: {
    brand_voice?: string | null
    do_guidelines?: string[] | null
    dont_guidelines?: string[] | null
    hashtags?: string[] | null
    platform_handle?: string | null
    platform_bio?: string | null
    platform_followers?: number | null
  } | null
  skills: { name: string; instructions?: string | null }[]
  brandAssets: BrandAssetForPrompt[]
  /**
   * Top-K vector retrieval hits from match_project_chunks. When provided
   * (non-empty), the brand-knowledge block uses these instead of inlining
   * every asset's full extracted_text — the "selective RAG" path.
   *
   * Falls back to the full-extracted_text path if undefined or empty,
   * which is what happens when:
   *   - pgvector isn't enabled / migration hasn't run
   *   - the project has no embedded chunks yet (pre-RAG assets)
   *   - the embeddings provider failed at query time
   */
  selectedChunks?: SelectedChunk[]
  /**
   * Outputs the user explicitly saved — fed back to the model as
   * "examples to imitate." Already-shipped work is the strongest possible
   * brand signal, but cap it tightly so it doesn't dominate the prompt.
   */
  savedOutputs?: SavedExemplar[]
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  /** Optional image attachments — produce a multimodal user turn (vision model). */
  attachments?: Array<{ url: string; name?: string }>
}

/**
 * Per-asset cap so a single 60k-character PDF doesn't crowd out everything
 * else. The full project's brand-knowledge block is hard-capped below too.
 */
const PER_ASSET_CHARS = 8_000
const TOTAL_KNOWLEDGE_CHARS = 30_000

/**
 * Saved-exemplar caps. We want the model to see *examples* of approved
 * voice/tone, not a full archive — bound both count and total chars.
 */
const MAX_SAVED_EXEMPLARS = 5
const MAX_SAVED_EXEMPLAR_CHARS = 3_000

/**
 * System-prompt budget. Rough proxy for ~10k tokens — generous on GLM-4.5
 * (128k context) but a hard ceiling so a runaway brand_voice + 12 active
 * skills can't crowd out the user's message or history.
 *
 * When the assembled system prompt exceeds this we truncate in priority order:
 *   1. Brand knowledge (drop entirely — already individually capped)
 *   2. Skill instructions (keep names, drop the long-form text)
 *
 * The Floo persona, mode instruction, and project context are never trimmed.
 */
const MAX_SYSTEM_CHARS = 40_000

/**
 * Total-payload budget across system + history + user message. Above this we
 * shrink the history window from 20 → 10 turns (oldest dropped first).
 */
const MAX_TOTAL_CHARS = 50_000

const TRUNCATION_MARKER = '\n\n[…context truncated]'

export function buildChatPrompt(args: BuildPromptArgs): ChatTurn[] {
  const turns: ChatTurn[] = []

  // ─── Build each layer as its own string so we can drop / truncate by
  //     priority instead of trimming a single mega-string blindly. ───
  let baseAndMode = SYSTEM_BASE
  if (args.mode && MODE_INSTRUCTIONS[args.mode]) {
    baseAndMode += `\n\n## Mode\n${MODE_INSTRUCTIONS[args.mode]}`
  }

  const ctx = args.context
  const ctxLines: string[] = []
  if (ctx?.brand_voice) ctxLines.push(`### Brand voice\n${ctx.brand_voice}`)
  if (ctx?.do_guidelines?.length)
    ctxLines.push(`### DO\n${ctx.do_guidelines.map((g) => `- ${g}`).join('\n')}`)
  if (ctx?.dont_guidelines?.length)
    ctxLines.push(`### DON'T\n${ctx.dont_guidelines.map((g) => `- ${g}`).join('\n')}`)
  if (ctx?.hashtags?.length) ctxLines.push(`### Hashtags\n${ctx.hashtags.join(' ')}`)
  ctxLines.push(buildPlatformProfileBlock(args.project, ctx))
  const projectContextBlock = ctxLines.length
    ? `\n\n## Project context\n${ctxLines.join('\n\n')}`
    : ''

  // Skills — full version (with instructions) and a fallback minimal version.
  const skillsPreamble =
    'The following skills are active for this project. Apply their instructions in addition to the base rules above — they sharpen, not replace, the brand voice.'
  const fullSkillsBlock = args.skills.length
    ? `\n\n## Active skills\n${skillsPreamble}\n${args.skills
        .map((s) => `- **${s.name}**${s.instructions ? `: ${s.instructions}` : ''}`)
        .join('\n')}`
    : ''
  const minimalSkillsBlock = args.skills.length
    ? `\n\n## Active skills\n${skillsPreamble}\n${args.skills.map((s) => `- **${s.name}**`).join('\n')}${TRUNCATION_MARKER}`
    : ''

  const exemplarsBlock = args.savedOutputs?.length
    ? renderSavedExemplars(args.savedOutputs)
    : ''

  // Prefer the RAG path when retrieval gave us chunks. Falls back to
  // inlining full extracted_text when:
  //   - selectedChunks is empty/undefined (no retrieval performed),
  //   - or the project has assets that simply don't have chunks yet
  //     (pre-RAG uploads waiting to be backfilled).
  const knowledgeBlock = args.selectedChunks?.length
    ? renderRetrievedChunks(args.selectedChunks)
    : args.brandAssets.length
      ? (() => {
          const k = renderBrandKnowledge(args.brandAssets)
          if (!k) return ''
          const fileCount = args.brandAssets.length
          const fileNoun = fileCount === 1 ? 'file' : 'files'
          return `\n\n## Brand knowledge ${fileNoun} (${fileCount})\nThese are permanent reference files uploaded by the user for this project. Treat them as canonical context — quote directly when relevant, do not paraphrase inaccurately, and do not invent details that aren't in the source text.\n${k}`
        })()
      : ''

  // ─── Assemble + apply priority-based truncation ─────────
  // Layer order, highest priority first: base/mode + project context are
  // never touched. Then skills, then saved exemplars, then knowledge.
  const core = baseAndMode + projectContextBlock
  let skillsBlock = fullSkillsBlock
  let xBlock = exemplarsBlock
  let kBlock = knowledgeBlock

  let system = core + skillsBlock + xBlock + kBlock
  if (system.length > MAX_SYSTEM_CHARS) {
    // 1. Drop brand knowledge entirely (lowest priority).
    kBlock = knowledgeBlock
      ? `\n\n## Brand knowledge files${TRUNCATION_MARKER}`
      : ''
    system = core + skillsBlock + xBlock + kBlock
  }
  if (system.length > MAX_SYSTEM_CHARS) {
    // 2. Drop saved exemplars next.
    xBlock = exemplarsBlock ? `\n\n## Saved exemplars${TRUNCATION_MARKER}` : ''
    system = core + skillsBlock + xBlock + kBlock
  }
  if (system.length > MAX_SYSTEM_CHARS) {
    // 3. Strip skill instructions, keep names only.
    skillsBlock = minimalSkillsBlock
    system = core + skillsBlock + xBlock + kBlock
  }
  if (system.length > MAX_SYSTEM_CHARS) {
    // 4. Last resort — hard-truncate the tail. Keep the persona/mode/context
    //    intact and lop off whatever's at the end.
    system = system.slice(0, MAX_SYSTEM_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
  }

  turns.push({ role: 'system', content: system })

  // ─── Recent history — slice 20 by default, 10 when total payload is large ───
  const historyAll = args.history.slice(-20)
  const historyChars = historyAll.reduce((n, m) => n + (m.content?.length ?? 0), 0)
  const userChars = args.userMessage.length
  const historySlice =
    system.length + historyChars + userChars > MAX_TOTAL_CHARS
      ? args.history.slice(-10)
      : historyAll
  for (const m of historySlice) {
    turns.push({ role: m.role, content: m.content })
  }

  // ─── Current user message ────────────────────────────────
  if (args.attachments?.length) {
    // Multimodal turn — text + image_url parts (consumed by glm-4v / gpt-4o)
    const parts: ContentPart[] = [{ type: 'text', text: args.userMessage }]
    for (const a of args.attachments) {
      parts.push({ type: 'image_url', image_url: { url: a.url } })
    }
    turns.push({ role: 'user', content: parts })
  } else {
    turns.push({ role: 'user', content: args.userMessage })
  }

  return turns
}

/**
 * Render saved exemplars as a bulleted list grouped by card label.
 *
 * These are outputs the user explicitly saved from past chats, so we frame
 * them as "examples to imitate" rather than "rules to follow." Hard-capped
 * at MAX_SAVED_EXEMPLARS items / MAX_SAVED_EXEMPLAR_CHARS chars so a long
 * archive can't crowd the prompt.
 */
function renderSavedExemplars(outputs: SavedExemplar[]): string {
  if (!outputs.length) return ''

  let total = 0
  const sections: string[] = []

  outerLoop: for (const out of outputs.slice(0, MAX_SAVED_EXEMPLARS)) {
    const heading = out.label ? `### ${out.label}${out.sub ? ` — ${out.sub}` : ''}` : '### Saved'
    const lines: string[] = [heading]
    for (const item of out.items) {
      const line = `- ${item.replace(/\s+/g, ' ').trim()}`
      const projected = total + heading.length + line.length + 2
      if (projected > MAX_SAVED_EXEMPLAR_CHARS) {
        lines.push('- [...truncated]')
        sections.push(lines.join('\n'))
        break outerLoop
      }
      lines.push(line)
      total += line.length + 1
    }
    total += heading.length + 1
    sections.push(lines.join('\n'))
  }

  if (!sections.length) return ''
  return (
    '\n\n## Saved exemplars\n' +
    'These are outputs the user has explicitly saved from past chats. ' +
    'Treat them as canonical examples of the brand voice — match their tone and rhythm.\n\n' +
    sections.join('\n\n')
  )
}

/**
 * Render the retrieved-chunks variant of the brand-knowledge block.
 *
 * Each chunk is shown under its source filename so the model can quote
 * accurately ("from the brand-guide PDF: …"). Chunks from the same file
 * are grouped to keep the block scannable. Total length is capped at
 * the same TOTAL_KNOWLEDGE_CHARS budget the inline path uses, so RAG
 * never produces a *bigger* prompt than the fallback would have.
 */
function renderRetrievedChunks(chunks: SelectedChunk[]): string {
  // Group by asset name preserving the rank order (the FIRST appearance
  // of each asset wins its position in the block).
  const order: string[] = []
  const grouped = new Map<string, SelectedChunk[]>()
  for (const chunk of chunks) {
    const key = chunk.asset_name || 'unknown source'
    if (!grouped.has(key)) {
      grouped.set(key, [])
      order.push(key)
    }
    grouped.get(key)!.push(chunk)
  }

  let total = 0
  const sections: string[] = []
  outerLoop: for (const name of order) {
    const heading = `### ${name}`
    const lines: string[] = [heading]
    total += heading.length + 1
    for (const chunk of grouped.get(name) ?? []) {
      const body = chunk.text.trim()
      if (!body) continue
      const projected = total + body.length + 4 // \n> + a wrap
      if (projected > TOTAL_KNOWLEDGE_CHARS) {
        lines.push('> [...further chunks truncated]')
        sections.push(lines.join('\n'))
        break outerLoop
      }
      // Quote-prefix each chunk so the model treats it as source
      // material rather than instructions.
      lines.push('> ' + body.replace(/\n/g, '\n> '))
      total += body.length + 2
    }
    sections.push(lines.join('\n'))
  }

  if (!sections.length) return ''
  const noun = chunks.length === 1 ? 'excerpt' : 'excerpts'
  return (
    `\n\n## Brand knowledge — ${chunks.length} relevant ${noun}\n` +
    'These passages were retrieved from the user\'s uploaded brand files based on relevance to the current message. Treat them as canonical context — quote directly when relevant, do not paraphrase inaccurately, and do not invent details that aren\'t in the source text.\n\n' +
    sections.join('\n\n')
  )
}

/**
 * Render the brand-knowledge block. Files with extracted text get inlined
 * (truncated per-asset and total); files without extraction (images, etc.)
 * fall back to a name + description mention.
 */
function renderBrandKnowledge(assets: BrandAssetForPrompt[]): string {
  let total = 0
  const sections: string[] = []

  // Inline extracted-text files first — they're the most useful to the model.
  for (const a of assets) {
    if (!a.extracted_text) continue
    const remaining = TOTAL_KNOWLEDGE_CHARS - total
    if (remaining <= 200) break
    const allowed = Math.min(PER_ASSET_CHARS, remaining)
    let body = a.extracted_text.slice(0, allowed)
    if (a.extracted_text.length > body.length) body += '\n[…truncated]'
    total += body.length
    const desc = a.description ? ` — ${a.description}` : ''
    sections.push(`### ${a.name} (${a.category})${desc}\n${body}`)
  }

  // Then list non-extracted files (images, video, etc.) by name only.
  // Surface extraction state so the model knows whether content is genuinely
  // visual (image/video) vs a doc whose text we couldn't parse.
  const refs = assets
    .filter((a) => !a.extracted_text)
    .map((a) => {
      const desc = a.description ? ` — ${a.description}` : ''
      let suffix = ''
      if (a.extraction_status === 'error') {
        suffix = ' [content unavailable — extraction failed; ask the user to re-upload]'
      } else if (a.extraction_status === 'pending') {
        suffix = ' [indexing in progress — content not yet available]'
      }
      return `- **${a.name}** (${a.category})${desc}${suffix}`
    })
  if (refs.length) {
    sections.push(`### Other attached files\n${refs.join('\n')}`)
  }

  return sections.join('\n\n')
}

/**
 * Build a focused image-generation prompt from the user's request + brand
 * context. The result is fed straight into CogView-3 via /images/generations.
 *
 * We keep this short — CogView prompts work best at 1–3 sentences.
 */
export function buildImagePrompt(args: {
  userMessage: string
  context: BuildPromptArgs['context']
  brandAssets: BrandAssetForPrompt[]
}): string {
  const lines: string[] = [args.userMessage.trim()]

  if (args.context?.brand_voice) {
    lines.push(`Visual mood should match the brand voice: ${args.context.brand_voice}`)
  }
  if (args.context?.dont_guidelines?.length) {
    const negs = args.context.dont_guidelines.slice(0, 3).join('; ')
    lines.push(`Avoid: ${negs}`)
  }

  // Include up to one short snippet from a brand-knowledge file as style cue.
  const stylefile = args.brandAssets.find((a) => a.extracted_text)
  if (stylefile?.extracted_text) {
    lines.push(
      `Style cue from brand file "${stylefile.name}": ${stylefile.extracted_text.slice(0, 280)}`
    )
  }

  // Cap total prompt length — CogView truncates anything past ~1k chars hard.
  return lines.join(' ').slice(0, 900)
}

/**
 * Heuristic parser that splits the AI's response into a body + optional
 * numbered output card. The frontend ChatOutputCard expects { items: string[] }.
 *
 * Mode hints let us pick a more specific card label/accent without changing
 * the parsing logic.
 */
export function parseAssistantResponse(
  content: string,
  mode?: string
): {
  body: string
  card?: { label: string; items: string[]; sub?: string; accent?: string }
} {
  const lines = content.split('\n')
  const numbered: string[] = []
  let cardStart = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? ''
    const match = line.match(/^(\d+)[.)]\s+(.+)$/)
    if (match) {
      if (cardStart === -1) cardStart = i
      numbered.push(match[2]!.trim())
    }
  }

  if (numbered.length >= 3 && cardStart !== -1) {
    const body = lines.slice(0, cardStart).join('\n').trim()
    const labels = MODE_CARD_DEFAULTS[mode ?? ''] ?? { label: 'Variations', accent: 'var(--ft-blue)' }
    return {
      body,
      card: {
        label: labels.label,
        accent: labels.accent,
        sub: `${numbered.length} ${numbered.length === 1 ? 'option' : 'options'}`,
        items: numbered,
      },
    }
  }

  return { body: content.trim() }
}

/**
 * Dev-only — log the assembled GLM prompt when FLOO_LOG_PROMPTS=1.
 *
 * Writes the system prompt verbatim plus a one-line summary of dialog turns to
 * logs/app.log via the shared logger. Returns immediately when the flag is off
 * (no string formatting cost in prod).
 *
 * Usage from a route handler:
 *   logChatPrompt('messages.post', { projectId, mode, messages })
 */
export function logChatPrompt(
  context: string,
  args: {
    projectId?: string
    mode?: string
    messages: ChatTurn[]
  }
): void {
  if (process.env.FLOO_LOG_PROMPTS !== '1') return

  const system = args.messages.find((m) => m.role === 'system')
  const dialog = args.messages.filter((m) => m.role !== 'system')
  const systemText =
    typeof system?.content === 'string'
      ? system.content
      : (system?.content ?? []).map((p: any) => (p.type === 'text' ? p.text : '[image]')).join(' ')

  log.debug(`[prompt:${context}]`, 'assembled GLM prompt', {
    projectId: args.projectId,
    mode: args.mode,
    systemLength: systemText.length,
    dialogTurns: dialog.length,
    system: systemText,
    dialog: dialog.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content.slice(0, 500)
          : m.content.map((p: any) => (p.type === 'text' ? p.text.slice(0, 500) : '[image]')),
    })),
  })
}

/**
 * Bucketed annotation for the platform profile block. The model gets a
 * short hint about how to calibrate tone for this stage of audience growth
 * — "mid-tier creator — conversational, not corporate" reads more usefully
 * to the model than a raw `45000` int.
 *
 * Buckets are mirrored in `app/components/context/ContextPlatformTab.vue`
 * so the user sees the same band Floo will read. Keep them in sync.
 */
function followerBandHint(followers: number | null | undefined): string | null {
  if (followers == null) return null
  const n = Number(followers)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1_000) return 'emerging account — focus on authenticity and community'
  if (n < 10_000) return 'growing account — mix engagement and reach'
  if (n < 100_000) return 'mid-tier creator — conversational, not corporate'
  if (n < 1_000_000) return 'established creator — brand-safe, high production value expected'
  return 'mega creator — mass audience, broad appeal'
}

/** Format the per-project section of the system prompt. Includes a
 *  follower-band annotation when followers are set so the model gets a
 *  qualitative cue, not just a number. */
function buildPlatformProfileBlock(
  project: BuildPromptArgs['project'],
  ctx: BuildPromptArgs['context']
): string {
  const lines: string[] = ['### Project', `Name: ${project.name}`, `Platform: ${project.platform}`]
  if (ctx?.platform_handle) lines.push(`Handle: ${ctx.platform_handle}`)
  if (ctx?.platform_followers) {
    const hint = followerBandHint(ctx.platform_followers)
    const formatted = ctx.platform_followers.toLocaleString('en-US')
    lines.push(`Followers: ${formatted}${hint ? ` (${hint})` : ''}`)
  }
  if (ctx?.platform_bio) lines.push(`Bio: "${ctx.platform_bio}"`)
  return lines.join('\n')
}

const MODE_CARD_DEFAULTS: Record<string, { label: string; accent: string }> = {
  research: { label: 'Insights', accent: 'var(--brand)' },
  competitor: { label: 'Competitor patterns', accent: 'var(--ft-blue)' },
  trend: { label: 'Trends', accent: 'var(--ft-green)' },
  copy: { label: 'Hooks', accent: 'var(--brand)' },
  image: { label: 'Image directions', accent: 'var(--ft-amber)' },
  video: { label: 'Video concepts', accent: 'var(--ft-coral)' },
}
