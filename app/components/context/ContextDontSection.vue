<template>
  <ContextRuleChips
    :items="items"
    :editing="editing"
    title="DON'T"
    title-color-class="text-red-500"
    chip-color-class="bg-red-50 border border-red-200 text-red-900"
    input-border-class="border-red-200 focus:border-red-400"
    add-btn-class="bg-red-100 text-red-700 hover:bg-red-200"
    remove-btn-class="text-red-700/60 hover:text-red-700"
    add-placeholder="Add a DON'T rule…"
    empty-hint="No DON'T rules yet. These tell Floo what your brand should never do."
    @update:items="(v) => emit('update:items', v)"
  />
</template>

<script setup lang="ts">
defineProps<{
  items: string[]
  editing: boolean
}>()

const emit = defineEmits<{
  'update:items': [value: string[]]
}>()
</script>
