<template>
  <div
    ref="popoverRef"
    class="absolute z-50"
    :style="{
      bottom: 'calc(100% + 6px)',
      left: '0',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '6px',
      minWidth: '280px',
      maxHeight: '320px',
      overflowY: 'auto',
    }"
    role="menu"
  >
    <div
      class="flex items-center justify-between"
      :style="{ padding: '6px 8px 8px' }"
    >
      <span
        :style="{
          fontSize: '10.5px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-3)',
        }"
      >Knowledge base</span>
    </div>

    <p
      v-if="!assets.length"
      :style="{ padding: '8px 10px 12px', fontSize: '12px', color: 'var(--fg-3)', fontStyle: 'italic' }"
    >
      No knowledge files yet — add them in Project settings.
    </p>

    <button
      v-for="asset in assets"
      :key="asset.id"
      type="button"
      @mousedown.prevent="emit('select', asset)"
      class="w-full flex items-center text-left"
      :style="rowStyle"
      @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--bg-2)')"
      @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'transparent')"
    >
      <span
        class="flex items-center justify-center flex-shrink-0"
        :style="{
          width: '26px',
          height: '26px',
          borderRadius: '6px',
          background: 'var(--brand-tint)',
          color: 'var(--brand)',
        }"
      >
        <Icon name="lucide:file-text" class="w-3.5 h-3.5" />
      </span>
      <div class="flex-1 min-w-0">
        <div
          class="font-display"
          :style="{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }"
        >{{ asset.name }}</div>
      </div>
      <span
        :style="{
          fontSize: '11px',
          color: 'var(--fg-3)',
          fontWeight: 500,
          flexShrink: 0,
        }"
      >Insert @</span>
    </button>

    <div
      :style="{
        marginTop: '4px',
        padding: '8px',
        borderTop: '1px solid var(--border-soft)',
      }"
    >
      <NuxtLink
        to="/project/settings"
        @click="emit('close')"
        :style="{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11.5px',
          fontWeight: 600,
          color: 'var(--brand)',
          textDecoration: 'none',
        }"
      >
        Manage in Project settings →
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BrandAsset } from '~/types/project'
import { useClickOutside } from '~/composables/useClickOutside'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  select: [asset: BrandAsset]
  close: []
}>()

const projectsStore = useProjectsStore()
const popoverRef = ref<HTMLElement | null>(null)

useClickOutside(popoverRef, () => emit('close'))

const assets = computed(() => {
  const p = projectsStore.projects.find((x) => x.id === props.projectId)
  return p?.contextRules?.brandAssets ?? []
})

const rowStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--r-sm)',
  gap: '10px',
  background: 'transparent',
  cursor: 'pointer',
}
</script>
