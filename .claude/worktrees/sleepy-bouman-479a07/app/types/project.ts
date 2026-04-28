export type Platform = 'tiktok' | 'instagram' | 'twitter' | 'youtube' | 'linkedin' | 'threads'

export type AssetCategory =
  | 'image'        // .jpg .jpeg .png .webp .gif .svg
  | 'video'        // .mp4 .mov .avi .webm
  | 'document'     // .pdf .doc .docx .txt .md
  | 'presentation' // .ppt .pptx .key
  | 'spreadsheet'  // .xls .xlsx .csv .numbers
  | 'other'

export interface BrandAsset {
  id: string
  name: string
  size: string
  sizeBytes: number
  category: AssetCategory
  extension: string
  uploadedAt: Date
  description: string
  previewUrl?: string
  /**
   * Backend text-extraction state for parseable docs (PDF/DOCX/TXT/MD).
   * - 'pending'  → upload landed, extractor not finished yet
   * - 'done'     → text extracted; AI has full content
   * - 'error'    → parser failed; user should hit Retry or re-upload
   * - 'skipped'  → image / video / unsupported format
   * Undefined means we don't know yet (optimistic local-only assets).
   */
  extractionStatus?: 'pending' | 'done' | 'error' | 'skipped'
  /** Human-readable error from the parser when extractionStatus === 'error'. */
  extractionError?: string
}

/** Saved AI output that the user explicitly bookmarked. */
export interface SavedOutput {
  id: string
  label: string
  sub?: string
  accent?: string
  items: string[]
  savedAt: Date
}

export interface ProjectMember {
  id: string
  name: string
  email: string
  initials: string
  /** CSS color for the avatar gradient */
  avatarColor: string
  role: 'owner' | 'editor' | 'viewer'
  joinedAt: Date
}

export interface Project {
  id: string
  name: string
  /** References Workspace.id — determines which workspace this project appears under. */
  workspaceId: string
  platform: Platform
  color: string
  updatedAt: Date
  /** When true, the project sorts to the top of the sidebar list. */
  isPinned?: boolean
  contextRules?: ProjectContext
  /** Collaborators on this project. Always includes the owner as first member. */
  members?: ProjectMember[]
}

export interface ProjectContext {
  brandVoice: string
  doGuidelines: string[]
  dontGuidelines: string[]
  skills: Skill[]
  platformProfile?: PlatformProfile
  /** Permanent project-level reference files. */
  brandAssets?: BrandAsset[]
  /** Project-level hashtag set used as a reference for content generation. */
  hashtags?: string[]
  /** AI outputs the user explicitly saved. */
  savedOutputs?: SavedOutput[]
}

export interface Skill {
  id: string
  name: string
  active: boolean
}

export interface PlatformProfile {
  platform: Platform
  handle: string
  followers?: number
  bio?: string
}

export interface RulesTemplate {
  id: string
  name: string
  voicePreview: string
  brandVoice: string
  doGuidelines: string[]
  dontGuidelines: string[]
  hashtags?: string[]
}

/**
 * Map a filename to an AssetCategory used for icon + color coding.
 */
export function getAssetCategory(filename: string): AssetCategory {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'video'
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return 'document'
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'presentation'
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'spreadsheet'
  return 'other'
}

export const PLATFORM_CONFIG: Record<Platform, { label: string; color: string; bgColor: string }> = {
  tiktok: { label: 'Tiktok', color: '#FFFFFF', bgColor: '#E44D6A' },
  instagram: { label: 'Instagram', color: '#FFFFFF', bgColor: '#C13584' },
  twitter: { label: 'X / Twitter', color: '#FFFFFF', bgColor: '#1B1726' },
  youtube: { label: 'YouTube', color: '#FFFFFF', bgColor: '#FF0000' },
  linkedin: { label: 'LinkedIn', color: '#FFFFFF', bgColor: '#0077B5' },
  threads: { label: 'Threads', color: '#FFFFFF', bgColor: '#000000' },
}

/** 4 mock rules templates used by the Import Rules Template modal. */
export const RULES_TEMPLATES: RulesTemplate[] = [
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
  },
]
