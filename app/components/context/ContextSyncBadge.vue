<template>
  <div class="flex items-center justify-between">
    <p class="text-[11px] text-floo-text-muted leading-snug">
      Living document · synced with Floo on every message
    </p>
    <button
      @click="$emit('toggleEdit')"
      class="flex items-center gap-1 text-[12px] font-medium transition-colors"
      :class="editing ? 'text-amber-500' : 'text-purple-500 hover:text-purple-600'"
    >
      <Icon :name="editing ? 'heroicons:check' : 'heroicons:pencil'" class="w-3.5 h-3.5" />
      {{ editing ? 'Done' : 'Edit' }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  editing: boolean
}>()

defineEmits<{
  toggleEdit: []
}>()
</script>
