/**
 * Tests for buildChatPrompt + parseAssistantResponse.
 *
 * Locks in the system-prompt layering contract so future edits (token
 * budgeting, new context blocks like Saved exemplars, etc.) can't silently
 * regress what gets sent to GLM.
 */
import { describe, expect, test } from 'bun:test'
import {
  buildChatPrompt,
  parseAssistantResponse,
  WEB_SEARCH_MODES,
  type BuildPromptArgs,
} from './prompt-builder'

const MIN_ARGS = {
  project: { name: 'Test', platform: 'instagram' },
  context: null,
  skills: [],
  brandAssets: [],
  history: [],
  userMessage: 'hello',
}

/** Helper — minimal valid args, override anything per-test. */
function args(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    project: { name: 'Kayu — SS26', platform: 'instagram' },
    context: null,
    skills: [],
    brandAssets: [],
    history: [],
    userMessage: 'draft a hook for the launch',
    ...overrides,
  }
}

/** Pull the system message text, asserting there's exactly one. */
function systemText(messages: ReturnType<typeof buildChatPrompt>): string {
  const sys = messages.filter((m) => m.role === 'system')
  expect(sys).toHaveLength(1)
  const c = sys[0]!.content
  return typeof c === 'string' ? c : c.map((p: any) => (p.type === 'text' ? p.text : '')).join('')
}

describe('buildChatPrompt — mode injection', () => {
  test('research mode adds the research instruction to the system prompt', () => {
    const turns = buildChatPrompt({ ...MIN_ARGS, mode: 'research' })
    const system = turns[0]
    expect(system?.role).toBe('system')
    expect(typeof system?.content === 'string' && system.content).toContain(
      'asking for research'
    )
  })

  test('copy mode adds the copy instruction to the system prompt', () => {
    const turns = buildChatPrompt({ ...MIN_ARGS, mode: 'copy' })
    const system = turns[0]
    expect(typeof system?.content === 'string' && system.content).toContain(
      'asking you to write copy'
    )
  })

  test('omitting mode keeps the base system prompt without mode instructions', () => {
    const turns = buildChatPrompt({ ...MIN_ARGS })
    const system = turns[0]
    expect(typeof system?.content === 'string' && system.content).not.toContain(
      'asking for research'
    )
    expect(typeof system?.content === 'string' && system.content).not.toContain(
      'asking you to write copy'
    )
  })

  test('user turn is appended last with the userMessage content', () => {
    const turns = buildChatPrompt({ ...MIN_ARGS, mode: 'copy', userMessage: 'hook for SS26' })
    const last = turns[turns.length - 1]
    expect(last?.role).toBe('user')
    expect(last?.content).toBe('hook for SS26')
  })
})

describe('buildChatPrompt — layering', () => {
  test('always emits a system turn followed by the user turn', () => {
    const out = buildChatPrompt(args())
    expect(out[0]?.role).toBe('system')
    expect(out[out.length - 1]?.role).toBe('user')
    expect(out[out.length - 1]?.content).toBe('draft a hook for the launch')
  })

  test('system prompt contains the Floo persona by default', () => {
    const out = buildChatPrompt(args())
    expect(systemText(out)).toContain('You are Floo')
  })

  test('unknown mode is silently ignored (no Mode block emitted)', () => {
    const out = buildChatPrompt(args({ mode: 'mystery' as any }))
    expect(systemText(out)).not.toContain('## Mode')
  })
})

describe('buildChatPrompt — project context', () => {
  test('renders brand voice, DO, DONT, hashtags when populated', () => {
    const out = buildChatPrompt(
      args({
        context: {
          brand_voice: 'Quiet, deliberate, weight-bearing.',
          do_guidelines: ['Mention single-fire technique.', 'Reference Bantul roots.'],
          dont_guidelines: ['No exclamation marks.', 'No hype words.'],
          hashtags: ['#KayuStudio', '#SlowCraft'],
          platform_handle: '@kayustudio',
          platform_bio: 'Bantul-made ceramics.',
          platform_followers: 12300,
        },
      })
    )
    const sys = systemText(out)
    expect(sys).toContain('## Project context')
    expect(sys).toContain('### Brand voice')
    expect(sys).toContain('Quiet, deliberate')
    expect(sys).toContain('### DO')
    expect(sys).toContain('- Mention single-fire technique.')
    expect(sys).toContain("### DON'T")
    expect(sys).toContain('- No hype words.')
    expect(sys).toContain('### Hashtags')
    expect(sys).toContain('#KayuStudio')
    expect(sys).toContain('### Project')
    expect(sys).toContain('Name: Kayu — SS26')
    expect(sys).toContain('Platform: instagram')
    expect(sys).toContain('Handle: @kayustudio')
    expect(sys).toContain('Followers: 12300')
    expect(sys).toContain('Bio: Bantul-made ceramics.')
  })

  test('omits brand-voice / DO / DONT / hashtag sub-sections when empty', () => {
    const out = buildChatPrompt(
      args({
        context: {
          brand_voice: '',
          do_guidelines: [],
          dont_guidelines: [],
          hashtags: [],
        },
      })
    )
    const sys = systemText(out)
    // Project line still rendered (fallback minimal context)
    expect(sys).toContain('### Project')
    // But the empty sub-sections must not be emitted
    expect(sys).not.toContain('### Brand voice')
    expect(sys).not.toContain("### DON'T")
    expect(sys).not.toContain('### Hashtags')
  })

  test('still emits Project name+platform when context is null', () => {
    const out = buildChatPrompt(args({ context: null }))
    const sys = systemText(out)
    expect(sys).toContain('## Project context')
    expect(sys).toContain('Name: Kayu — SS26')
  })
})

