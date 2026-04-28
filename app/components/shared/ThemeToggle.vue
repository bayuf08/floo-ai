<template>
  <button
    type="button"
    @click="toggleTheme"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    :title="isDark ? 'Light mode' : 'Dark mode'"
    class="p-2 rounded-floo-md text-floo-text-secondary hover:text-floo-text hover:bg-floo-surface-hover transition-colors"
  >
    <Icon
      :name="isDark ? 'heroicons:sun' : 'heroicons:moon'"
      class="w-4 h-4"
    />
  </button>
</template>

<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'

const { isDark, toggleTheme } = useTheme()
</script>
