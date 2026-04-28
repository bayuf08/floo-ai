<template>
  <article
    class="relative group"
    :style="{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      transition: 'box-shadow 200ms var(--ease-out)',
    }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    :class="hovered ? 'shadow-floo-md' : 'shadow-floo-xs'"
  >
    <!-- Preview area -->
    <div
      v-if="asset.category === 'image' && asset.previewUrl"
      :style="{
        width: '100%',
        aspectRatio: '16 / 10',
        background: 'var(--surface-2)',
        overflow: 'hidden',
      }"
    >
      <img
        :src="asset.previewUrl"
        :alt="asset.name"
        :style="{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }"
      />
    </div>
    <div
      v-else
      class="flex items-center justify-center"
      :style="{
        width: '100%',
        aspectRatio: '16 / 10',
        background: catStyle.bg,
        color: catStyle.color,
      }"
    >
      <Icon :name="catStyle.icon" class="w-8 h-8" />
    </div>

    <!-- Body -->
    <div :style="{ padding: '10px 12px 12px' }">
      <!-- File name -->
      <div
        class="font-display"
        :style="{
          fontWeight: 600,
          fontSize: '13px',
          color: 'var(--fg)',
          letterSpacing: '-0.005em',
          marginBottom: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }"
        :title="asset.name"
      >
        {{ asset.name }}
      </div>

      <!-- Meta row: extension badge · size · uploaded · extraction state -->
      <div
        class="flex items-center"
        :style="{ gap: '6px', fontSize: '10.5px', color: 'var(--fg-3)', fontWeight: 500, marginBottom: '8px' }"
      >
        <span
          :style="{
            padding: '1px 6px',
            background: 'var(--bg-2)',
            borderRadius: 'var(--r-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontWeight: 700,
            fontSize: '9.5px',
            color: 'var(--fg-2)',
          }"
        >{{ asset.extension }}</span>
        <span>{{ asset.size }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ uploadedRelative }}</span>
        <span
          v-if="extractionPill"
          :style="extractionPill.style"
          :title="extractionPill.title"
        >
          <Icon
            v-if="extractionPill.icon"
            :name="extractionPill.icon"
            class="w-2.5 h-2.5 inline-block"
            :class="extractionPill.spin ? 'extraction-spin' : ''"
            :style="{ marginRight: '3px', verticalAlign: '-1px' }"
          />
          {{ extractionPill.label }}
        </span>

        <!-- Retry affordance — only when extraction has failed and the
             asset id is real (not a pre-persist optimistic placeholder). -->
        <button
          v-if="canRetry"
          type="button"
          @click.prevent="retryExtraction"
          :style="retryBtnStyle"
          :disabled="retrying"
          :title="retrying ? 'Retrying…' : 'Re-run extraction on this file'"
        >
          <Icon
            :name="retrying ? 'lucide:loader-2' : 'lucide:refresh-cw'"
            class="w-2.5 h-2.5 inline-block"
            :class="retrying ? 'extraction-spin' : ''"
            :style="{ marginRight: '3px', verticalAlign: '-1px' }"
          />
          {{ retrying ? 'Retrying' : 'Retry' }}
        </button>
      </div>

      <!-- Description (inline editable) -->
      <input
        v-if="editing"
        ref="descInput"
        v-model="descDraft"
        type="text"
        :placeholder="'Add a note…'"
        :style="descInputStyle"
        @blur="commitDescription"
        @keydown.enter.prevent="commitDescription"
        @keydown.esc.prevent="cancelDescription"
      />
      <button
        v-else
        type="button"
        :aria-label="`Edit description for ${asset.name}`"
        class="w-full text-left"
        :style="descDisplayStyle"
        @click="startEdit"
      >
        <span v-if="asset.description">{{ asset.description }}</span>
        <span v-else :style="{ color: 'var(--fg-3)', fontStyle: 'italic' }">Add a note…</span>
      </button>
    </div>

    <!-- Hover-revealed delete button -->
    <button
      v-show="hovered || deleteOpen"
      type="button"
      :aria-label="`Delete ${asset.name}`"
      class="absolute flex items-center justify-center"
      :style="{
        top: '8px',
        right: '8px',
        width: '24px',
        height: '24px',
        borderRadius: 'var(--r-sm)',
        background: 'rgba(0,0,0,0.55)',
        color: 'white',
        backdropFilter: 'blur(4px)',
        transition: 'background 120ms var(--ease-out)',
      }"
      @click.prevent.stop="deleteOpen = true"
      @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--ft-red)')"
      @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)')"
    >
      <Icon name="lucide:x" class="w-3.5 h-3.5" />
    </button>

    <!-- Delete confirmation -->
    <AppDialog v-model="deleteOpen" title="Delete brand asset?">
      <p :style="{ fontSize: '14px', color: 'var(--fg-2)', lineHeight: 1.55 }">
        Remove
        <strong :style="{ color: 'var(--fg)', fontWeight: 600 }">{{ asset.name }}</strong>
        from this project's brand knowledge? This cannot be undone.
      </p>
      <template #footer="{ close }">
        <button
          type="button"
          @click="close"
          :style="{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--fg-2)',
            borderRadius: 'var(--r-md)',
          }"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="confirmDelete(close)"
          :style="{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            background: 'var(--ft-red)',
            color: 'white',
            borderRadius: 'var(--r-md)',
          }"
        >
          Delete asset
        </button>
      </template>
    </AppDialog>
  </article>
