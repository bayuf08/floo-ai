<template>
  <div class="flex flex-col h-full">
    <ProjectHeader />
    <ChatThread />
    <ChatComposer />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()

// Set active project from route
watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') {
      projectsStore.setActiveProject(id)
    }
  },
  { immediate: true },
)

// If the active project becomes null (workspace switched away), redirect to
// the first project of the new workspace or to /projects
watch(
  () => projectsStore.activeProject,
  (project) => {
    if (!project) {
      const first = projectsStore.projectsByWorkspace[0]
      if (first) router.replace(`/projects/${first.id}`)
      else router.replace('/projects')
    }
  },
)
</script>
