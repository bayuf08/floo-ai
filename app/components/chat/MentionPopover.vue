<template>
  <div :style="rootStyle" role="listbox" aria-label="Knowledge files">
    <button
      v-for="(file, idx) in files"
      :key="file.id"
      type="button"
      role="option"
      :aria-selected="idx === selectedIndex"
      @mousedown.prevent="emit('select', file)"
      @mouseenter="emit('hover', idx)"
      :style="itemStyle(idx)"
    >
      <span class="flex items-center justify-center" :style="iconBoxStyle">
        <Icon name="lucide:file-text" class="w-3.5 h-3.5" />
      </span>
      <span class="flex flex-col" :style="{ minWidth: 0, flex: 1, gap: '1px', textAlign: 'left' }">
        <span :style="nameStyle">{{ file.name }}</span>
        <span :style="metaStyle">{{ file.size }}</span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { BrandAsset } from '~/types/project'

const props = defineProps<{
  files: BrandAsset[]
  selectedIndex: number
}>()

const emit = defineEmits<{
  select: [file: BrandAsset]
  hover: [index: number]
}>()

const rootStyle = {
  position: 'absolute' as const,
  bottom: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  maxHeight: '240px',
  overflowY: 'auto' as const,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  boxShadow: 'var(--shadow-md)',
  padding: '4px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '2px',
  zIndex: 30,
}

function itemStyle(idx: number) {
  const isSelected = idx === props.selectedIndex
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: 'var(--r-sm)',
    background: isSelected ? 'var(--brand-tint)' : 'transparent',
    color: 'var(--fg)',
    cursor: 'pointer',
    border: 'none',
    width: '100%',
    transition: 'background 80ms var(--ease-out)',
  }
}

const iconBoxStyle = {
  width: '24px',
  height: '24px',
  borderRadius: '5px',
  background: 'var(--bg-2)',
  color: 'var(--brand)',
  flexShrink: 0,
}

const nameStyle = {
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--fg)',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const metaStyle = {
  fontSize: '11px',
  color: 'var(--fg-3)',
}
</script>
