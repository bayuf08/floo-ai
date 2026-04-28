import type { Project, ProjectContext } from '../types/project'

export type ProjectRulesPatch = Partial<
  Pick<ProjectContext, 'brandVoice' | 'doGuidelines' | 'dontGuidelines' | 'hashtags'>
>

export interface PatchProjectRulesResult {
  previous: ProjectContext | null
  current: ProjectContext | null
}

const EMPTY_RULES_CONTEXT: ProjectContext = {
  brandVoice: '',
  doGuidelines: [],
  dontGuidelines: [],
  hashtags: [],
  skills: [],
}

function cloneContext(context: ProjectContext): ProjectContext {
  return {
    ...context,
    doGuidelines: [...context.doGuidelines],
    dontGuidelines: [...context.dontGuidelines],
    hashtags: context.hashtags ? [...context.hashtags] : [],
    skills: [...context.skills],
    brandAssets: context.brandAssets ? [...context.brandAssets] : undefined,
    savedOutputs: context.savedOutputs ? [...context.savedOutputs] : undefined,
    platformProfile: context.platformProfile ? { ...context.platformProfile } : undefined,
  }
}

export function patchProjectRulesState(
  projects: Project[],
  projectId: string,
  patch: ProjectRulesPatch,
): PatchProjectRulesResult {
  const project = projects.find((entry) => entry.id === projectId)
  if (!project) return { previous: null, current: null }

  const previous = cloneContext(project.contextRules ?? EMPTY_RULES_CONTEXT)
  const base = cloneContext(project.contextRules ?? EMPTY_RULES_CONTEXT)

  project.contextRules = {
    ...base,
    ...patch,
  }

  return {
    previous,
    current: cloneContext(project.contextRules),
  }
}

export function restoreProjectRulesState(
  projects: Project[],
  projectId: string,
  snapshot: ProjectContext | null,
) {
  const project = projects.find((entry) => entry.id === projectId)
  if (!project || !snapshot) return
  project.contextRules = cloneContext(snapshot)
}

export function toProjectContextPatchBody(patch: ProjectRulesPatch) {
  const body: Record<string, unknown> = {}

  if ('brandVoice' in patch) body.brand_voice = patch.brandVoice ?? ''
  if ('doGuidelines' in patch) body.do_guidelines = patch.doGuidelines ?? []
  if ('dontGuidelines' in patch) body.dont_guidelines = patch.dontGuidelines ?? []
  if ('hashtags' in patch) body.hashtags = patch.hashtags ?? []

  return body
}
