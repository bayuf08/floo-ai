<template>
  <button
    v-if="count > 0"
    class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-floo-text-secondary hover:text-purple-500 hover:bg-purple-50 transition-colors"
  >
    <Icon name="heroicons:hashtag" class="w-3.5 h-3.5" />
    Skills · {{ count }}
  </button>
</template>

<script setup lang="ts">
defineProps<{
  count: number
}>()
</script>
