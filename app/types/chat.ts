export type MessageRole = 'user' | 'assistant'

export type ContentMode =
  | 'research'
  | 'competitor'
  | 'trend'
  | 'copy'
  | 'image'
  | 'video'

export interface ChatMessage {
  id: string
  projectId: string
  role: MessageRole
  content: string
  timestamp: Date
  outputCards?: OutputCard[]
  /** Optional mode label shown in the assistant header line (e.g. "Image Concept"). */
  modeLabel?: string
  /** Web-search citations the AI grounded its response in. */
  citations?: Citation[]
  /**
   * GLM model id that produced this assistant message (e.g. "glm-4-air").
   * Populated from row.metadata.model in chatStore.rowToMessage. Undefined for
   * legacy rows written before this field was threaded through.
   */
  model?: string
  /**
   * Provider that produced this assistant message — 'glm', 'openai',
   * 'anthropic', or 'mock'. Populated from row.metadata.provider. Lets the
   * UI distinguish "real GLM reply" from "mock fallback" so a regression
   * like "chat silently using mock data" is visible at a glance.
   */
  provider?: string
}

export interface Citation {
  title?: string
  url?: string
  snippet?: string
}

export interface OutputCardImage {
  url: string
  prompt: string
  size: string
}

export interface OutputCard {
  id: string
  items: string[]
  canCopy: boolean
  /** Header label, e.g. "Hooks", "Caption draft", "Image concept" */
  label?: string
  /** Subtitle next to label, e.g. "5 opening lines" */
  sub?: string
  /** Accent color CSS var, defaults to var(--brand) */
  accent?: string
  /** 'text' for the classic numbered-list card; 'image' for CogView outputs. */
  kind?: 'text' | 'image'
  /** Populated when kind === 'image'. */
  images?: OutputCardImage[]
}

export interface ContentModeOption {
  value: ContentMode
  label: string
  /** One-line helper text shown under the label in the picker dropdown. */
  description: string
  icon: string
  accent: string
  /** When true, the mode is shown in the picker but disabled with a "Soon" badge. */
  comingSoon?: boolean
}

/**
 * Order in this array is the order shown in the picker.
 * Available now: research, copy. The other 4 stay visible but disabled
 * (`comingSoon: true`) so users see what's on the roadmap. The backend
 * MODE_INSTRUCTIONS in server/utils/prompt-builder.ts already cover all 6,
 * so flipping a flag here is the only thing needed to ship more.
 */
export const CONTENT_MODES: ContentModeOption[] = [
  { value: 'research',   label: 'Research idea',       description: 'Explore ideas, examples & insights with sources',           icon: 'lucide:lightbulb',     accent: 'var(--brand)'    },
  { value: 'copy',       label: 'Write copy',          description: 'Write captions, hooks & on-brand copy',                     icon: 'lucide:pen-tool',      accent: 'var(--brand)'    },
  { value: 'competitor', label: 'Competitor research', description: "Analyse what competitors are posting & why it works",       icon: 'lucide:eye',           accent: 'var(--ft-blue)',  comingSoon: true },
  { value: 'trend',      label: 'Trend research',      description: "Surface what's trending right now and how to ride it",      icon: 'lucide:trending-up',   accent: 'var(--ft-green)', comingSoon: true },
  { value: 'image',      label: 'Image concept',       description: 'Generate 3 visual directions or image concepts',            icon: 'lucide:image',         accent: 'var(--ft-amber)', comingSoon: true },
  { value: 'video',      label: 'Video concept',       description: 'Get hook-to-CTA outlines for short-form video',             icon: 'lucide:video',         accent: 'var(--ft-coral)', comingSoon: true },
]

/** Convenience: just the modes that are user-pickable today. */
export const AVAILABLE_CONTENT_MODES = CONTENT_MODES.filter((m) => !m.comingSoon)

// GLM model picker removed — the model is fixed by the server-side
// `GLM_MODEL` env var (see `nuxt.config.ts` runtimeConfig.glmModel).
// If per-user overrides come back, restore the GLM_MODELS array here
// AND the Zod enum in the two messages endpoints.
