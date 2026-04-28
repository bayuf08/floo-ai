import { defineStore } from 'pinia'
import type { SkillDefinition, SkillCategory } from '~/types/skill'

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<SkillDefinition[]>([
    // ── Voice (6) ──
    { id: 'sk-v1', name: 'Quiet Artisan', category: 'voice', description: 'Short Indonesian sentences, weight-bearing. No hype words.' },
    { id: 'sk-v2', name: 'Hype Mode', category: 'voice', description: 'High-energy, exclamation-heavy, leans into trending phrases.' },
    { id: 'sk-v3', name: 'Indo-English Mix', category: 'voice', description: 'Code-switches between Bahasa and English where each lands harder.' },
    { id: 'sk-v4', name: 'Editorial', category: 'voice', description: 'Long-form, considered, magazine-feature register.' },
    { id: 'sk-v5', name: 'Conversational', category: 'voice', description: 'Like talking to a friend over coffee. Contractions, asides.' },
    { id: 'sk-v6', name: 'Provocateur', category: 'voice', description: 'Pointed, contrarian openers designed to spark replies.' },

    // ── Format (6) ──
    { id: 'sk-f1', name: 'Numbered Hooks', category: 'format', description: '5–7 hook variations as a numbered list, ranked by stopping power.' },
    { id: 'sk-f2', name: 'Carousel Outline', category: 'format', description: 'Slide-by-slide outline with cover, body slides, and CTA.' },
    { id: 'sk-f3', name: 'Short Caption', category: 'format', description: 'Under 100 characters. One line, no hashtags inline.' },
    { id: 'sk-f4', name: 'Long Caption', category: 'format', description: '3–5 short paragraphs with line breaks for scannability.' },
    { id: 'sk-f5', name: 'Thread Builder', category: 'format', description: 'Twitter/X thread with numbered tweets and a strong opener.' },
    { id: 'sk-f6', name: 'Script Beats', category: 'format', description: 'Hook, build, payoff, CTA — beats for short-form video.' },

    // ── Trend (6) ──
    { id: 'sk-t1', name: 'Audio Trend Match', category: 'trend', description: 'Suggests trending audio that fits the brand voice.' },
    { id: 'sk-t2', name: 'Visual Trend Match', category: 'trend', description: 'Identifies visual treatments currently performing in the niche.' },
    { id: 'sk-t3', name: 'Cultural Moment', category: 'trend', description: 'Connects content to a current cultural conversation.' },
    { id: 'sk-t4', name: 'Seasonal Anchor', category: 'trend', description: 'Anchors the post to a calendar moment (holiday, weather, ritual).' },
    { id: 'sk-t5', name: 'Niche Reference', category: 'trend', description: 'Drops references that signal in-group fluency to the audience.' },
    { id: 'sk-t6', name: 'Counter-Trend', category: 'trend', description: 'Deliberately positions against the current trend for contrast.' },

    // ── Workflow (6) ──
    { id: 'sk-w1', name: 'Brief Summarizer', category: 'workflow', description: 'Distills a long brief into a 3-line creative direction.' },
    { id: 'sk-w2', name: 'Concept Variations', category: 'workflow', description: 'Generates 3 distinct creative angles from one starting concept.' },
    { id: 'sk-w3', name: 'Hashtag Researcher', category: 'workflow', description: 'Suggests platform-appropriate hashtags by reach band.' },
    { id: 'sk-w4', name: 'Posting Time Suggester', category: 'workflow', description: 'Recommends post timing based on platform + audience timezone.' },
    { id: 'sk-w5', name: 'Cross-Platform Adapter', category: 'workflow', description: 'Rewrites one piece of content for 3 platforms preserving voice.' },
    { id: 'sk-w6', name: 'Performance Recap', category: 'workflow', description: 'Summarizes which patterns drove engagement in the last cycle.' },
  ])

  const activeCategory = ref<SkillCategory | 'all'>('all')
  const searchQuery = ref('')
  const usingMocks = ref(true)
  const hydrated = ref(false)

  /**
   * Hydrate the skill catalog from /api/skills. Pulls system skills + the
   * given workspace's custom skills. Falls back silently to mocks if the
   * backend isn't reachable.
   */
  async function loadFromBackend(workspaceId?: string) {
    if (hydrated.value && !workspaceId) return
    try {
      const url = workspaceId ? `/api/skills?workspace=${workspaceId}` : '/api/skills'
      const rows = await $fetch<any[]>(url, { credentials: 'include' })
      if (Array.isArray(rows) && rows.length > 0) {
        skills.value = rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          description: r.description ?? '',
          instructions: r.instructions ?? undefined,
          examples: r.examples ?? undefined,
          isCustom: !!r.is_custom,
        }))
        usingMocks.value = false
      }
      hydrated.value = true
    } catch (err) {
      console.warn('[skillsStore] backend not reachable; staying on mock data', err)
      hydrated.value = true
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
      voice: [],
      format: [],
      trend: [],
      workflow: [],
    }
    for (const s of skills.value) groups[s.category].push(s)
    return groups
  })

  function createSkill(input: Omit<SkillDefinition, 'id' | 'isCustom'>, workspaceId?: string) {
    const tempId = `sk-custom-${Date.now()}`
    skills.value.unshift({ ...input, id: tempId, isCustom: true })

    if (!usingMocks.value && workspaceId) {
      $fetch<any>('/api/skills', {
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
        .then((row) => {
          const idx = skills.value.findIndex((s) => s.id === tempId)
          if (idx >= 0) skills.value[idx] = { ...skills.value[idx]!, id: row.id }
        })
        .catch((err: any) => {
          useToast().error('Couldn\'t save the skill', { detail: err?.statusMessage || err?.message })
        })
    }
    return tempId
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
    filteredSkills,
    skillsByCategory,
    loadFromBackend,
    createSkill,
    getSkill,
  }
})
