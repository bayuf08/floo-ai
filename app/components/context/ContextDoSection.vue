<template>
  <ContextRuleChips
    :items="items"
    :editing="editing"
    title="DO"
    title-color-class="text-green-600"
    chip-color-class="bg-green-50 border border-green-200 text-green-900"
    input-border-class="border-green-200 focus:border-green-400"
    add-btn-class="bg-green-100 text-green-700 hover:bg-green-200"
    remove-btn-class="text-green-700/60 hover:text-green-700"
    add-placeholder="Add a DO rule…"
    empty-hint="No DO rules yet. These tell Floo what your brand always does."
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
