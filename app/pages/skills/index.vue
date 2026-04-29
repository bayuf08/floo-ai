<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Page Header -->
    <header class="flex-shrink-0 px-8 pt-8 pb-6 border-b border-floo-border bg-floo-surface">
      <div class="flex items-start justify-between mb-5">
        <div>
          <h1 class="font-display font-bold text-2xl text-floo-text mb-1">Skill library</h1>
          <p class="text-sm text-floo-text-secondary">
            Reusable patterns Floo applies when generating content.
            <span class="text-floo-text-muted">
              {{ skillsStore.skills.length }} total · {{ activeOnCurrentProject.size }} active on current project.
            </span>
          </p>
        </div>
        <button
          type="button"
          :disabled="!userStore.canManageSkills"
          @click="createOpen = true"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-floo-cta text-floo-cta-fg rounded-floo-md hover:opacity-90 transition shadow-floo-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="heroicons:plus" class="w-4 h-4" />
          New skill
        </button>
      </div>

      <!-- Search -->
      <div class="relative max-w-md">
        <Icon
          name="heroicons:magnifying-glass"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-floo-text-muted"
        />
        <input
          v-model="skillsStore.searchQuery"
          type="text"
          placeholder="Search skills…"
          aria-label="Search skills"
          class="w-full pl-9 pr-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition"
        />
      </div>
    </header>

    <!-- Body: nav + grid -->
    <div class="flex-1 flex min-h-0 overflow-hidden">
      <!-- Sidebar nav -->
      <aside class="flex-shrink-0 w-56 border-r border-floo-border bg-floo-surface overflow-y-auto custom-scrollbar p-4">
        <SkillCategoryNav
          v-model:active="skillsStore.activeCategory"
          :counts="categoryCounts"
          :total-count="skillsStore.skills.length"
        />
      </aside>

      <!-- Grid -->
      <div class="flex-1 overflow-y-auto custom-scrollbar px-8 py-6">
        <div v-if="skillsStore.filteredSkills.length === 0" class="h-full flex items-center justify-center">
          <AppEmptyState
            title="No skills match"
            description="Try clearing the search or selecting a different category."
          />
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <SkillCard
            v-for="skill in skillsStore.filteredSkills"
            :key="skill.id"
            :skill="skill"
            :is-active="activeOnCurrentProject.has(skill.id)"
            :toggle-disabled="!canToggleCurrentProjectSkills"
            @toggle="toggleSkill"
            @open="openDetails"
          />
        </div>
      </div>
    </div>

    <CreateSkillModal
      v-model="createOpen"
      :default-category="skillsStore.activeCategory"
    />
    <SkillDetailDrawer :skill="detailSkill" @close="detailSkill = null" />
  </div>
</template>

<script setup lang="ts">
import type { SkillCategory, SkillDefinition } from '~/types/skill'

const skillsStore = useSkillsStore()
const projectsStore = useProjectsStore()
const userStore = useUserStore()

const createOpen = ref(false)
const detailSkill = ref<SkillDefinition | null>(null)
// When the user/projects stores are live but the skill catalog is still on
// mocks (hydration failed or hasn't completed), the in-memory skill IDs are
// non-UUID strings like "sk-v1" — toggling them would 500 on the API. Gate
// the toggles off in that case. Pure mock mode (userStore.usingMocks) is
// fine because the Projects store will short-circuit locally.
const canToggleCurrentProjectSkills = computed(() =>
  !!projectsStore.activeProject &&
  userStore.canToggleProjectSkills &&
  (userStore.usingMocks || !skillsStore.usingMocks),
)

// Skills active on the currently focused project (the one the workspace is showing)
const activeOnCurrentProject = computed(() => {
  const set = new Set<string>()
  const ctx = projectsStore.activeProject?.contextRules
  if (!ctx?.skills) return set
  for (const s of ctx.skills) if (s.active) set.add(s.id)
  return set
})

const categoryCounts = computed<Record<SkillCategory, number>>(() => ({
  marketing: skillsStore.skillsByCategory.marketing.length,
  creator: skillsStore.skillsByCategory.creator.length,
}))

async function toggleSkill(skill: SkillDefinition) {
  const project = projectsStore.activeProject
  if (!project) return

  const existing = project.contextRules?.skills?.find((s) => s.id === skill.id)
  await projectsStore.setProjectSkillActive(project.id, { id: skill.id, name: skill.name }, !existing?.active)
}

function openDetails(skill: SkillDefinition) {
  detailSkill.value = skill
}

useHead({ title: 'Skill library · Floo·Content' })
</script>
