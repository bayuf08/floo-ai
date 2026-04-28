<template>
  <div class="px-4 flex items-center justify-between">
    <NuxtLink to="/" class="flex items-center gap-2 group min-w-0">
      <!-- Collapsed: icon mark only -->
      <img
        v-if="collapsed"
        src="/images/floothink-icon-mark.png"
        alt="Floothink"
        class="w-8 h-8 object-contain"
      />
      <!-- Expanded: full wordmark + product name -->
      <template v-else>
        <img
          :src="wordmark"
          alt="Floothink"
          class="h-5 w-auto object-contain shrink-0"
        />
        <span class="font-display font-bold text-base text-floo-text tracking-tight truncate">
          <span class="opacity-60">|</span> Content
        </span>
      </template>
    </NuxtLink>

    <button
      type="button"
      :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      @click="$emit('toggle')"
      class="p-1 rounded-md text-floo-text-muted hover:text-floo-text-secondary hover:bg-floo-surface-hover transition-colors"
    >
      <Icon
        :name="collapsed ? 'heroicons:chevron-double-right' : 'heroicons:chevron-double-left'"
        class="w-4 h-4"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'

defineProps<{
  collapsed: boolean
}>()

defineEmits<{
  toggle: []
}>()

const { isDark } = useTheme()

const wordmark = computed(() =>
  isDark.value
    ? '/images/floothink-white-main.png'
    : '/images/floothink-purple-main.png'
)
</script>
