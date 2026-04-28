<template>
  <div class="space-y-0.5">
    <SidebarProjectItem
      v-for="project in visibleProjects"
      :key="project.id"
      :project="project"
      :active="project.id === projectsStore.activeProjectId"
      :collapsed="collapsed"
      @click="selectProject(project.id)"
    />

    <!-- Empty state: backend mode, this workspace has no projects yet -->
    <div
      v-if="!collapsed && showEmptyState"
      :style="{
        padding: '12px 14px',
        marginTop: '6px',
        fontSize: '12px',
        color: 'var(--fg-3)',
        background: 'var(--bg-2)',
        border: '1px dashed var(--border-soft)',
        borderRadius: 'var(--r-md)',
        lineHeight: 1.5,
      }"
    >
      No projects yet. Click <strong :style="{ color: 'var(--fg-2)', fontWeight: 600 }">+ New project</strong> above to start, or accept an invite link from a teammate.
    </div>

    <!-- Backend-error hint: only when something explicitly failed -->
    <div
      v-else-if="!collapsed && projectsStore.backendError && !projectsStore.usingMocks"
      :style="{
        padding: '10px 12px',
        marginTop: '6px',
        fontSize: '11.5px',
        color: 'var(--ft-coral)',
        background: 'color-mix(in srgb, var(--ft-coral) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--ft-coral) 22%, transparent)',
        borderRadius: 'var(--r-md)',
      }"
    >
      Couldn't reach the server. Showing what we have cached.
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  collapsed: boolean
}>()

const projectsStore = useProjectsStore()
const router = useRouter()

/**
 * Filter projects to the active workspace so the sidebar list never leaks
 * entries from other workspaces (the previous behavior was iterating the
 * raw `projects` array, which showed mock entries for every workspace at
 * once).
 */
const visibleProjects = computed(() => projectsStore.projectsByWorkspace)

const showEmptyState = computed(
  () => !projectsStore.usingMocks && visibleProjects.value.length === 0
)

function selectProject(id: string) {
  projectsStore.setActiveProject(id)
  router.push(`/projects/${id}`)
}
</script>
