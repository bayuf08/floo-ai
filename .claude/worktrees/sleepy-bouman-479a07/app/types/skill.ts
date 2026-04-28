export type SkillCategory = 'voice' | 'format' | 'trend' | 'workflow'

export interface SkillDefinition {
  id: string
  name: string
  category: SkillCategory
  description: string
  instructions?: string
  examples?: string[]
  /** Custom skills are user-created and editable. */
  isCustom?: boolean
}

export const CATEGORY_LABELS: Record<SkillCategory, string> = {
  voice: 'Voice',
  format: 'Format',
  trend: 'Trend',
  workflow: 'Workflow',
}

export const CATEGORY_DESCRIPTIONS: Record<SkillCategory, string> = {
  voice: 'How Floo sounds — tone, register, sentence length.',
  format: 'How Floo structures output — hooks, carousels, threads.',
  trend: 'How Floo references the moment — audio, visuals, culture.',
  workflow: 'How Floo helps you do the job — briefs, hashtags, timing.',
}
