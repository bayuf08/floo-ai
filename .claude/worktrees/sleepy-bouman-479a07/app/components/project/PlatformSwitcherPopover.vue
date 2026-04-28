<template>
  <div
    ref="popoverRef"
    class="absolute z-50"
    :style="{
      top: 'calc(100% + 6px)',
      left: '0',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '8px',
      minWidth: '260px',
    }"
    role="menu"
  >
    <div
      :style="{
        fontSize: '10.5px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--fg-3)',
        padding: '4px 8px 8px',
      }"
    >
      Switch platform
    </div>
    <div :style="{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }">
      <button
        v-for="p in platforms"
        :key="p.value"
        type="button"
        @click="select(p.value)"
        :aria-pressed="p.value === currentPlatform"
        class="flex flex-col items-center justify-center"
        :style="chipStyle(p.value)"
      >
        <Icon :name="p.icon" class="w-4 h-4" :style="{ marginBottom: '4px' }" />
        <span :style="{ fontSize: '10.5px', fontWeight: 600 }">{{ p.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'
import { useClickOutside } from '~/composables/useClickOutside'

const props = defineProps<{
  projectId: string
  currentPlatform: Platform
}>()

const emit = defineEmits<{
  close: []
}>()

const projectsStore = useProjectsStore()
const popoverRef = ref<HTMLElement | null>(null)

useClickOutside(popoverRef, () => emit('close'))

const platforms: { value: Platform; label: string; icon: string }[] = [
  { value: 'tiktok', label: 'TikTok', icon: 'simple-icons:tiktok' },
  { value: 'instagram', label: 'Instagram', icon: 'simple-icons:instagram' },
  { value: 'youtube', label: 'YouTube', icon: 'simple-icons:youtube' },
  { value: 'twitter', label: 'X', icon: 'simple-icons:x' },
  { value: 'threads', label: 'Threads', icon: 'simple-icons:threads' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'simple-icons:linkedin' },
]

function select(platform: Platform) {
  projectsStore.changePlatform(props.projectId, platform)
  emit('close')
}

function chipStyle(value: Platform) {
  const active = value === props.currentPlatform
  return {
    padding: '10px 8px',
    borderRadius: 'var(--r-sm)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
    background: active ? 'var(--brand-tint)' : 'var(--surface)',
    color: active ? 'var(--brand)' : 'var(--fg-2)',
    transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
  }
}
</script>
