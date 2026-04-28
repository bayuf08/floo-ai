<template>
  <div :style="{ display: 'flex', flexDirection: 'column', gap: '12px' }">
    <p :style="{ fontSize: '11.5px', color: 'var(--fg-3)', fontWeight: 500, lineHeight: 1.4 }">
      Outputs you bookmarked from the chat. Saved cards live alongside the project — they
      stay visible after the chat history rolls over.
    </p>

    <!-- Loading -->
    <p v-if="loading" :style="{ fontSize: '12.5px', color: 'var(--fg-3)', fontStyle: 'italic' }">
      Loading saved outputs…
    </p>

    <!-- Empty -->
    <div v-else-if="items.length === 0" :style="{ padding: '16px 0', textAlign: 'center' }">
      <Icon
        name="lucide:bookmark"
        class="w-6 h-6"
        :style="{ color: 'var(--fg-3)', margin: '0 auto 8px' }"
      />
      <p :style="{ fontSize: '12.5px', color: 'var(--fg-3)', lineHeight: 1.5 }">
        Nothing saved yet. Open the <strong>···</strong> menu on any AI output card and pick
        <strong>Save to project</strong>.
      </p>
    </div>

    <!-- List -->
    <article
      v-for="row in items"
      :key="row.id"
      :style="{
        background: 'var(--surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }"
    >
      <header
        class="flex items-center gap-2"
        :style="{
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--border-soft)',
        }"
      >
        <span :style="{ width: '3px', height: '12px', background: row.accent || 'var(--brand)', borderRadius: '2px' }" />
        <span
          :style="{
            fontWeight: 700,
            fontSize: '10.5px',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--fg)',
          }"
        >{{ row.label || 'Output' }}</span>
        <span v-if="row.sub" :style="{ fontSize: '10.5px', color: 'var(--fg-3)' }">· {{ row.sub }}</span>
        <button
          type="button"
          :aria-label="`Delete saved ${row.label}`"
          :style="{
            marginLeft: 'auto',
            padding: '2px 4px',
            color: 'var(--fg-3)',
            borderRadius: 'var(--r-xs)',
          }"
          @click="onDelete(row.id)"
          @mouseenter="(($event.currentTarget as HTMLElement).style.color = 'var(--ft-red)')"
          @mouseleave="(($event.currentTarget as HTMLElement).style.color = 'var(--fg-3)')"
        >
          <Icon name="lucide:trash-2" class="w-3 h-3" />
        </button>
      </header>

      <ol
        :style="{
          margin: 0,
          padding: '10px 14px 8px 28px',
          fontFamily: 'var(--font-editorial)',
          fontSize: '12.5px',
          lineHeight: 1.55,
          color: 'var(--fg)',
        }"
      >
        <li v-for="(item, idx) in row.items" :key="idx" :style="{ marginBottom: '3px' }">
          {{ item }}
        </li>
      </ol>

      <footer
        class="flex items-center justify-between"
        :style="{
          padding: '8px 12px',
          borderTop: '1px solid var(--border-soft)',
          background: 'var(--surface-2)',
          fontSize: '10.5px',
          color: 'var(--fg-3)',
          fontWeight: 500,
        }"
      >
        <span>Saved {{ format(new Date(row.saved_at)) }} ago</span>
        <button
          type="button"
          @click="onCopyAll(row)"
          :style="{
            padding: '4px 8px',
            fontSize: '10.5px',
            fontWeight: 600,
            color: 'var(--fg-2)',
            background: 'transparent',
            borderRadius: 'var(--r-xs)',
          }"
        >
          {{ copiedId === row.id ? 'Copied' : 'Copy' }}
        </button>
      </footer>
    </article>
  </div>
</template>

<script setup lang="ts">
import { useClipboard } from '~/composables/useClipboard'
import { useRelativeTime } from '~/composables/useRelativeTime'

const props = defineProps<{
  projectId: string
}>()

interface SavedRow {
  id: string
  label: string | null
  sub: string | null
  accent: string | null
  items: string[]
  saved_at: string
  saver?: { name?: string } | null
}

const { copy } = useClipboard()
const { format } = useRelativeTime()
const toast = useToast()

const items = ref<SavedRow[]>([])
const loading = ref(false)
const copiedId = ref<string | null>(null)

async function load() {
  if (props.projectId.startsWith('proj-pending-')) {
    items.value = []
    return
  }
  loading.value = true
  try {
    const rows = await $fetch<SavedRow[]>(`/api/projects/${props.projectId}/saved`, {
      credentials: 'include',
    })
    items.value = rows ?? []
  } catch (err: any) {
    // Silent in mock mode (404/500 expected before backend is configured)
    items.value = []
    console.warn('[ContextSavedTab] load failed', err)
  } finally {
    loading.value = false
  }
}

async function onDelete(id: string) {
  // Optimistic
  const previous = items.value
  items.value = items.value.filter((r) => r.id !== id)
  try {
    await $fetch(`/api/projects/${props.projectId}/saved/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  } catch (err: any) {
    items.value = previous
    toast.error('Couldn\'t delete saved output', { detail: err?.statusMessage || err?.message })
  }
}

async function onCopyAll(row: SavedRow) {
  await copy(row.items.map((it, i) => `${i + 1}. ${it}`).join('\n'))
  copiedId.value = row.id
  setTimeout(() => (copiedId.value = null), 1500)
}

onMounted(load)
watch(() => props.projectId, load)
</script>