</template>

<script setup lang="ts">
import type { AssetCategory, BrandAsset } from '~/types/project'
import { useRelativeTime } from '~/composables/useRelativeTime'

const props = defineProps<{
  asset: BrandAsset
  projectId: string
}>()

const projectsStore = useProjectsStore()
const { format } = useRelativeTime()

const hovered = ref(false)
const editing = ref(false)
const deleteOpen = ref(false)
const descDraft = ref(props.asset.description)
const descInput = ref<HTMLInputElement | null>(null)

const uploadedRelative = computed(() => `${format(props.asset.uploadedAt)} ago`)

/**
 * Surface the backend extraction pipeline so the user knows whether Floo can
 * actually read the file's content. We surface all four states (pending,
 * done, error, skipped) — knowing "Ready" is on file is reassuring, and the
 * absent "no pill" state previously made it look like Floo had ignored the
 * upload.
 *
 * `skipped` covers categories that the extractor never tries (image/video).
 */
const extractionPill = computed(() => {
  const status = props.asset.extractionStatus
  if (status === 'pending') {
    return {
      label: 'Extracting text…',
      icon: 'lucide:loader-2',
      spin: true,
      title: 'Floo is reading this file. The content will be available on your next message.',
      style: pillStyle('var(--ft-amber-deep)', 'var(--cta-tint)'),
    }
  }
  if (status === 'error') {
    return {
      label: "Couldn't read",
      icon: 'lucide:alert-triangle',
      spin: false,
      title:
        "Floo couldn't extract text from this file. Click Retry to try again, or re-upload.",
      style: pillStyle('var(--ft-red)', 'color-mix(in srgb, var(--ft-red) 12%, transparent)'),
    }
  }
  if (status === 'done') {
    return {
      label: 'Ready for AI',
      icon: 'lucide:check-circle-2',
      spin: false,
      title: 'Floo has indexed this file and will reference it on every message.',
      style: pillStyle(
        'var(--ft-green, #059669)',
        'color-mix(in srgb, var(--ft-green, #059669) 12%, transparent)'
      ),
    }
  }
  if (status === 'skipped') {
    return {
      label: 'Visual asset',
      icon: 'lucide:image',
      spin: false,
      title: 'Image and video files are referenced by name and category — no text extraction.',
      style: pillStyle('var(--fg-2)', 'var(--bg-2)'),
    }
  }
  return null
})

/** Retry button only shows on errored, persisted (non-temp) assets. */
const canRetry = computed(
  () =>
    props.asset.extractionStatus === 'error' &&
    !props.asset.id.startsWith('asset-') &&
    !props.projectId.startsWith('proj-pending-') &&
    !projectsStore.usingMocks
)

const retrying = ref(false)

async function retryExtraction() {
  if (!canRetry.value || retrying.value) return
  retrying.value = true
  try {
    await $fetch(
      `/api/projects/${props.projectId}/assets/${props.asset.id}/extract`,
      { method: 'POST', credentials: 'include' }
    )
    // Pull the updated row so the pill flips to "Extracting…" or "Ready".
    await projectsStore.refreshBrandAssets(props.projectId)
  } catch (err: any) {
    useToast().error('Retry failed', { detail: err?.statusMessage || err?.message })
  } finally {
    retrying.value = false
  }
}

