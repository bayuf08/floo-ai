/**
 * Builds the AI prompt for chat generation.
 *
 * Layers:
 *   1. System prompt — Floo·Content persona + content-mode instructions
 *   2. Project context — brand voice, DO/DON'T, hashtags, platform profile
 *   3. Active skills — name + instructions for each enabled skill
 *   4. Brand assets — names, descriptions, and extracted text (PDF/DOCX/TXT)
 *   5. Recent chat history — last N turns for continuity
 *   6. Current user message + mode label
 */
import type { ChatTurn } from './ai'

const MODE_INSTRUCTIONS: Record<string, string> = {
  research:
    'The user is asking for research or insight. Cite specific examples, numbers, and references where you can. Avoid generic platitudes.',
  competitor:
    'The user is asking for competitor analysis. Compare directly, name names, and call out the patterns the competitor uses well or poorly.',
  trend:
    'The user is asking for current trends. Surface the trend, why it works right now, and how the brand could thoughtfully participate without copying.',
  copy:
    'The user is asking you to write copy. Match brand voice exactly. Default to short, scannable, on-platform.',
  image:
    'The user is asking for image concepts. Return 3 distinct visual directions, each with a one-line title, a 2–3 sentence shot description, and a tag describing the style.',
  video:
    'The user is asking for video concepts. Return beat-by-beat outlines (hook → build → payoff → CTA) with timing cues.',
}

const SYSTEM_BASE = `You are Floo, the in-house creative collaborator for Floothink — a digital creative agency.
Your job is to help content strategists generate social-media concepts, copy, and image briefs that match a brand's voice exactly.

Default rules:
- Match the brand voice on file. Don't volunteer your own style.
- Be concise. Front-load the most useful idea.
- When generating multiple variations, return them as a numbered list.
- Match the platform's character limits and content norms.
- If the brand voice forbids hype words, exclamation marks, or specific slang — never use them, even when the user is enthusiastic.
- If you don't have enough context to follow a rule, ask one clarifying question rather than guessing.`

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
  brandAssets: {
    name: string
    description?: string | null
    category: string
    extracted_text?: string | null
    extraction_status?: 'pending' | 'done' | 'skipped' | 'error' | null
  }[]
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
}

/** Per-asset cap so a single huge PDF can't crowd out the rest of the prompt. */
const MAX_ASSET_TEXT_CHARS = 30_000
/** Total cap across all assets in the prompt. */
const MAX_TOTAL_ASSET_TEXT_CHARS = 60_000

export function buildChatPrompt(args: BuildPromptArgs): ChatTurn[] {
  const turns: ChatTurn[] = []

  // ─── System layer ────────────────────────────────────────
  let system = SYSTEM_BASE
  if (args.mode && MODE_INSTRUCTIONS[args.mode]) {
    system += `\n\n## Mode\n${MODE_INSTRUCTIONS[args.mode]}`
  }

  // Project context block
  const ctx = args.context
  const ctxLines: string[] = []
  if (ctx?.brand_voice) ctxLines.push(`### Brand voice\n${ctx.brand_voice}`)
  if (ctx?.do_guidelines?.length)
    ctxLines.push(`### DO\n${ctx.do_guidelines.map((g) => `- ${g}`).join('\n')}`)
  if (ctx?.dont_guidelines?.length)
    ctxLines.push(`### DON'T\n${ctx.dont_guidelines.map((g) => `- ${g}`).join('\n')}`)
  if (ctx?.hashtags?.length) ctxLines.push(`### Hashtags\n${ctx.hashtags.join(' ')}`)
  ctxLines.push(
    `### Project\nName: ${args.project.name}\nPlatform: ${args.project.platform}` +
      (ctx?.platform_handle ? `\nHandle: ${ctx.platform_handle}` : '') +
      (ctx?.platform_followers ? `\nFollowers: ${ctx.platform_followers}` : '') +
      (ctx?.platform_bio ? `\nBio: ${ctx.platform_bio}` : '')
  )

  if (ctxLines.length) system += `\n\n## Project context\n${ctxLines.join('\n\n')}`

  // Skills layer
  if (args.skills.length) {
    const skillLines = args.skills
      .map((s) => `- **${s.name}**${s.instructions ? `: ${s.instructions}` : ''}`)
      .join('\n')
    system += `\n\n## Active skills\n${skillLines}`
  }

  // Brand assets layer — render name + description + (when available) extracted text.
  if (args.brandAssets.length) {
    const blocks: string[] = []
    let remaining = MAX_TOTAL_ASSET_TEXT_CHARS

    for (const a of args.brandAssets) {
      const header = `### ${a.name} (${a.category})${a.description ? ` — ${a.description}` : ''}`

      if (a.extraction_status === 'pending') {
        blocks.push(`${header}\n_(indexing in progress — content not yet available)_`)
        continue
      }
      if (a.extraction_status === 'error') {
        blocks.push(
          `${header}\n_(content unavailable — extraction failed; ask the user to re-upload)_`,
        )
        continue
      }
      if (a.extraction_status === 'skipped') {
        blocks.push(`${header}\n_(visual or non-textual asset — refer by name only)_`)
        continue
      }

      const text = a.extracted_text?.trim()
      if (!text) {
        blocks.push(header)
        continue
      }

      const perAssetBudget = Math.min(MAX_ASSET_TEXT_CHARS, remaining)
      if (perAssetBudget <= 0) {
        blocks.push(`${header}\n_(omitted — total knowledge budget exhausted)_`)
        continue
      }

      const truncated = text.length > perAssetBudget
      const slice = truncated ? text.slice(0, perAssetBudget) : text
      remaining -= slice.length

      const suffix = truncated ? `\n…(truncated, ${text.length - slice.length} more chars)` : ''
      blocks.push(`${header}\n\`\`\`\n${slice}${suffix}\n\`\`\``)
    }

    system +=
      `\n\n## Brand knowledge files\nFiles attached at the project level. Use the contents below as ground truth when the user asks about a file by name.\n\n` +
      blocks.join('\n\n')
  }

  turns.push({ role: 'system', content: system })

  // ─── Recent history (last 20 messages) ───────────────────
  for (const m of args.history.slice(-20)) {
    turns.push({ role: m.role, content: m.content })
  }

  // ─── Current user message ────────────────────────────────
  turns.push({ role: 'user', content: args.userMessage })

  return turns
}

/**
 * Heuristic parser that splits the AI's response into a body + optional
 * numbered output card. The frontend ChatOutputCard expects { items: string[] }.
 */
export function parseAssistantResponse(content: string): {
  body: string
  card?: { label: string; items: string[]; sub?: string }
} {
  // If the response contains a numbered list of >=3 items, extract it as a card.
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
    return {
      body,
      card: {
        label: 'Variations',
        sub: `${numbered.length} options`,
        items: numbered,
      },
    }
  }

  return { body: content.trim() }
}
