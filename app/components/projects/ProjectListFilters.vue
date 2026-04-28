<template>
  <div class="flex items-center gap-3 flex-wrap">
    <!-- Search -->
    <div class="relative flex-1 min-w-[220px] max-w-md">
      <Icon
        name="heroicons:magnifying-glass"
        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-floo-text-muted"
      />
      <input
        :value="search"
        @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="Search projects…"
        aria-label="Search projects"
        class="w-full pl-9 pr-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition"
      />
    </div>

    <!-- Platform filter -->
    <div class="flex items-center gap-1 p-1 bg-floo-surface-2 border border-floo-border rounded-floo-md">
      <button
        type="button"
        @click="$emit('update:platform', null)"
        class="px-2.5 py-1 text-[12px] font-medium rounded transition-colors"
        :class="platform === null
          ? 'bg-floo-surface text-floo-text shadow-floo-xs'
          : 'text-floo-text-secondary hover:text-floo-text'"
      >
        All
      </button>
      <button
        v-for="p in platforms"
        :key="p"
        type="button"
        @click="$emit('update:platform', p)"
        class="px-2.5 py-1 text-[12px] font-medium rounded transition-colors capitalize"
        :class="platform === p
          ? 'bg-floo-surface text-floo-text shadow-floo-xs'
          : 'text-floo-text-secondary hover:text-floo-text'"
      >
        {{ p === 'twitter' ? 'X' : p }}
      </button>
    </div>

    <!-- Sort -->
    <select
      :value="sort"
      @change="$emit('update:sort', ($event.target as HTMLSelectElement).value as any)"
      aria-label="Sort projects"
      class="px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition cursor-pointer"
    >
      <option value="recent">Most recent</option>
      <option value="alpha">A → Z</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'

defineProps<{
  search: string
  platform: Platform | null
  sort: 'recent' | 'alpha'
}>()

defineEmits<{
  'update:search': [value: string]
  'update:platform': [value: Platform | null]
  'update:sort': [value: 'recent' | 'alpha']
}>()

const platforms: Platform[] = ['tiktok', 'instagram', 'twitter', 'youtube', 'linkedin', 'threads']
</script>
