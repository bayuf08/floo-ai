<template>
  <div
    ref="menuRef"
    class="absolute z-50"
    :style="{
      top: 'calc(100% + 6px)',
      right: '0',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '6px',
      minWidth: '210px',
    }"
    role="menu"
  >
    <button
      v-for="item in items"
      :key="item.label"
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-2.5 text-left"
      :style="itemStyle(item)"
      @click="run(item)"
      @mouseenter="hover($event, true, item.danger)"
      @mouseleave="hover($event, false, item.danger)"
    >
      <Icon :name="item.icon" class="w-3.5 h-3.5" :style="{ color: item.danger ? 'currentColor' : 'var(--fg-3)' }" />
      <span :style="{ flex: 1 }">{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useClickOutside } from '~/composables/useClickOutside'

type MenuKey = 'rename' | 'platform' | 'members' | 'duplicate' | 'export' | 'delete'
interface MenuItem {
  key: MenuKey
  label: string
  icon: string
  danger?: boolean
}

const emit = defineEmits<{
  close: []
  select: [key: MenuKey]
}>()

const menuRef = ref<HTMLElement | null>(null)
useClickOutside(menuRef, () => emit('close'))

const items: MenuItem[] = [
  { key: 'rename', label: 'Rename project', icon: 'lucide:pencil' },
  { key: 'platform', label: 'Change platform', icon: 'lucide:layers' },
  { key: 'members', label: 'Manage members', icon: 'lucide:users' },
  { key: 'duplicate', label: 'Duplicate project', icon: 'lucide:copy' },
  { key: 'export', label: 'Export conversation', icon: 'lucide:download' },
  { key: 'delete', label: 'Delete project', icon: 'lucide:trash-2', danger: true },
]

function run(item: MenuItem) {
  emit('select', item.key)
  emit('close')
}

function itemStyle(item: MenuItem) {
  return {
    padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    background: 'transparent',
    color: item.danger ? 'var(--ft-red)' : 'var(--fg)',
    fontSize: '13px',
    fontWeight: 500,
  }
}

function hover(e: MouseEvent, enter: boolean, danger?: boolean) {
  ;(e.currentTarget as HTMLElement).style.background = enter
    ? danger
      ? 'color-mix(in srgb, var(--ft-red) 12%, transparent)'
      : 'var(--bg-2)'
    : 'transparent'
}
</script>
