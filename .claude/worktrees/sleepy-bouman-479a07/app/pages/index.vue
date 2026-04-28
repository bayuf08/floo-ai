<template>
  <div class="flex flex-col h-full">
    <ProjectHeader />
    <ChatThread />
    <ChatComposer />
  </div>
</template>

<script setup lang="ts">
// Default view shows the active project
const projectsStore = useProjectsStore()

// Ensure first project is selected
onMounted(() => {
  if (!projectsStore.activeProjectId && projectsStore.projects.length) {
    projectsStore.setActiveProject(projectsStore.projects[0].id)
  }
})
</script>
