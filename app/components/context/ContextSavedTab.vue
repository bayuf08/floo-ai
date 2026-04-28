<template>
  <div :style="{ display: 'flex', flexDirection: 'column', gap: '12px' }">
    <p :style="{ fontSize: '11.5px', color: 'var(--fg-3)', fontWeight: 500, lineHeight: 1.4 }">
      Outputs you bookmarked from the chat. Saved cards live alongside the project — they
      stay visible after the chat history rolls over, and Floo treats them as canonical
      brand examples on every reply.
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
        <span
          v-if="isImageRow(row)"
          :style="imageBadgeStyle"
          title="Image output"
        >
          <Icon name="lucide:image" class="w-3 h-3" />
          {{ (row.images?.length ?? 0) }}
        </span>
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

      <!-- ── Image saved card ─────────────────────────────────── -->
      <div
        v-if="isImageRow(row)"
        class="grid"
        :style="{
          gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
          gap: '6px',
          padding: '10px 12px 8px',
        }"
      >
        <a
          v-for="(img, idx) in row.images"
          :key="`${row.id}-img-${idx}`"
          :href="img.url"
          target="_blank"
          rel="noopener"
          :style="thumbStyle"
          :title="`Direction ${idx + 1}`"
        >
          <img
            :src="img.url"
            :alt="`Direction ${idx + 1}`"
            loading="lazy"
            :style="{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }"
          />
        </a>
      </div>

      <!-- ── Text saved card ──────────────────────────────────── -->
      <ol
        v-else
        :style="{
          margin: 0,
          padding: '10px 14px 8px 28px',
          fontFamily: 'var(--font-editorial)',
          fontSize: '12.5px',
          lineHeight: 1.55,
          color: 'var(--fg)',
        }"
      >
        <li
          v-for="(item, idx) in displayedItems(row)"
          :key="idx"
          :style="{ marginBottom: '3px' }"
        >
          {{ item }}
        </li>
        <li
          v-if="(row.items?.length ?? 0) > collapsedItemCap && !expanded[row.id]"
          :style="{
            listStyle: 'none',
            marginLeft: '-14px',
            marginTop: '2px',
            fontSize: '11px',
            color: 'var(--fg-3)',
            fontStyle: 'italic',
          }"
        >
          <button
            type="button"
            @click="expanded[row.id] = true"
            :style="{ background: 'transparent', color: 'var(--brand)', fontWeight: 600 }"
          >
            Show {{ row.items.length - collapsedItemCap }} more →
          </button>
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

interface SavedImage {
  url: string
  prompt?: string
  size?: string
}

interface SavedRow {
  id: string
  label: string | null
  sub: string | null
  accent: string | null
  items: string[]
  saved_at: string
  saver?: { name?: string } | null
  /** 'text' (default) or 'image' — present on rows saved post-image-mode launch. */
  kind?: 'text' | 'image' | null
  /** Populated when kind === 'image'. */
  images?: SavedImage[] | null
}

const { copy } = useClipboard()
const { format } = useRelativeTime()
const toast = useToast()
const chatStore = useChatStore()

const items = ref<SavedRow[]>([])
const loading = ref(false)
const copiedId = ref<string | null>(null)
const expanded = reactive<Record<string, boolean>>({})

/**
 * Cap at 5 items in collapsed view. Anything longer gets a "Show N more"
 * affordance — keeps the panel scannable when the user has bookmarked a
 * 12-hashtag set or a long hook list, without hiding short cards.
 */
const collapsedItemCap = 5

function isImageRow(row: SavedRow): boolean {
  return row.kind === 'image' && Array.isArray(row.images) && row.images.length > 0
}

function displayedItems(row: SavedRow): string[] {
  if (expanded[row.id]) return row.items ?? []
  return (row.items ?? []).slice(0, collapsedItemCap)
}

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
    // Tell other surfaces (the projects-store local mirror, future
    // saved-counts in headers) that the list shifted.
    chatStore.bumpSavedOutputsRefresh()
  } catch (err: any) {
    items.value = previous
    toast.error('Couldn\'t delete saved output', { detail: err?.statusMessage || err?.message })
  }
}

async function onCopyAll(row: SavedRow) {
  const text = isImageRow(row)
    ? (row.images ?? []).map((img) => img.url).join('\n')
    : (row.items ?? []).map((it, i) => `${i + 1}. ${it}`).join('\n')
  await copy(text)
  copiedId.value = row.id
  setTimeout(() => (copiedId.value = null), 1500)
}

onMounted(load)
watch(() => props.projectId, load)

// Auto-refresh when chatStore.saveCard fires from anywhere — keeps this
// panel in sync with the "Save to project" action without a manual reload.
watch(() => chatStore.savedOutputsRefreshKey, load)

// ── Styles ────────────────────────────────────────────────────────────────
const imageBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '1px 6px',
  fontSize: '10px',
  fontWeight: 700,
  borderRadius: 'var(--r-xs)',
  background: 'color-mix(in srgb, var(--ft-amber, #d97706) 12%, transparent)',
  color: 'var(--ft-amber, #d97706)',
}

const thumbStyle = {
  display: 'block',
  position: 'relative' as const,
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  borderRadius: 'var(--r-xs)',
  border: '1px solid var(--border-soft)',
  background: 'var(--surface-2)',
}
</script>
