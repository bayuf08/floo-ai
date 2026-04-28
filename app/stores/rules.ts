import { defineStore } from 'pinia'
import type { RulesTemplateDraftInput, RulesTemplateRecord } from '../types/rules-template'
import {
  FALLBACK_RULES_TEMPLATES,
  normalizeRulesTemplateDraft,
  normalizeRulesTemplateRow,
} from '../types/rules-template'
import {
  patchProjectRulesState,
  restoreProjectRulesState,
  toProjectContextPatchBody,
  type ProjectRulesPatch,
} from '../utils/rules-context'

function canEdit(role: string | null | undefined) {
  return role === 'owner' || role === 'editor'
}

function toTemplateMutationBody(input: RulesTemplateDraftInput) {
  const normalized = normalizeRulesTemplateDraft(input)
  return {
    name: normalized.name,
    voice_preview: normalized.voicePreview,
    brand_voice: normalized.brandVoice,
    do_guidelines: normalized.doGuidelines,
    dont_guidelines: normalized.dontGuidelines,
    hashtags: normalized.hashtags,
  }
}

function createOptimisticTemplate(
  id: string,
  workspaceId: string,
  input: RulesTemplateDraftInput,
): RulesTemplateRecord {
  const normalized = normalizeRulesTemplateDraft(input)
  return {
    id,
    name: normalized.name,
    voicePreview: normalized.voicePreview,
    brandVoice: normalized.brandVoice,
    doGuidelines: normalized.doGuidelines,
    dontGuidelines: normalized.dontGuidelines,
    hashtags: normalized.hashtags,
    isSystem: false,
    workspaceId,
    createdAt: new Date(),
  }
}

