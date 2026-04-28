<template>
  <div class="flex-1 flex items-center justify-center">
    <AppEmptyState
      :title="title"
      :description="description"
    >
      <div class="flex items-center" :style="{ gap: '10px' }">
        <button
          type="button"
          @click="newProjectOpen = true"
          class="inline-flex items-center"
          :style="primaryBtnStyle"
        >
          <Icon name="lucide:plus" class="w-3.5 h-3.5" :style="{ marginRight: '6px' }" />
          {{ hasProjects ? 'New project' : 'Create your first project' }}
        </button>

        <NuxtLink
          v-if="hasProjects"
          to="/projects"
          class="inline-flex items-center"
          :style="secondaryLinkStyle"
        >
          Browse projects
          <Icon name="lucide:arrow-right" class="w-3.5 h-3.5" :style="{ marginLeft: '4px' }" />
        </NuxtLink>
      </div>
    </AppEmptyState>

    <NewProjectDialog v-model="newProjectOpen" />
  </div>
</template>

<script setup lang="ts">
/**
 * Rendered in the main column when there's a workspace but no active project.
 * If the workspace has projects (just none active), we show a "Browse projects"
 * link too. If it's empty, we tweak the copy to invite the first one.
 */
const projectsStore = useProjectsStore()
const newProjectOpen = ref(false)

const hasProjects = computed(() => projectsStore.projects.length > 0)

const title = computed(() =>
  hasProjects.value ? 'No project selected' : 'Start your first project',
)

const description = computed(() =>
  hasProjects.value
    ? 'Pick a project from the sidebar to start chatting with Floo, or create a new one.'
    : 'Projects are where Floo helps you draft, iterate, and ship social-ready content.',
)

const primaryBtnStyle = {
  padding: '10px 16px',
  fontSize: '13px',
  fontWeight: 700,
  background: 'var(--cta)',
  color: 'var(--cta-fg)',
  borderRadius: 'var(--r-md)',
  boxShadow: 'var(--shadow-xs)',
  transition: 'opacity 120ms var(--ease-out)',
}

const secondaryLinkStyle = {
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--brand)',
  borderRadius: 'var(--r-md)',
  textDecoration: 'none',
  transition: 'background 120ms var(--ease-out)',
}
</script>
