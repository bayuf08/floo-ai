<template>
  <div
    :style="{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
      marginBottom: '14px',
      boxShadow: 'var(--shadow-xs)',
      transition: 'box-shadow 200ms var(--ease-out), transform 200ms var(--ease-out)',
    }"
  >
    <!-- Card head -->
    <div
      class="flex items-center gap-2.5"
      :style="{
        padding: '14px 18px 12px',
        borderBottom: '1px solid var(--border-soft)',
      }"
    >
      <span :style="{ width: '3px', height: '16px', borderRadius: '2px', background: accentColor }" />
      <span
        :style="{
          fontWeight: 700,
          fontSize: '11px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--fg)',
        }"
      >{{ label }}</span>
      <span
        v-if="sub"
        :style="{ fontSize: '11px', color: 'var(--fg-3)', marginLeft: '6px' }"
      >· {{ sub }}</span>

      <!-- ... menu trigger -->
      <div class="relative ml-auto" :style="{ color: 'var(--fg-3)' }">
        <button
          type="button"
          aria-label="Output card options"
          @click="cardMenuOpen = !cardMenuOpen"
          :style="{ color: 'inherit', display: 'flex' }"
        >
          <Icon name="lucide:more-horizontal" class="w-3.5 h-3.5" />
        </button>
        <OutputCardMenu
          v-if="cardMenuOpen"
          :saved-flash="savedFlash"
          @close="cardMenuOpen = false"
          @select="onMenuSelect"
        />
      </div>
    </div>

    <!-- Card body -->
    <div :style="{ padding: '16px 18px 14px' }">
      <ol
        :style="{
          margin: 0,
          padding: '0 0 0 18px',
          fontFamily: 'var(--font-editorial)',
          fontSize: '14px',
          color: 'var(--fg)',
          lineHeight: 1.7,
        }"
      >
        <li v-for="(item, idx) in card.items" :key="idx" :style="{ marginBottom: '4px' }">
          {{ item }}
        </li>
      </ol>
    </div>

    <!-- Card foot -->
    <div
      class="flex items-center"
      :style="{
        padding: '10px 14px 10px 18px',
        borderTop: '1px solid var(--border-soft)',
        background: 'var(--surface-2)',
        gap: '6px',
      }"
    >
      <button
        v-if="card.canCopy"
        type="button"
        @click="onCopy"
        class="inline-flex items-center gap-1.5"
        :style="footBtnStyle"
        @mouseenter="hoverBtn($event, true)"
        @mouseleave="hoverBtn($event, false)"
      >
        <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="w-3.5 h-3.5" />
        <span>{{ copied ? 'Copied' : 'Copy all' }}</span>
      </button>
      <button
        type="button"
        @click="onMore"
        class="inline-flex items-center gap-1.5"
        :style="footBtnStyle"
        @mouseenter="hoverBtn($event, true)"
        @mouseleave="hoverBtn($event, false)"
      >
        <Icon name="lucide:refresh-cw" class="w-3.5 h-3.5" />
        <span>More</span>
      </button>
      <span
        v-if="savedFlash"
        :style="{ marginLeft: 'auto', fontSize: '11px', color: 'var(--ft-green)', fontWeight: 700 }"
      >Saved ✓</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OutputCard } from '~/types/chat'
import { useClipboard } from '~/composables/useClipboard'

const props = defineProps<{
  card: OutputCard & { label?: string; sub?: string; accent?: string }
  /** Parent message id — required so "Save to project" can call the backend save endpoint. */
  messageId?: string
}>()

const { copied, copy } = useClipboard()
const projectsStore = useProjectsStore()
const chatStore = useChatStore()

const cardMenuOpen = ref(false)
const savedFlash = ref(false)

const label = computed(() => props.card.label ?? 'Hooks')
const sub = computed(() => props.card.sub ?? `${props.card.items.length} opening lines`)
const accentColor = computed(() => props.card.accent ?? 'var(--brand)')

const footBtnStyle = {
  padding: '6px 10px',
  borderRadius: 'var(--r-sm)',
  color: 'var(--fg-2)',
  fontSize: '12px',
  fontWeight: 600,
  transition: 'background 120ms var(--ease-out), color 120ms var(--ease-out)',
}

function hoverBtn(e: MouseEvent, enter: boolean) {
  const el = e.currentTarget as HTMLElement
  el.style.background = enter ? 'var(--bg-2)' : 'transparent'
  el.style.color = enter ? 'var(--fg)' : 'var(--fg-2)'
}

async function onCopy() {
  const text = props.card.items.map((item, i) => `${i + 1}. ${item}`).join('\n')
  await copy(text)
}

function onMore() {
  if (!projectsStore.activeProjectId) return
  chatStore.requestMore(label.value, projectsStore.activeProjectId)
}

function onMenuSelect(key: 'copy' | 'regenerate' | 'save' | 'report') {
  switch (key) {
    case 'copy':
      onCopy()
      break
    case 'regenerate':
      cardMenuOpen.value = false
      onMore()
      break
    case 'save':
      if (!projectsStore.activeProjectId) return
      // Local mirror — instant UI feedback even before the backend round-trip.
      projectsStore.saveOutput(projectsStore.activeProjectId, {
        label: props.card.label,
        sub: props.card.sub,
        accent: props.card.accent,
        items: props.card.items,
      })
      // Persist to the backend if we have the parent message id.
      if (props.messageId) {
        chatStore.saveCard(projectsStore.activeProjectId, props.messageId, props.card.id)
      }
      // Toast with a "View saved" action — opens the Saved tab in the right panel.
      useToast().success('Saved to project', { detail: 'Open the Saved tab in the right panel to view it.' })
      const ui = useUiStore()
      ui.rightPanelOpen = true
      ;(ui as unknown as { activeContextTab: string }).activeContextTab = 'saved'
      savedFlash.value = true
      setTimeout(() => {
        savedFlash.value = false
        cardMenuOpen.value = false
      }, 2000)
      break
    case 'report':
      cardMenuOpen.value = false
      // Frontend stub — would surface a toast in the future
      console.log('[ChatOutputCard] Report logged — thanks for the feedback')
      break
  }
}
</script>
