export type SkillCategory = 'marketing' | 'creator'
export type SkillCategoryFilter = SkillCategory | 'all'

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
  marketing: 'Marketing',
  creator: 'Creator',
}

export const CATEGORY_DESCRIPTIONS: Record<SkillCategory, string> = {
  marketing: 'How Floo runs a campaign — briefs, audits, sequences, reports.',
  creator: 'How Floo helps you author your own custom skills.',
}

export function resolveSkillFormCategory(category?: SkillCategoryFilter | null): SkillCategory {
  return category && category !== 'all' ? category : 'marketing'
}
