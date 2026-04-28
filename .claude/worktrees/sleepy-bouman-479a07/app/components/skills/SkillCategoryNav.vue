<template>
  <nav class="space-y-0.5">
    <button
      type="button"
      @click="$emit('update:active', 'all')"
      class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-floo-md text-[13px] transition-colors text-left"
      :class="active === 'all'
        ? 'bg-floo-brand-tint text-floo-brand font-medium'
        : 'text-floo-text-secondary hover:text-floo-text hover:bg-floo-surface-hover'"
    >
      <span class="flex items-center gap-2">
        <Icon name="heroicons:squares-2x2" class="w-4 h-4" />
        All skills
      </span>
      <span class="text-[11px] text-floo-text-muted tabular-nums">{{ totalCount }}</span>
    </button>

    <button
      v-for="cat in categories"
      :key="cat.value"
      type="button"
      @click="$emit('update:active', cat.value)"
      class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-floo-md text-[13px] transition-colors text-left"
      :class="active === cat.value
        ? 'bg-floo-brand-tint text-floo-brand font-medium'
        : 'text-floo-text-secondary hover:text-floo-text hover:bg-floo-surface-hover'"
    >
      <span class="flex items-center gap-2">
        <Icon :name="cat.icon" class="w-4 h-4" />
        {{ cat.label }}
      </span>
      <span class="text-[11px] text-floo-text-muted tabular-nums">{{ counts[cat.value] }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import type { SkillCategory } from '~/types/skill'

const props = defineProps<{
  active: SkillCategory | 'all'
  counts: Record<SkillCategory, number>
  totalCount: number
}>()

defineEmits<{
  'update:active': [value: SkillCategory | 'all']
}>()

const categories: { value: SkillCategory; label: string; icon: string }[] = [
  { value: 'voice', label: 'Voice', icon: 'heroicons:speaker-wave' },
  { value: 'format', label: 'Format', icon: 'heroicons:rectangle-stack' },
  { value: 'trend', label: 'Trend', icon: 'heroicons:fire' },
  { value: 'workflow', label: 'Workflow', icon: 'heroicons:bolt' },
]
</script>
