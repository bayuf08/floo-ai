<template>
  <div
    class="animate-fade-in-up"
    :style="{ padding: '6px 16px 10px', borderBottom: '1px solid var(--border-soft)' }"
  >
    <!-- Platform chips -->
    <div :style="{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }">
      <button
        v-for="p in platforms"
        :key="p.value"
        type="button"
        :aria-pressed="selectedPlatforms.includes(p.value)"
        :title="p.label"
        @click="togglePlatform(p.value)"
        class="flex items-center justify-center"
        :style="chipStyle(p.value)"
        @mouseenter="hoverChip($event, p.value, true)"
        @mouseleave="hoverChip($event, p.value, false)"
      >
        <Icon :name="p.icon" class="w-3 h-3" />
      </button>
    </div>

    <!-- Sort segmented control -->
    <div
      class="flex items-center"
      :style="{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        padding: '2px',
      }"
    >
      <button
        v-for="opt in sortOptions"
        :key="opt.value"
        type="button"
        @click="$emit('update:sort', opt.value)"
        class="flex-1 text-center"
        :style="sortBtnStyle(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'

const props = defineProps<{
  selectedPlatforms: Platform[]
  sort: 'recent' | 'alpha'
}>()

const emit = defineEmits<{
  'update:selectedPlatforms': [value: Platform[]]
  'update:sort': [value: 'recent' | 'alpha']
}>()

const platforms: { value: Platform; label: string; icon: string }[] = [
  { value: 'tiktok', label: 'TikTok', icon: 'simple-icons:tiktok' },
  { value: 'instagram', label: 'Instagram', icon: 'simple-icons:instagram' },
  { value: 'youtube', label: 'YouTube', icon: 'simple-icons:youtube' },
  { value: 'twitter', label: 'X', icon: 'simple-icons:x' },
  { value: 'threads', label: 'Threads', icon: 'simple-icons:threads' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'simple-icons:linkedin' },
]

const sortOptions: { value: 'recent' | 'alpha'; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'alpha', label: 'A → Z' },
]

function isSelected(p: Platform) {
  return props.selectedPlatforms.includes(p)
}

function togglePlatform(p: Platform) {
  const next = isSelected(p)
    ? props.selectedPlatforms.filter((x) => x !== p)
    : [...props.selectedPlatforms, p]
  emit('update:selectedPlatforms', next)
}

function chipStyle(p: Platform) {
  const selected = isSelected(p)
  return {
    width: '24px',
    height: '24px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid',
    borderColor: selected ? 'var(--brand)' : 'var(--border)',
    background: selected ? 'var(--brand-tint)' : 'var(--surface)',
    color: selected ? 'var(--brand)' : 'var(--fg-3)',
    transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
  }
}

function hoverChip(e: MouseEvent, p: Platform, enter: boolean) {
  if (isSelected(p)) return
  const el = e.currentTarget as HTMLElement
  el.style.background = enter ? 'var(--bg-2)' : 'var(--surface)'
}

function sortBtnStyle(value: 'recent' | 'alpha') {
  const active = value === props.sort
  return {
    padding: '4px 6px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: 'calc(var(--r-sm) - 2px)',
    background: active ? 'var(--brand-tint)' : 'transparent',
    color: active ? 'var(--brand)' : 'var(--fg-3)',
    transition: 'background 120ms var(--ease-out)',
  }
}
</script>
