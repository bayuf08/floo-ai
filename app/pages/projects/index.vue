<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Page Header -->
    <header class="flex-shrink-0 px-8 pt-8 pb-6 border-b border-floo-border bg-floo-surface">
      <div class="flex items-start justify-between mb-6">
        <div>
          <h1 class="font-display font-bold text-2xl text-floo-text mb-1">All projects</h1>
          <p class="text-sm text-floo-text-secondary">
            {{ projectsStore.projects.length }}
            {{ projectsStore.projects.length === 1 ? 'project' : 'projects' }} across your workspace.
          </p>
        </div>
        <button
          type="button"
          @click="newProjectOpen = true"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-floo-cta text-floo-cta-fg rounded-floo-md hover:opacity-90 transition shadow-floo-sm"
        >
          <Icon name="heroicons:plus" class="w-4 h-4" />
          New project
        </button>
      </div>

      <ProjectListFilters
        v-model:search="search"
        v-model:platform="platformFilter"
        v-model:sort="sort"
      />
    </header>

    <!-- Grid -->
    <div class="flex-1 overflow-y-auto custom-scrollbar px-8 py-6">
      <div v-if="filteredProjects.length === 0" class="h-full flex items-center justify-center">
        <AppEmptyState
          v-if="projectsStore.projects.length === 0"
          title="Start your first concept"
          description="Projects are where Floo helps you draft, iterate, and ship social-ready content."
        >
          <button
            type="button"
            @click="newProjectOpen = true"
            class="px-4 py-2 text-sm font-semibold bg-floo-cta text-floo-cta-fg rounded-floo-md hover:opacity-90 transition"
          >
            Create your first project
          </button>
        </AppEmptyState>
        <AppEmptyState
          v-else
          title="No projects match"
          description="Try a different search term or clear the platform filter."
        >
          <button
            type="button"
            @click="clearFilters"
            class="px-4 py-2 text-sm font-medium text-floo-brand hover:bg-floo-brand-tint rounded-floo-md transition"
          >
            Clear filters
          </button>
        </AppEmptyState>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <ProjectListCard
          v-for="project in filteredProjects"
          :key="project.id"
          :project="project"
        />
      </div>
    </div>

    <NewProjectDialog v-model="newProjectOpen" />
  </div>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'

const projectsStore = useProjectsStore()

const search = ref('')
const platformFilter = ref<Platform | null>(null)
const sort = ref<'recent' | 'alpha'>('recent')
const newProjectOpen = ref(false)

const filteredProjects = computed(() => {
  let list = [...projectsStore.projects]

  if (platformFilter.value) {
    list = list.filter((p) => p.platform === platformFilter.value)
  }

  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter((p) => p.name.toLowerCase().includes(q))
  }

  if (sort.value === 'alpha') {
    list.sort((a, b) => a.name.localeCompare(b.name))
  } else {
    list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  return list
})

function clearFilters() {
  search.value = ''
  platformFilter.value = null
}

useHead({ title: 'All projects · Floo·Content' })
</script>
