import { defineStore } from 'pinia'
import { canManageSkills as canManageSkillsForRole } from '~/utils/skill-library'
import type { SkillDefinition, SkillCategory } from '~/types/skill'

export const useSkillsStore = defineStore('skills', () => {
  const userStore = useUserStore()
  const projectsStore = useProjectsStore()
  // Empty until `loadFromBackend()` pulls /api/skills (which returns the
  // 24 seeded system skills + any custom workspace skills). Pre-populating
  // the mock list here caused the sidebar's "Skill library 24" counter to
  // show non-zero on every reload before the real catalog landed.
  const skills = ref<SkillDefinition[]>([])

  const activeCategory = ref<SkillCategory | 'all'>('all')
  const searchQuery = ref('')
  const usingMocks = ref(true)
  const hydrated = ref(false)
  const loadedWorkspaceKey = ref<string | null>(null)
  const canManageSkills = computed(() =>
    userStore.usingMocks ? true : canManageSkillsForRole(userStore.activeWorkspaceMembershipRole)
  )

  function rowToSkillDefinition(row: any): SkillDefinition {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description ?? '',
      instructions: row.instructions ?? undefined,
      examples: row.examples ?? undefined,
      isCustom: !!row.is_custom,
    }
  }

  /**
   * Hydrate the skill catalog from /api/skills. Pulls system skills + the
   * given workspace's custom skills. Falls back silently to mocks if the
   * backend isn't reachable.
   */
  async function loadFromBackend(workspaceId?: string) {
    const workspaceKey = workspaceId ?? '__system__'
    if (!usingMocks.value && loadedWorkspaceKey.value === workspaceKey) return
    const wasLive = !usingMocks.value
    try {
      const url = workspaceId ? `/api/skills?workspace=${workspaceId}` : '/api/skills'
      const rows = await $fetch<any[]>(url, { credentials: 'include' })
      // Successful response (even empty) means backend is reachable —
      // trust it. The seeded migration guarantees ≥24 system skills, so
      // an empty response is unusual but the backend view is canonical.
      skills.value = (Array.isArray(rows) ? rows : []).map(rowToSkillDefinition)
      usingMocks.value = false
      hydrated.value = true
      loadedWorkspaceKey.value = workspaceKey
    } catch (err) {
      if (!usingMocks.value && loadedWorkspaceKey.value !== workspaceKey) {
        skills.value = skills.value.filter((skill) => !skill.isCustom)
      }
      console.warn('[skillsStore] backend not reachable; staying on mock data', err)
      hydrated.value = true
      if (loadedWorkspaceKey.value === null) {
        usingMocks.value = true
      }
      // Layer C — only toast when we *transition* from live to failed. On a
      // first-load failure the user already sees the mock UI and a noisy
      // toast on every refresh would be worse than the silent console warn.
      if (wasLive) {
        useToast().error("Skill catalog couldn't refresh", {
          detail: 'Toggles will stay disabled until the catalog reloads.',
        })
      }
    }
  }

  const filteredSkills = computed(() => {
    let list = skills.value
    if (activeCategory.value !== 'all') {
      list = list.filter((s) => s.category === activeCategory.value)
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase()
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    }
    return list
  })

  const skillsByCategory = computed(() => {
    const groups: Record<SkillCategory, SkillDefinition[]> = {
      marketing: [],
      creator: [],
    }
    for (const s of skills.value) groups[s.category].push(s)
    return groups
  })

  async function createSkill(input: Omit<SkillDefinition, 'id' | 'isCustom'>, workspaceId = userStore.activeWorkspace?.id) {
    if (!canManageSkills.value) return null

    const tempId = `sk-custom-${Date.now()}`
    skills.value.unshift({ ...input, id: tempId, isCustom: true })

    if (usingMocks.value) return tempId
    if (!workspaceId) {
      skills.value = skills.value.filter((skill) => skill.id !== tempId)
      useToast().error('Couldn\'t save the skill', { detail: 'No active workspace selected.' })
      return null
    }

    try {
      const row = await $fetch<any>('/api/skills', {
        method: 'POST',
        credentials: 'include',
        body: {
          workspace_id: workspaceId,
          name: input.name,
          category: input.category,
          description: input.description,
          instructions: input.instructions,
          examples: input.examples,
        },
      })
      const idx = skills.value.findIndex((skill) => skill.id === tempId)
      if (idx >= 0) skills.value[idx] = rowToSkillDefinition(row)
      return row.id as string
    } catch (err: any) {
      skills.value = skills.value.filter((skill) => skill.id !== tempId)
      useToast().error('Couldn\'t save the skill', { detail: err?.statusMessage || err?.message })
      return null
    }
  }

  async function updateSkill(
    id: string,
    patch: Partial<Pick<SkillDefinition, 'name' | 'description' | 'instructions' | 'examples'>>,
  ) {
    if (!canManageSkills.value) return false

    const idx = skills.value.findIndex((s) => s.id === id)
    if (idx < 0) return false
    if (!skills.value[idx]?.isCustom) return false

    // Optimistic update
    const original = { ...skills.value[idx] } as SkillDefinition
    Object.assign(skills.value[idx]!, patch)

    if (usingMocks.value) {
      projectsStore.syncSkillName(id, skills.value[idx]!.name)
      return true
    }

    try {
      const updated = await $fetch<any>(`/api/skills/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        body: patch,
      })
      skills.value[idx] = rowToSkillDefinition(updated)
      projectsStore.syncSkillName(id, skills.value[idx]!.name)
      return true
    } catch (err: any) {
      // Roll back
      skills.value[idx] = original
      useToast().error('Couldn\'t update the skill', { detail: err?.statusMessage || err?.message })
      return false
    }
  }

  async function deleteSkill(id: string) {
    if (!canManageSkills.value) return false

    const idx = skills.value.findIndex((s) => s.id === id)
    if (idx < 0) return false
    if (!skills.value[idx]?.isCustom) return false

    const [removed] = skills.value.splice(idx, 1) // optimistic remove

    if (usingMocks.value) {
      projectsStore.removeSkillFromProjects(id)
      return true
    }

    try {
      await $fetch(`/api/skills/${id}`, { method: 'DELETE', credentials: 'include' })
      projectsStore.removeSkillFromProjects(id)
      return true
    } catch (err: any) {
      // Roll back
      skills.value.splice(idx, 0, removed!)
      useToast().error('Couldn\'t delete the skill', { detail: err?.statusMessage || err?.message })
      return false
    }
  }

  function getSkill(id: string) {
    return skills.value.find((s) => s.id === id) ?? null
  }

  return {
    skills,
    activeCategory,
    searchQuery,
    usingMocks,
    hydrated,
    canManageSkills,
    filteredSkills,
    skillsByCategory,
    loadFromBackend,
    createSkill,
    updateSkill,
    deleteSkill,
    getSkill,
  }
})