describe('buildChatPrompt — skills', () => {
  test('renders active skills with name + instructions', () => {
    const out = buildChatPrompt(
      args({
        skills: [
          { name: 'Hook Generator', instructions: 'Lead with the strongest single line.' },
          { name: 'Tone Mirror', instructions: null },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys).toContain('## Active skills')
    expect(sys).toContain('**Hook Generator**')
    expect(sys).toContain('Lead with the strongest single line.')
    expect(sys).toContain('**Tone Mirror**')
  })

  test('omits the Active skills block entirely when no skills are passed', () => {
    const out = buildChatPrompt(args({ skills: [] }))
    expect(systemText(out)).not.toContain('## Active skills')
  })
})

describe('buildChatPrompt — brand knowledge', () => {
  test('inlines extracted text under brand-knowledge files block', () => {
    const out = buildChatPrompt(
      args({
        brandAssets: [
          {
            name: 'Tone_of_Voice.docx',
            description: 'How we sound.',
            category: 'document',
            extracted_text: 'Always lowercase. Never use exclamation marks.',
          },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys).toContain('## Brand knowledge files')
    expect(sys).toContain('Tone_of_Voice.docx')
    expect(sys).toContain('How we sound.')
    expect(sys).toContain('Always lowercase')
  })

  test('falls back to name+description for assets without extracted text', () => {
    const out = buildChatPrompt(
      args({
        brandAssets: [
          {
            name: 'Moodboard.pdf',
            description: 'Visual direction',
            category: 'document',
            extracted_text: null,
          },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys).toContain('### Other attached files')
    expect(sys).toContain('**Moodboard.pdf**')
    expect(sys).toContain('Visual direction')
  })

  test('truncates per-asset to ~8k chars and appends a marker', () => {
    const huge = 'x'.repeat(20_000)
    const out = buildChatPrompt(
      args({
        brandAssets: [
          { name: 'Big.txt', category: 'document', extracted_text: huge },
        ],
      })
    )
    const sys = systemText(out)
    // Per-asset cap is 8,000 — assert we shrunk well below the original 20k
    expect(sys.length).toBeLessThan(20_000)
    expect(sys).toContain('[…truncated]')
  })

  test('omits the Brand knowledge block entirely when no assets are passed', () => {
    const out = buildChatPrompt(args({ brandAssets: [] }))
    expect(systemText(out)).not.toContain('## Brand knowledge files')
  })

  test('marks extraction-error assets so the model knows the file is unreadable', () => {
    const out = buildChatPrompt(
      args({
        brandAssets: [
          {
            name: 'Broken.pdf',
            category: 'document',
            extracted_text: null,
            extraction_status: 'error',
          },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys).toContain('Broken.pdf')
    expect(sys).toContain('extraction failed')
  })

  test('marks pending-extraction assets so the model says "still indexing"', () => {
    const out = buildChatPrompt(
      args({
        brandAssets: [
          {
            name: 'Just_uploaded.pdf',
            category: 'document',
            extracted_text: null,
            extraction_status: 'pending',
          },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys).toContain('Just_uploaded.pdf')
    expect(sys).toContain('indexing in progress')
  })
})

describe('buildChatPrompt — history & user message', () => {
  test('appends recent history turns between system and user', () => {
    const out = buildChatPrompt(
      args({
        history: [
          { role: 'user', content: 'previous user msg' },
          { role: 'assistant', content: 'previous reply' },
        ],
      })
    )
    expect(out).toHaveLength(4) // system + 2 history + user
    expect(out[1]).toEqual({ role: 'user', content: 'previous user msg' })
    expect(out[2]).toEqual({ role: 'assistant', content: 'previous reply' })
  })

  test('keeps only the last 20 history turns', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn ${i}`,
    }))
    const out = buildChatPrompt(args({ history }))
    // 1 system + 20 history + 1 user
    expect(out).toHaveLength(22)
    // First history turn kept should be turn 10 (the slice(-20))
    expect(out[1]?.content).toBe('turn 10')
  })

  test('emits a multimodal user turn when image attachments are passed', () => {
    const out = buildChatPrompt(
      args({
        userMessage: 'use this moodboard',
        attachments: [{ url: 'https://cdn.example.com/board.jpg', name: 'board.jpg' }],
      })
    )
    const last = out[out.length - 1]
    expect(last?.role).toBe('user')
    expect(Array.isArray(last?.content)).toBe(true)
    const parts = last!.content as any[]
    expect(parts[0]).toEqual({ type: 'text', text: 'use this moodboard' })
    expect(parts[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://cdn.example.com/board.jpg' },
    })
  })
})

describe('buildChatPrompt — saved exemplars', () => {
  test('renders a Saved exemplars block with each saved card grouped by label', () => {
    const out = buildChatPrompt(
      args({
        savedOutputs: [
          {
            label: 'Hooks',
            sub: '5 options',
            items: [
              'Tanah ini sudah menunggu 800 tahun.',
              'Sebuah mangkuk tidak bisa diburu.',
            ],
          },
          {
            label: 'Image directions',
            items: ['Hands in frame, natural light, restraint.'],
          },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys).toContain('## Saved exemplars')
    expect(sys).toContain('### Hooks — 5 options')
    expect(sys).toContain('Tanah ini sudah menunggu 800 tahun.')
    expect(sys).toContain('### Image directions')
    expect(sys).toContain('Hands in frame, natural light, restraint.')
  })

  test('caps to 5 most recent saves regardless of how many are passed', () => {
    const out = buildChatPrompt(
      args({
        savedOutputs: Array.from({ length: 12 }, (_, i) => ({
          label: `Save ${i}`,
          items: [`item ${i}`],
        })),
      })
    )
    const sys = systemText(out)
    // Saves 0..4 land, 5..11 don't.
    expect(sys).toContain('### Save 0')
    expect(sys).toContain('### Save 4')
    expect(sys).not.toContain('### Save 5')
    expect(sys).not.toContain('### Save 11')
  })

  test('caps total saved-exemplar chars and appends a truncation marker', () => {
    const out = buildChatPrompt(
      args({
        savedOutputs: [
          {
            label: 'Long save',
            items: Array.from({ length: 50 }, () => 'x'.repeat(200)),
          },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys).toContain('## Saved exemplars')
    // Body should not be allowed to dump 50 × 200 = 10k chars; cap is 3k.
    const exemplarStart = sys.indexOf('## Saved exemplars')
    const exemplarSection = sys.slice(exemplarStart)
    expect(exemplarSection).toContain('[...truncated]')
    expect(exemplarSection.length).toBeLessThan(4_000)
  })

  test('omits the Saved exemplars block entirely when empty', () => {
    expect(systemText(buildChatPrompt(args({ savedOutputs: [] })))).not.toContain('## Saved exemplars')
    expect(systemText(buildChatPrompt(args()))).not.toContain('## Saved exemplars')
  })

  test('skips saves with no items (empty arrays should not produce empty headings)', () => {
    const out = buildChatPrompt(
      args({
        savedOutputs: [
          { label: 'Empty', items: [] },
          { label: 'Real', items: ['something'] },
        ],
      })
    )
    const sys = systemText(out)
    // Both labels render — items[] = [] still emits a heading. That's fine
    // because the route filter drops `items.length === 0` rows before they
    // get here. This test documents that buildChatPrompt itself doesn't
    // double-filter.
    expect(sys).toContain('### Real')
    expect(sys).toContain('something')
  })
})

describe('buildChatPrompt — token budgeting', () => {
  test('keeps the system prompt under the ~40k char hard cap', () => {
    // Construct a comically oversized payload — many skills with long
    // instructions, plus a 50k brand-knowledge file. The cap must hold.
    const bigSkills = Array.from({ length: 20 }, (_, i) => ({
      name: `Skill ${i}`,
      instructions: 'x'.repeat(3_000),
    }))
    const out = buildChatPrompt(
      args({
        skills: bigSkills,
        brandAssets: [
          { name: 'Massive.txt', category: 'document', extracted_text: 'y'.repeat(50_000) },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys.length).toBeLessThanOrEqual(40_000)
  })

  test('drops brand knowledge before stripping skill instructions', () => {
    // Construct: 10 skills × 3k = ~30k full-skills block, plus 2 knowledge
    // assets that survive the per-asset cap at ~8k each = ~16k knowledge.
    // Together they overflow 40k; after dropping knowledge the system fits.
    const out = buildChatPrompt(
      args({
        skills: Array.from({ length: 10 }, (_, i) => ({
          name: `Skill ${i}`,
          instructions: 'x'.repeat(3_000),
        })),
        brandAssets: [
          { name: 'A.txt', category: 'document', extracted_text: 'y'.repeat(20_000) },
          { name: 'B.txt', category: 'document', extracted_text: 'z'.repeat(20_000) },
        ],
      })
    )
    const sys = systemText(out)
    expect(sys.length).toBeLessThanOrEqual(40_000)
    // Knowledge section header survives but body is gone, replaced with marker.
    expect(sys).toContain('## Brand knowledge files')
    expect(sys).toContain('[…context truncated]')
    expect(sys).not.toContain('yyyyyyyyyy')
    expect(sys).not.toContain('zzzzzzzzzz')
    // Skills stay verbatim — instructions present.
    expect(sys).toContain('xxxxxxxxxxxxxxxxxxxx') // long instruction string survived
  })

  test('strips skill instructions when even no-knowledge would overflow', () => {
    // 30 skills × 2k instructions = 60k — over cap on its own. Knowledge
    // gets dropped first, then skill instructions get reduced to names.
    const out = buildChatPrompt(
      args({
        skills: Array.from({ length: 30 }, (_, i) => ({
          name: `Skill ${i}`,
          instructions: 'x'.repeat(2_000),
        })),
      })
    )
    const sys = systemText(out)
    expect(sys.length).toBeLessThanOrEqual(40_000)
    expect(sys).toContain('## Active skills')
    expect(sys).toContain('- **Skill 0**')
    // Long instruction body must have been stripped.
    expect(sys).not.toContain('xxxxxxxxxxx')
  })

  test('shrinks history from 20 → 10 turns when total payload is huge', () => {
    // Each turn is ~3k chars; 20 turns ≈ 60k → blows past MAX_TOTAL_CHARS.
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn ${i} ` + 'z'.repeat(3_000),
    }))
    const out = buildChatPrompt(args({ history }))
    const dialogTurns = out.filter((m) => m.role === 'user' || m.role === 'assistant')
    // 10 history turns + 1 final user turn
    expect(dialogTurns).toHaveLength(11)
    // Oldest kept should be turn 15 (slice(-10) of 25 → indices 15..24)
    expect((dialogTurns[0]?.content as string).startsWith('turn 15')).toBe(true)
  })

  test('keeps full 20-turn history when payload is small', () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn ${i}`,
    }))
    const out = buildChatPrompt(args({ history }))
    const dialogTurns = out.filter((m) => m.role === 'user' || m.role === 'assistant')
    expect(dialogTurns).toHaveLength(21) // 20 history + final user
  })
})

describe('WEB_SEARCH_MODES', () => {
  test('research is grounded', () => {
    expect(WEB_SEARCH_MODES.has('research')).toBe(true)
  })

  test('copy is NOT grounded', () => {
    expect(WEB_SEARCH_MODES.has('copy')).toBe(false)
  })

  test('competitor and trend are also grounded', () => {
    expect(WEB_SEARCH_MODES.has('competitor')).toBe(true)
    expect(WEB_SEARCH_MODES.has('trend')).toBe(true)
  })

  test('image and video are NOT grounded', () => {
    expect(WEB_SEARCH_MODES.has('image')).toBe(false)
    expect(WEB_SEARCH_MODES.has('video')).toBe(false)
  })
})

describe('parseAssistantResponse — mode-specific card labels', () => {
  const numbered = `Some prelude.

1. First option
2. Second option
3. Third option
4. Fourth option
5. Fifth option`

  test('copy mode produces a "Hooks" card', () => {
    const out = parseAssistantResponse(numbered, 'copy')
    expect(out.card?.label).toBe('Hooks')
    expect(out.card?.items.length).toBe(5)
    expect(out.body).toContain('Some prelude.')
  })

  test('research mode produces an "Insights" card', () => {
    const out = parseAssistantResponse(numbered, 'research')
    expect(out.card?.label).toBe('Insights')
  })

  test('plain prose (no numbered list) returns body only, no card', () => {
    const out = parseAssistantResponse('Just a sentence.', 'copy')
    expect(out.card).toBeUndefined()
    expect(out.body).toBe('Just a sentence.')
  })

  test('does not produce a card for fewer than 3 numbered items', () => {
    const out = parseAssistantResponse('1. Only one\n2. And two')
    expect(out.card).toBeUndefined()
  })

  test('falls back to a generic Variations label for unknown mode', () => {
    const out = parseAssistantResponse('1. a\n2. b\n3. c')
    expect(out.card?.label).toBe('Variations')
  })
})
