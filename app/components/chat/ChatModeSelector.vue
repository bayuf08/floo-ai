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
        background: active ? 'var(--brand-tint)' : 'var(--bg-2)',
        color: active ? 'var(--fg)' : 'var(--fg-2)',
        fontWeight: active ? 600 : 500,
        fontSize: '12.5px',
        border: active
          ? '1px solid color-mix(in srgb, var(--brand) 18%, transparent)'
          : '1px solid var(--border-soft)',
        transition: 'background 120ms var(--ease-out)',
      }"
    >
      <Icon :name="active ? active.icon : 'lucide:sparkles'" class="w-3.5 h-3.5" />
      <span>{{ active ? active.label : 'Task intent' }}</span>
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
        minWidth: '300px',
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

      <!-- "No intent" — explicit clear. Always sits at the top so users can
           quickly drop back to free-form without scanning the list. -->
      <button
        type="button"
        @click="selectNone"
        class="w-full flex items-start gap-2.5 text-left"
        :style="noneOptStyle"
        @mouseenter="hoverNone($event, true)"
        @mouseleave="hoverNone($event, false)"
      >
        <span
          class="flex items-center justify-center flex-shrink-0"
          :style="{
            width: '22px', height: '22px', borderRadius: '5px',
            background: 'var(--bg-2)',
            color: 'var(--fg-3)',
            marginTop: '1px',
          }"
        >
          <Icon name="lucide:minus" class="w-3.5 h-3.5" />
        </span>
        <span class="flex-1 min-w-0">
          <span class="block">No intent</span>
          <span
            class="block"
            :style="{
              fontSize: '11.5px',
              fontWeight: 400,
              color: 'var(--fg-3)',
              lineHeight: 1.35,
              marginTop: '1px',
            }"
          >Answer freely — no mode-specific format applied</span>
        </span>
        <span
          v-if="chatStore.selectedMode === undefined"
          :style="{ color: 'var(--brand)', marginTop: '2px' }"
        >
          <Icon name="lucide:check" class="w-3.5 h-3.5" />
        </span>
      </button>

      <!-- Hairline separator between "No intent" and the mode list -->
      <div
        :style="{
          height: '1px',
          background: 'var(--border-soft)',
          margin: '4px 8px',
        }"
      />

      <button
        v-for="opt in CONTENT_MODES"
        :key="opt.value"
        type="button"
        :disabled="opt.comingSoon"
        :aria-disabled="opt.comingSoon || undefined"
        @click="!opt.comingSoon && select(opt.value)"
        class="w-full flex items-start gap-2.5 text-left"
        :style="optStyle(opt.value, opt.comingSoon)"
        @mouseenter="hover($event, opt.value, true, opt.comingSoon)"
        @mouseleave="hover($event, opt.value, false, opt.comingSoon)"
      >
        <span
          class="flex items-center justify-center flex-shrink-0"
          :style="{
            width: '22px', height: '22px', borderRadius: '5px',
            background: `color-mix(in srgb, ${opt.accent} 14%, transparent)`,
            color: opt.accent,
            opacity: opt.comingSoon ? 0.55 : 1,
            marginTop: '1px',
          }"
        >
          <Icon :name="opt.icon" class="w-3.5 h-3.5" />
        </span>
        <span class="flex-1 min-w-0">
          <span class="block">{{ opt.label }}</span>
          <span
            v-if="opt.description"
            class="block"
            :style="{
              fontSize: '11.5px',
              fontWeight: 400,
              color: 'var(--fg-3)',
              lineHeight: 1.35,
              marginTop: '1px',
            }"
          >{{ opt.description }}</span>
        </span>
        <!-- Coming-soon badge -->
        <span
          v-if="opt.comingSoon"
          :style="{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 'var(--r-xs)',
            background: 'var(--bg-2)',
            color: 'var(--fg-3)',
            border: '1px solid var(--border-soft)',
            marginTop: '2px',
          }"
        >Soon</span>
        <span
          v-else-if="opt.value === chatStore.selectedMode"
          :style="{ color: 'var(--brand)', marginTop: '2px' }"
        >
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

/**
 * The currently-selected mode option, or null when the user is in the
 * "No intent" state. Falls through to null if the persisted value is a
 * 'coming soon' mode (legacy state from before those rolled out) — the
 * chip then renders the neutral "Task intent" placeholder.
 */
const active = computed(() => {
  if (!chatStore.selectedMode) return null
  const found = CONTENT_MODES.find((m) => m.value === chatStore.selectedMode)
  if (found && !found.comingSoon) return found
  return null
})

function select(v: ContentMode) {
  chatStore.setMode(v)
  open.value = false
}

function selectNone() {
  chatStore.clearMode()
  open.value = false
}

function optStyle(value: ContentMode, comingSoon?: boolean) {
  const isActive = value === chatStore.selectedMode
  return {
    padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    background: isActive && !comingSoon ? 'var(--brand-tint)' : 'transparent',
    color: comingSoon ? 'var(--fg-3)' : 'var(--fg)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: comingSoon ? 'not-allowed' : 'pointer',
    opacity: comingSoon ? 0.7 : 1,
  }
}

const noneOptStyle = computed(() => {
  const isActive = chatStore.selectedMode === undefined
  return {
    padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    background: isActive ? 'var(--brand-tint)' : 'transparent',
    color: 'var(--fg)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  }
})

function hover(e: MouseEvent, value: ContentMode, enter: boolean, comingSoon?: boolean) {
  if (comingSoon) return
  if (value === chatStore.selectedMode) return
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}

function hoverNone(e: MouseEvent, enter: boolean) {
  if (chatStore.selectedMode === undefined) return // active state already styled
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
