<template>
  <div class="flex border-b border-floo-border px-5">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      @click="$emit('update:modelValue', tab.value)"
      class="relative px-4 py-3 text-[13px] font-medium transition-colors"
      :class="[
        modelValue === tab.value
          ? 'text-purple-500'
          : 'text-floo-text-muted hover:text-floo-text-secondary',
      ]"
    >
      {{ tab.label }}
      <!-- Active underline -->
      <span
        v-if="modelValue === tab.value"
        class="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-500 rounded-full"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: 'rules' | 'skills' | 'platform'
}>()

defineEmits<{
  'update:modelValue': [value: 'rules' | 'skills' | 'platform']
}>()

const tabs = [
  { value: 'rules' as const, label: 'Rules' },
  { value: 'skills' as const, label: 'Skills' },
  { value: 'platform' as const, label: 'Platform' },
]
</script>
