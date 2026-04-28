<template>
  <button
    type="button"
    @click="dialogOpen = true"
    aria-label="Create new project"
    class="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-floo-cta hover:opacity-90 text-floo-cta-fg font-semibold text-sm transition-colors shadow-floo-sm"
    :class="collapsed ? 'px-2' : 'px-4'"
  >
    <Icon name="heroicons:plus" class="w-4 h-4" />
    <span v-if="!collapsed">New project</span>
  </button>

  <NewProjectDialog v-model="dialogOpen" />
</template>

<script setup lang="ts">
defineProps<{
  collapsed: boolean
}>()

const dialogOpen = ref(false)
</script>