const retryBtnStyle = {
  marginLeft: '4px',
  padding: '1px 6px',
  fontSize: '9.5px',
  fontWeight: 700,
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
  color: 'var(--brand)',
  background: 'var(--brand-tint)',
  borderRadius: 'var(--r-xs)',
  lineHeight: 1.4,
  display: 'inline-flex',
  alignItems: 'center',
  cursor: 'pointer',
}

function pillStyle(fg: string, bg: string) {
  return {
    marginLeft: 'auto',
    padding: '1px 6px',
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
    color: fg,
    background: bg,
    borderRadius: 'var(--r-xs)',
    lineHeight: 1.4,
    display: 'inline-flex',
    alignItems: 'center',
  }
}

const categoryStyle: Record<
  AssetCategory,
  { icon: string; bg: string; color: string }
> = {
  image: { icon: 'lucide:image', bg: 'var(--brand-tint)', color: 'var(--brand)' },
  document: { icon: 'lucide:file-text', bg: 'var(--brand-tint)', color: 'var(--brand)' },
  presentation: {
    icon: 'lucide:presentation',
    bg: 'color-mix(in srgb, #E85D5D 12%, transparent)',
    color: '#E85D5D',
  },
  spreadsheet: {
    icon: 'lucide:table',
    bg: 'color-mix(in srgb, #4DAF4E 12%, transparent)',
    color: '#4DAF4E',
  },
  video: {
    icon: 'lucide:video',
    bg: 'color-mix(in srgb, #4B70B6 12%, transparent)',
    color: '#4B70B6',
  },
  other: { icon: 'lucide:file', bg: 'var(--surface-2)', color: 'var(--fg-3)' },
}

const catStyle = computed(() => categoryStyle[props.asset.category])

const descDisplayStyle = {
  width: '100%',
  fontSize: '12px',
  fontFamily: 'var(--font-editorial)',
  color: 'var(--fg-2)',
  lineHeight: 1.5,
  padding: '4px 6px',
  borderRadius: 'var(--r-sm)',
  background: 'transparent',
  cursor: 'text',
  transition: 'background 120ms var(--ease-out)',
  border: '1px solid transparent',
}

const descInputStyle = {
  width: '100%',
  fontSize: '12px',
  fontFamily: 'var(--font-editorial)',
  color: 'var(--fg)',
  lineHeight: 1.5,
  padding: '4px 6px',
  borderRadius: 'var(--r-sm)',
  background: 'var(--surface)',
  border: '1px solid var(--brand)',
  outline: 'none',
}

function startEdit() {
  descDraft.value = props.asset.description
  editing.value = true
  nextTick(() => descInput.value?.focus())
}

function commitDescription() {
  if (!editing.value) return
  const next = descDraft.value.trim()
  projectsStore.updateAssetDescription(props.projectId, props.asset.id, next)
  editing.value = false
  // Mirror to backend when not in mock mode and asset id looks like a real UUID
  if (!projectsStore.usingMocks && !props.asset.id.startsWith('asset-') && !props.projectId.startsWith('proj-pending-')) {
    $fetch(`/api/projects/${props.projectId}/assets/${props.asset.id}`, {
      method: 'PATCH',
      credentials: 'include',
      body: { description: next },
    }).catch((err: any) => {
      useToast().error('Couldn\'t save the description', { detail: err?.message })
    })
  }
}

function cancelDescription() {
  descDraft.value = props.asset.description
  editing.value = false
}

function confirmDelete(close: () => void) {
  projectsStore.removeBrandAsset(props.projectId, props.asset.id)
  close()
  if (!projectsStore.usingMocks && !props.asset.id.startsWith('asset-') && !props.projectId.startsWith('proj-pending-')) {
    $fetch(`/api/projects/${props.projectId}/assets/${props.asset.id}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch((err: any) => {
      useToast().error('Couldn\'t delete the asset on the server', { detail: err?.message })
    })
  }
}
</script>

<style>
/* Spin the loader-2 icon used in the Extracting / Retrying pills.
   Non-scoped on purpose — the <Icon> component renders an <svg> child, and
   scoped styles don't reach into nested components without :deep(), which
   reads worse than this prefixed global rule. */
.extraction-spin {
  animation: floo-extract-spin 1s linear infinite;
  transform-origin: 50% 50%;
}
@keyframes floo-extract-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
