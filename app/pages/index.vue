<template>
  <div class="flex flex-col h-full">
    <template v-if="projectsStore.activeProject">
      <ProjectHeader />
      <ChatThread />
      <ChatComposer />
    </template>
    <NoActiveProjectEmptyState v-else />
  </div>
</template>

<script setup lang="ts">
// Home view. Branches on whether there's an active project — if not, the
// empty state invites the user to pick or create one. The previous
// auto-pick-first-project effect has been removed intentionally so that
// landing on `/` after a delete or workspace switch shows the empty state
// rather than silently jumping into an unrelated project.
const projectsStore = useProjectsStore()
</script>
