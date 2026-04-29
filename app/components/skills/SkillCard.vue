<template>
  <button
    type="button"
    @click="$emit('open', skill)"
    class="text-left bg-floo-surface border border-floo-border rounded-floo-lg p-4 hover:shadow-floo-md hover:border-floo-border-strong transition-all duration-200 flex flex-col gap-3"
  >
    <!-- Top row: category chip + active toggle -->
    <div class="flex items-center justify-between">
      <span
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide"
        :class="categoryClass"
      >
        {{ CATEGORY_LABELS[skill.category] }}
      </span>
      <span
        v-if="skill.isCustom"
        class="text-[10px] font-medium text-floo-text-muted uppercase tracking-wide"
      >
        Custom
      </span>
    </div>

    <!-- Name + description -->
    <div class="flex-1 min-h-0">
      <h3 class="font-display font-semibold text-[15px] text-floo-text mb-1.5 leading-snug">
        {{ skill.name }}
      </h3>
      <p class="text-[12.5px] text-floo-text-secondary leading-relaxed line-clamp-2">
        {{ skill.description }}
      </p>
    </div>

    <!-- Active toggle -->
    <div
      class="flex items-center justify-between pt-2 border-t border-floo-border-soft"
      @click.stop
    >
      <span class="text-[11px] text-floo-text-muted">
        {{ isActive ? 'Active on this project' : 'Available' }}
      </span>
      <button
        type="button"
        role="switch"
        :aria-checked="isActive"
        :aria-label="`Toggle ${skill.name}`"
        :disabled="toggleDisabled"
        @click.stop="$emit('toggle', skill)"
        class="relative inline-flex w-9 h-5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :class="isActive ? 'bg-floo-brand' : 'bg-floo-border-strong'"
      >
        <span
          class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-floo-xs transition-transform"
          :class="isActive ? 'translate-x-4' : 'translate-x-0'"
        />
      </button>
    </div>
  </button>
</template>

<script setup lang="ts">
import { CATEGORY_LABELS, type SkillCategory, type SkillDefinition } from '~/types/skill'

const props = defineProps<{
  skill: SkillDefinition
  isActive: boolean
  toggleDisabled?: boolean
}>()

defineEmits<{
  toggle: [skill: SkillDefinition]
  open: [skill: SkillDefinition]
}>()

const categoryClass = computed(() => {
  const map: Record<SkillCategory, string> = {
    marketing: 'bg-blue-50 text-blue-700',
    creator: 'bg-purple-50 text-purple-700',
  }
  return map[props.skill.category]
})
</script>
