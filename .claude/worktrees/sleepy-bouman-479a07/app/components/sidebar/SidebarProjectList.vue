<template>
  <div class="space-y-0.5">
    <SidebarProjectItem
      v-for="project in projectsStore.projects"
      :key="project.id"
      :project="project"
      :active="project.id === projectsStore.activeProjectId"
      :collapsed="collapsed"
      @click="selectProject(project.id)"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  collapsed: boolean
}>()

const projectsStore = useProjectsStore()
const router = useRouter()

function selectProject(id: string) {
  projectsStore.setActiveProject(id)
  router.push(`/projects/${id}`)
}
</script>