export const useRulesStore = defineStore('rules', () => {
  const userStore = useUserStore()
  const projectsStore = useProjectsStore()
  const toast = useToast()

  const liveTemplatesByWorkspace = ref<Record<string, RulesTemplateRecord[]>>({})
  const localCustomTemplatesByWorkspace = ref<Record<string, RulesTemplateRecord[]>>({})
  const workspaceModes = ref<Record<string, 'live' | 'fallback'>>({})
  const loading = ref(false)

  const activeWorkspaceId = computed(() => userStore.activeWorkspace?.id ?? null)
  const canEditProjectRules = computed(() =>
    userStore.usingMocks ? true : canEdit(userStore.activeWorkspaceMembershipRole)
  )
  const canManageTemplates = computed(() =>
    userStore.usingMocks ? true : canEdit(userStore.activeWorkspaceMembershipRole)
  )
  const canApplyTemplates = computed(() => canEditProjectRules.value)
  const usingFallback = computed(() => {
    const workspaceId = activeWorkspaceId.value
    if (!workspaceId) return true
    return workspaceModes.value[workspaceId] !== 'live'
  })

  const templates = computed(() => {
    const workspaceId = activeWorkspaceId.value
    if (!workspaceId) return [...FALLBACK_RULES_TEMPLATES]

    const live = liveTemplatesByWorkspace.value[workspaceId]
    if (live) return live

    return [
      ...FALLBACK_RULES_TEMPLATES,
      ...(localCustomTemplatesByWorkspace.value[workspaceId] ?? []),
    ]
  })

  function replaceLiveTemplates(workspaceId: string, next: RulesTemplateRecord[]) {
    liveTemplatesByWorkspace.value = {
      ...liveTemplatesByWorkspace.value,
      [workspaceId]: next,
    }
  }

  function replaceLocalCustomTemplates(workspaceId: string, next: RulesTemplateRecord[]) {
    localCustomTemplatesByWorkspace.value = {
      ...localCustomTemplatesByWorkspace.value,
      [workspaceId]: next,
    }
  }

  async function patchProjectRules(projectId: string, patch: ProjectRulesPatch) {
    if (!canEditProjectRules.value) return false

    const { previous } = patchProjectRulesState(projectsStore.projects, projectId, patch)
    if (!previous) return false

    if (projectsStore.usingMocks || projectId.startsWith('proj-pending-')) {
      return true
    }

    try {
      await $fetch(`/api/projects/${projectId}/context`, {
        method: 'PATCH',
        credentials: 'include',
        body: toProjectContextPatchBody(patch),
      })
      return true
    } catch (err: any) {
      restoreProjectRulesState(projectsStore.projects, projectId, previous)
      toast.error("Couldn't save Rules changes", {
        detail: err?.statusMessage || err?.message,
      })
      return false
    }
  }

  async function updateBrandVoice(projectId: string, value: string) {
    return patchProjectRules(projectId, { brandVoice: value })
  }

  async function updateDoGuidelines(projectId: string, items: string[]) {
    return patchProjectRules(projectId, { doGuidelines: items })
  }

  async function updateDontGuidelines(projectId: string, items: string[]) {
    return patchProjectRules(projectId, { dontGuidelines: items })
  }

  async function updateHashtags(projectId: string, tags: string[]) {
    return patchProjectRules(projectId, { hashtags: tags })
  }

  async function loadTemplates(
    workspaceId = activeWorkspaceId.value,
    options: { force?: boolean } = {},
  ) {
    if (!workspaceId) return
    if (userStore.usingMocks) {
      workspaceModes.value = {
        ...workspaceModes.value,
        [workspaceId]: 'fallback',
      }
      return
    }

    if (!options.force && workspaceModes.value[workspaceId] === 'live') return

    loading.value = true
    try {
      const rows = await $fetch<any[]>(`/api/rules-templates?workspace=${workspaceId}`, {
        credentials: 'include',
      })
      replaceLiveTemplates(workspaceId, (rows ?? []).map(normalizeRulesTemplateRow))
      workspaceModes.value = {
        ...workspaceModes.value,
        [workspaceId]: 'live',
      }
    } catch (err) {
      const nextLive = { ...liveTemplatesByWorkspace.value }
      delete nextLive[workspaceId]
      liveTemplatesByWorkspace.value = nextLive
      workspaceModes.value = {
        ...workspaceModes.value,
        [workspaceId]: 'fallback',
      }
      console.warn('[rulesStore] backend not reachable; using fallback templates', err)
    } finally {
      loading.value = false
    }
  }

  async function applyTemplate(projectId: string, templateId: string) {
    if (!canApplyTemplates.value) return false

    const template = templates.value.find((row) => row.id === templateId)
    if (!template) return false

    const { previous } = patchProjectRulesState(projectsStore.projects, projectId, {
      brandVoice: template.brandVoice,
      doGuidelines: [...template.doGuidelines],
      dontGuidelines: [...template.dontGuidelines],
      hashtags: [...template.hashtags],
    })
    if (!previous) return false

    if (projectsStore.usingMocks || projectId.startsWith('proj-pending-') || usingFallback.value) {
      return true
    }

    try {
      await $fetch(`/api/projects/${projectId}/context/template`, {
        method: 'POST',
        credentials: 'include',
        body: { template_id: templateId },
      })
      return true
    } catch (err: any) {
      restoreProjectRulesState(projectsStore.projects, projectId, previous)
      toast.error("Couldn't apply rules template", {
        detail: err?.statusMessage || err?.message,
      })
      return false
    }
  }

  async function createTemplate(input: RulesTemplateDraftInput) {
    if (!canManageTemplates.value) return false

    const workspaceId = activeWorkspaceId.value
    if (!workspaceId) return false

    const normalized = normalizeRulesTemplateDraft(input)
    if (!normalized.name || !normalized.voicePreview || !normalized.brandVoice) {
      toast.error("Couldn't create template", {
        detail: 'Name, voice preview, and brand voice are required.',
      })
      return false
    }

    const tempId = `tpl-pending-${Date.now()}`
    const optimistic = createOptimisticTemplate(tempId, workspaceId, normalized)

    if (userStore.usingMocks || usingFallback.value) {
      replaceLocalCustomTemplates(workspaceId, [
        optimistic,
        ...(localCustomTemplatesByWorkspace.value[workspaceId] ?? []),
      ])
      workspaceModes.value = {
        ...workspaceModes.value,
        [workspaceId]: 'fallback',
      }
      return true
    }

    const previous = [...(liveTemplatesByWorkspace.value[workspaceId] ?? [])]
    replaceLiveTemplates(workspaceId, [optimistic, ...previous])

    try {
      const row = await $fetch<any>('/api/rules-templates', {
        method: 'POST',
        credentials: 'include',
        body: {
          workspace_id: workspaceId,
          ...toTemplateMutationBody(normalized),
        },
      })

      replaceLiveTemplates(
        workspaceId,
        (liveTemplatesByWorkspace.value[workspaceId] ?? []).map((template) =>
          template.id === tempId ? normalizeRulesTemplateRow(row) : template
        )
      )
      return true
    } catch (err: any) {
      replaceLiveTemplates(workspaceId, previous)
      toast.error("Couldn't create template", {
        detail: err?.statusMessage || err?.message,
      })
      return false
    }
  }

  async function updateTemplate(id: string, input: RulesTemplateDraftInput) {
    if (!canManageTemplates.value) return false

    const workspaceId = activeWorkspaceId.value
    if (!workspaceId) return false

    const normalized = normalizeRulesTemplateDraft(input)
    if (!normalized.name || !normalized.voicePreview || !normalized.brandVoice) {
      toast.error("Couldn't update template", {
        detail: 'Name, voice preview, and brand voice are required.',
      })
      return false
    }

    if (userStore.usingMocks || usingFallback.value) {
      const local = localCustomTemplatesByWorkspace.value[workspaceId] ?? []
      replaceLocalCustomTemplates(
        workspaceId,
        local.map((template) =>
          template.id === id ? { ...template, ...createOptimisticTemplate(id, workspaceId, normalized) } : template
        )
      )
      return true
    }

    const previous = [...(liveTemplatesByWorkspace.value[workspaceId] ?? [])]
    replaceLiveTemplates(
      workspaceId,
      previous.map((template) =>
        template.id === id ? { ...template, ...createOptimisticTemplate(id, workspaceId, normalized) } : template
      )
    )

    try {
      const row = await $fetch<any>(`/api/rules-templates/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        body: toTemplateMutationBody(normalized),
      })
      replaceLiveTemplates(
        workspaceId,
        (liveTemplatesByWorkspace.value[workspaceId] ?? []).map((template) =>
          template.id === id ? normalizeRulesTemplateRow(row) : template
        )
      )
      return true
    } catch (err: any) {
      replaceLiveTemplates(workspaceId, previous)
      toast.error("Couldn't update template", {
        detail: err?.statusMessage || err?.message,
      })
      return false
    }
  }

  async function deleteTemplate(id: string) {
    if (!canManageTemplates.value) return false

    const workspaceId = activeWorkspaceId.value
    if (!workspaceId) return false

    if (userStore.usingMocks || usingFallback.value) {
      replaceLocalCustomTemplates(
        workspaceId,
        (localCustomTemplatesByWorkspace.value[workspaceId] ?? []).filter((template) => template.id !== id)
      )
      return true
    }

    const previous = [...(liveTemplatesByWorkspace.value[workspaceId] ?? [])]
    replaceLiveTemplates(
      workspaceId,
      previous.filter((template) => template.id !== id)
    )

    try {
      await $fetch(`/api/rules-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      return true
    } catch (err: any) {
      replaceLiveTemplates(workspaceId, previous)
      toast.error("Couldn't delete template", {
        detail: err?.statusMessage || err?.message,
      })
      return false
    }
  }

  watch(
    () => activeWorkspaceId.value,
    (workspaceId) => {
      if (!workspaceId) return
      if (workspaceModes.value[workspaceId] === 'live') return
      loadTemplates(workspaceId).catch(() => {
        // Errors are handled inside loadTemplates.
      })
    }
  )

  return {
    templates,
    loading,
    usingFallback,
    canEditProjectRules,
    canManageTemplates,
    canApplyTemplates,
    loadTemplates,
    updateBrandVoice,
    updateDoGuidelines,
    updateDontGuidelines,
    updateHashtags,
    applyTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  }
})
