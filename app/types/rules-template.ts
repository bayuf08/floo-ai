export interface RulesTemplateRecord {
  id: string
  name: string
  voicePreview: string
  brandVoice: string
  doGuidelines: string[]
  dontGuidelines: string[]
  hashtags: string[]
  isSystem: boolean
  workspaceId: string | null
  createdAt: Date | null
}

export interface RulesTemplateDraftInput {
  name: string
  voicePreview: string
  brandVoice: string
  doGuidelines: string[]
  dontGuidelines: string[]
  hashtags: string[]
}

function normalizeHashtag(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, '')
  if (!trimmed) return null
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

export function normalizeRulesTemplateDraft(input: RulesTemplateDraftInput): RulesTemplateDraftInput {
  return {
    name: input.name.trim(),
    voicePreview: input.voicePreview.trim(),
    brandVoice: input.brandVoice.trim(),
    doGuidelines: input.doGuidelines.map((item) => item.trim()).filter(Boolean),
    dontGuidelines: input.dontGuidelines.map((item) => item.trim()).filter(Boolean),
    hashtags: input.hashtags.map(normalizeHashtag).filter((value): value is string => !!value),
  }
}

export function normalizeRulesTemplateRow(row: Record<string, any>): RulesTemplateRecord {
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    voicePreview: row.voice_preview ?? '',
    brandVoice: row.brand_voice ?? '',
    doGuidelines: Array.isArray(row.do_guidelines) ? row.do_guidelines : [],
    dontGuidelines: Array.isArray(row.dont_guidelines) ? row.dont_guidelines : [],
    hashtags: Array.isArray(row.hashtags) ? row.hashtags.filter((value: unknown): value is string => typeof value === 'string') : [],
    isSystem: !!row.is_system,
    workspaceId: row.workspace_id ?? null,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  }
}

export function splitRulesTemplates(rows: RulesTemplateRecord[]) {
  return {
    system: rows.filter((row) => row.isSystem),
    workspace: rows.filter((row) => !row.isSystem),
  }
}

export const FALLBACK_RULES_TEMPLATES: RulesTemplateRecord[] = [
  {
    id: 'tpl-quiet-artisan',
    name: 'Quiet Artisan',
    voicePreview: 'Deliberate, weight-bearing. Short sentences. No hype words.',
    brandVoice:
      'Quiet, deliberate, weight-bearing. Short sentences. No exclamation marks, no hype words. Reads like an artisan who knows their craft is enough.',
    doGuidelines: [
      'Reference materials and process — what was made and how.',
      'Show hands and craft over product alone.',
      'Honor the wait — slow, deliberate cadence over urgency.',
    ],
    dontGuidelines: [
      'Trend slang ("fr", "lowkey").',
      'Generic adjectives ("beautiful", "stunning").',
      'Stock photography or drop-shadow text.',
    ],
    hashtags: ['#SlowCraft', '#MadeByHand', '#OneOfOne'],
    isSystem: true,
    workspaceId: null,
    createdAt: null,
  },
  {
    id: 'tpl-high-energy',
    name: 'High Energy',
    voicePreview: 'Punchy, exclamation-forward, leans into trends and FOMO.',
    brandVoice:
      'Punchy and high-energy. Lead with the most arresting moment. Embrace exclamations, urgency, and trend-aware phrasing. Always end with a hook.',
    doGuidelines: [
      'Open with a stopper — question, claim, or hot take.',
      'Use trending audio and platform-native phrasing.',
      'Hard CTAs — tell people exactly what to do.',
    ],
    dontGuidelines: [
      'Long preamble — get to the point in line one.',
      'Editorial pacing or quiet poetry.',
      'Generic feel-good language.',
    ],
    hashtags: ['#Trending', '#Viral', '#FYP'],
    isSystem: true,
    workspaceId: null,
    createdAt: null,
  },
  {
    id: 'tpl-editorial',
    name: 'Editorial',
    voicePreview: 'Long-form, considered, magazine-feature register. Cites craft.',
    brandVoice:
      'Editorial, considered, generous with context. Long-form viewers come for depth — give it. Cite the craft, the people, the process.',
    doGuidelines: [
      'Open with a scene or anecdote.',
      'Name the maker, the place, the technique.',
      'Build to a clear thesis or insight.',
    ],
    dontGuidelines: [
      'Bullet points or list-form content.',
      'Slang or platform-trend phrasing.',
      'Sales-forward CTAs.',
    ],
    hashtags: ['#Craft', '#Editorial', '#Maker'],
    isSystem: true,
    workspaceId: null,
    createdAt: null,
  },
  {
    id: 'tpl-luxury-minimal',
    name: 'Luxury Minimal',
    voicePreview: 'Understated, white-space heavy. Lets the product speak.',
    brandVoice:
      'Understated and minimal. Let the product carry weight. Use white space generously. One claim per piece, one hero image per post.',
    doGuidelines: [
      'Single-line captions where possible.',
      'Reference quality, materials, and provenance.',
      'Visual rests — empty negative space is intentional.',
    ],
    dontGuidelines: [
      'Multi-paragraph captions.',
      'Hashtag clutter — three or fewer per post.',
      'Bright accent colors that compete with the product.',
    ],
    hashtags: ['#Minimal', '#Quiet', '#Luxury'],
    isSystem: true,
    workspaceId: null,
    createdAt: null,
  },
]
