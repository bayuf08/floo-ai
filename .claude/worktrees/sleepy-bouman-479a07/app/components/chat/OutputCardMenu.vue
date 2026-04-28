<template>
  <div
    ref="menuRef"
    class="absolute z-50"
    :style="{
      top: 'calc(100% + 4px)',
      right: '0',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '6px',
      minWidth: '200px',
    }"
    role="menu"
  >
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-2.5 text-left"
      :style="itemStyle"
      @click="run(item.key)"
      @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--bg-2)')"
      @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'transparent')"
    >
      <Icon :name="item.icon" class="w-3.5 h-3.5" :style="{ color: 'var(--fg-3)' }" />
      <span :style="{ flex: 1 }">{{ item.label }}</span>
      <span
        v-if="item.key === 'save' && savedFlash"
        :style="{ fontSize: '10.5px', color: 'var(--ft-green)', fontWeight: 700 }"
      >Saved ✓</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useClickOutside } from '~/composables/useClickOutside'

type MenuKey = 'copy' | 'regenerate' | 'save' | 'report'

const props = defineProps<{
  savedFlash: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [key: MenuKey]
}>()

const menuRef = ref<HTMLElement | null>(null)
useClickOutside(menuRef, () => emit('close'))

const items: { key: MenuKey; label: string; icon: string }[] = [
  { key: 'copy', label: 'Copy all', icon: 'lucide:copy' },
  { key: 'regenerate', label: 'Regenerate', icon: 'lucide:refresh-cw' },
  { key: 'save', label: 'Save to project', icon: 'lucide:bookmark' },
  { key: 'report', label: 'Report issue', icon: 'lucide:flag' },
]

function run(key: MenuKey) {
  emit('select', key)
  if (key !== 'save') emit('close')
}

const itemStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--r-sm)',
  background: 'transparent',
  color: 'var(--fg)',
  fontSize: '13px',
  fontWeight: 500,
}
</script>
