<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      @click="open = !open"
      class="inline-flex items-center"
      :style="{
        gap: '7px',
        padding: '6px 10px 6px 8px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--brand-tint)',
        color: 'var(--fg)',
        fontWeight: 600,
        fontSize: '12.5px',
        border: '1px solid color-mix(in srgb, var(--brand) 18%, transparent)',
        transition: 'background 120ms var(--ease-out)',
      }"
    >
      <Icon :name="active.icon" class="w-3.5 h-3.5" />
      <span>{{ active.label }}</span>
      <Icon name="lucide:chevron-down" class="w-3 h-3" />
    </button>

    <div
      v-if="open"
      class="absolute z-50"
      :style="{
        bottom: 'calc(100% + 6px)',
        left: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-lg)',
        padding: '6px',
        minWidth: '220px',
      }"
    >
      <div
        :style="{
          fontSize: '10.5px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-3)',
          padding: '6px 10px 4px',
        }"
      >
        Task intent
      </div>
      <button
        v-for="opt in CONTENT_MODES"
        :key="opt.value"
        type="button"
        @click="select(opt.value)"
        class="w-full flex items-center gap-2.5 text-left"
        :style="optStyle(opt.value)"
        @mouseenter="hover($event, opt.value, true)"
        @mouseleave="hover($event, opt.value, false)"
      >
        <span
          class="flex items-center justify-center flex-shrink-0"
          :style="{
            width: '22px', height: '22px', borderRadius: '5px',
            background: `color-mix(in srgb, ${opt.accent} 14%, transparent)`,
            color: opt.accent,
          }"
        >
          <Icon :name="opt.icon" class="w-3.5 h-3.5" />
        </span>
        <span class="flex-1">{{ opt.label }}</span>
        <span v-if="opt.value === chatStore.selectedMode" :style="{ color: 'var(--brand)' }">
          <Icon name="lucide:check" class="w-3.5 h-3.5" />
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CONTENT_MODES, type ContentMode } from '~/types/chat'

const chatStore = useChatStore()
const open = ref(false)
const rootRef = ref<HTMLElement>()

const active = computed(() =>
  CONTENT_MODES.find((m) => m.value === chatStore.selectedMode) ?? CONTENT_MODES[4]!
)

function select(v: ContentMode) {
  chatStore.setMode(v)
  open.value = false
}

function optStyle(value: ContentMode) {
  const isActive = value === chatStore.selectedMode
  return {
    padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    background: isActive ? 'var(--brand-tint)' : 'transparent',
    color: 'var(--fg)',
    fontSize: '13px',
    fontWeight: 500,
  }
}

function hover(e: MouseEvent, value: ContentMode, enter: boolean) {
  if (value === chatStore.selectedMode) return
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}

if (import.meta.client) {
  const onDoc = (e: MouseEvent) => {
    if (!rootRef.value) return
    if (!rootRef.value.contains(e.target as Node)) open.value = false
  }
  onMounted(() => document.addEventListener('mousedown', onDoc))
  onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
}
</script>
