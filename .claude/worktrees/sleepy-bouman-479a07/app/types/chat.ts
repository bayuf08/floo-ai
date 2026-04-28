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
}

export interface ContentModeOption {
  value: ContentMode
  label: string
  icon: string
  accent: string
}

export const CONTENT_MODES: ContentModeOption[] = [
  { value: 'research',   label: 'Research idea',       icon: 'lucide:lightbulb',     accent: 'var(--brand)' },
  { value: 'competitor', label: 'Competitor research', icon: 'lucide:eye',           accent: 'var(--ft-blue)' },
  { value: 'trend',      label: 'Trend research',      icon: 'lucide:trending-up',   accent: 'var(--ft-green)' },
  { value: 'copy',       label: 'Write copy',          icon: 'lucide:pen-tool',      accent: 'var(--brand)' },
  { value: 'image',      label: 'Image concept',       icon: 'lucide:image',         accent: 'var(--ft-amber)' },
  { value: 'video',      label: 'Video concept',       icon: 'lucide:video',         accent: 'var(--ft-coral)' },
]
