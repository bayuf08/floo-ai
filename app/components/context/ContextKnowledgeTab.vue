<template>
  <div class="flex flex-col" :style="{ gap: '14px' }">
    <!-- Description -->
    <div class="flex items-center justify-between" :style="{ marginBottom: '-4px' }">
      <span :style="{ fontSize: '11.5px', color: 'var(--fg-3)', fontWeight: 500, lineHeight: 1.4 }">
        Permanent files Floo references on every message in this project.
      </span>
    </div>

    <!-- Uploader (always visible at top) -->
    <ContextAssetUploader
      ref="uploaderRef"
      :project-id="projectId"
    />

    <!-- Search + filter bar (only when assets exist) -->
    <div v-if="assets.length > 0" :style="{ display: 'flex', flexDirection: 'column', gap: '8px' }">
      <!-- Search input -->
      <div class="relative">
        <Icon
          name="lucide:search"
          class="absolute"
          :style="{
            top: '50%',
            left: '8px',
            transform: 'translateY(-50%)',
            color: 'var(--fg-3)',
            width: '13px',
            height: '13px',
          }"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search files…"
          aria-label="Search brand assets"
          :style="{
            width: '100%',
            padding: '6px 10px 6px 26px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            fontSize: '12.5px',
            color: 'var(--fg)',
            outline: 'none',
          }"
        />
      </div>

      <!-- Category chips -->
      <div :style="{ display: 'flex', flexWrap: 'wrap', gap: '4px' }">
        <button
          v-for="c in categoryFilters"
          :key="c.value"
          type="button"
          @click="activeCategory = c.value"
          :aria-pressed="activeCategory === c.value"
          :style="chipStyle(c.value)"
          @mouseenter="hoverChip($event, c.value, true)"
          @mouseleave="hoverChip($event, c.value, false)"
        >
          {{ c.label }}
          <span
            v-if="c.value !== 'all'"
            :style="{
              marginLeft: '4px',
              fontSize: '10px',
              color: 'inherit',
              opacity: 0.7,
            }"
          >
            {{ countByCategory(c.value) }}
          </span>
        </button>
      </div>
    </div>

    <!-- Asset list -->
    <div v-if="filteredAssets.length > 0" :style="{ display: 'flex', flexDirection: 'column', gap: '10px' }">
      <ContextAssetCard
        v-for="asset in filteredAssets"
        :key="asset.id"
        :asset="asset"
        :project-id="projectId"
      />
    </div>

    <!-- No matches (filters active, but list is empty) -->
    <div
      v-else-if="assets.length > 0"
      class="text-center"
      :style="{
        padding: '20px 12px',
        fontSize: '12.5px',
        color: 'var(--fg-3)',
        fontStyle: 'italic',
      }"
    >
      No assets match these filters.
      <button
        type="button"
        :style="{ color: 'var(--brand)', fontWeight: 600, fontStyle: 'normal', marginLeft: '4px' }"
        @click="clearFilters"
      >
        Clear
      </button>
    </div>

    <!-- Empty state -->
    <div v-else :style="{ padding: '8px 0 4px' }">
      <AppEmptyState
        title="No brand assets yet"
        description="Upload moodboards, briefs, style guides, or any files that define this project's creative direction. Floo will use them as context on every message."
      >
        <template #graphic>
          <FtComposition :size="100" />
        </template>
        <button
          type="button"
          @click="uploaderRef?.openPicker()"
          :style="{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 700,
            background: 'var(--cta)',
            color: 'var(--cta-fg)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-xs)',
          }"
        >
          Upload files
        </button>
      </AppEmptyState>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssetCategory } from '~/types/project'

const props = defineProps<{
  projectId: string
}>()

const projectsStore = useProjectsStore()
const uploaderRef = ref<{ openPicker: () => void } | null>(null)

const searchQuery = ref('')
type CategoryFilter = AssetCategory | 'all'
const activeCategory = ref<CategoryFilter>('all')

const assets = computed(() => {
  const project = projectsStore.projects.find((p) => p.id === props.projectId)
  return project?.contextRules?.brandAssets ?? []
})

const categoryFilters: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'document', label: 'Docs' },
  { value: 'presentation', label: 'Decks' },
  { value: 'spreadsheet', label: 'Sheets' },
]

function countByCategory(c: CategoryFilter): number {
  if (c === 'all') return assets.value.length
  return assets.value.filter((a) => a.category === c).length
}

const filteredAssets = computed(() => {
  let list = assets.value
  if (activeCategory.value !== 'all') {
    list = list.filter((a) => a.category === activeCategory.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    )
  }
  return list
})

function clearFilters() {
  searchQuery.value = ''
  activeCategory.value = 'all'
}

function chipStyle(value: CategoryFilter) {
  const active = value === activeCategory.value
  return {
    padding: '4px 10px',
    fontSize: '11.5px',
    fontWeight: 600,
    borderRadius: 'var(--r-pill)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
    background: active ? 'var(--brand-tint)' : 'var(--surface)',
    color: active ? 'var(--brand)' : 'var(--fg-2)',
    transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
    cursor: 'pointer',
  }
}

function hoverChip(e: MouseEvent, value: CategoryFilter, enter: boolean) {
  if (value === activeCategory.value) return
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'var(--surface)'
}

/**
 * Pending-extraction poller.
 *
 * When any asset on this project is in `pending` state, refetch the asset
 * list every 5 seconds. Stops as soon as the pending set drains (Floo's
 * extractor flips rows to `done` or `error` synchronously on each fetch).
 *
 * We use a watcher rather than a permanent setInterval so the poller is
 * naturally bounded — it lives only while the Knowledge tab is mounted
 * AND there's something pending.
 */
const POLL_INTERVAL_MS = 5_000

const hasPending = computed(() =>
  assets.value.some((a) => a.extractionStatus === 'pending')
)

let pollHandle: ReturnType<typeof setInterval> | null = null

function startPolling() {
  if (pollHandle) return
  pollHandle = setInterval(() => {
    projectsStore.refreshBrandAssets(props.projectId).catch(() => {/* logged in store */})
  }, POLL_INTERVAL_MS)
}

function stopPolling() {
  if (!pollHandle) return
  clearInterval(pollHandle)
  pollHandle = null
}

watch(
  hasPending,
  (pending) => {
    if (pending) startPolling()
    else stopPolling()
  },
  { immediate: true }
)

watch(() => props.projectId, () => {
  // Switching projects → drop any in-flight poll; the new project's
  // hasPending watcher will re-arm if the new asset list has pending rows.
  stopPolling()
})

onBeforeUnmount(stopPolling)
</script>
