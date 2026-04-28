<template>
  <div :style="{ marginBottom: warnings.length ? '8px' : '0' }">
    <!-- Drop zone -->
    <div
      ref="zoneRef"
      class="flex flex-col items-center justify-center text-center"
      :style="zoneStyle"
      @click="openPicker"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      role="button"
      tabindex="0"
      :aria-label="'Upload brand assets — click to browse or drop files here'"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
    >
      <span
        class="flex items-center justify-center"
        :style="{
          width: '36px',
          height: '36px',
          borderRadius: 'var(--r-md)',
          background: isDragging ? 'var(--brand)' : 'var(--brand-tint)',
          color: isDragging ? 'white' : 'var(--brand)',
          marginBottom: '8px',
          transition: 'background 120ms var(--ease-out)',
        }"
      >
        <Icon name="lucide:upload-cloud" class="w-4.5 h-4.5" />
      </span>
      <p
        :style="{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--fg)',
          marginBottom: '2px',
        }"
      >
        <template v-if="isDragging">Drop to add to brand knowledge</template>
        <template v-else>
          <span :style="{ color: 'var(--brand)' }">Click to browse</span>
          <span :style="{ color: 'var(--fg-2)' }"> or drag files here</span>
        </template>
      </p>
      <p :style="{ fontSize: '11px', color: 'var(--fg-3)' }">
        PDF, DOCX, PPTX, XLSX, CSV, JPG, PNG, MP4, and more
      </p>

      <!-- Recently-added flash -->
      <Transition name="fade">
        <p
          v-if="recentlyAdded > 0"
          :style="{
            marginTop: '8px',
            fontSize: '11.5px',
            color: 'var(--ft-green)',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }"
        >
          <Icon name="lucide:check" class="w-3 h-3" />
          Added {{ recentlyAdded }} {{ recentlyAdded === 1 ? 'file' : 'files' }}
        </p>
      </Transition>

      <!-- Hidden picker -->
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="*"
        class="hidden"
        @change="onPickerChange"
      />
    </div>

    <!-- Size warnings -->
    <div v-if="warnings.length" :style="{ marginTop: '8px' }">
      <p
        v-for="(w, i) in warnings"
        :key="i"
        class="flex items-start gap-1.5"
        :style="{
          fontSize: '11.5px',
          color: 'var(--ft-amber-deep)',
          background: 'var(--cta-tint)',
          padding: '6px 10px',
          borderRadius: 'var(--r-sm)',
          marginBottom: '4px',
          lineHeight: 1.4,
        }"
      >
        <Icon name="lucide:alert-triangle" class="w-3 h-3 flex-shrink-0 mt-0.5" />
        <span>{{ w }}</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getAssetCategory } from '~/types/project'

const props = defineProps<{
  projectId: string
}>()

defineExpose({
  /** Programmatically open the OS file picker — used by the empty-state CTA. */
  openPicker: () => openPicker(),
})

const projectsStore = useProjectsStore()

const zoneRef = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const isDragging = ref(false)
const recentlyAdded = ref(0)
const warnings = ref<string[]>([])

const SIZE_LIMIT = 50 * 1024 * 1024 // 50 MB

const zoneStyle = computed(() => ({
  padding: '20px 16px',
  borderRadius: 'var(--r-md)',
  border: isDragging.value ? '2px solid var(--brand)' : '2px dashed var(--border-strong)',
  background: isDragging.value ? 'var(--brand-tint)' : 'var(--surface-2)',
  cursor: 'pointer',
  transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
}))

let dragCounter = 0
let recentlyAddedTimer: ReturnType<typeof setTimeout> | null = null

function openPicker() {
  fileInput.value?.click()
}

function onPickerChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files?.length) return
  processFiles(Array.from(target.files))
  // Reset so picking the same file twice still works
  target.value = ''
}

function onDragEnter() {
  dragCounter++
  isDragging.value = true
}

function onDragOver() {
  // preventDefault is in template; this just keeps the cursor in the right state
  isDragging.value = true
}

function onDragLeave() {
  dragCounter = Math.max(0, dragCounter - 1)
  if (dragCounter === 0) isDragging.value = false
}

function onDrop(e: DragEvent) {
  dragCounter = 0
  isDragging.value = false
  const dt = e.dataTransfer
  if (!dt?.files?.length) return
  processFiles(Array.from(dt.files))
}

async function processFiles(files: File[]) {
  warnings.value = []
  let added = 0
  const isPersistedProject = !props.projectId.startsWith('proj-pending-')

  // Optimistic local insert (so the user sees the asset immediately) + parallel
  // backend upload when not in mock mode and the project actually exists in the DB.
  const formData = new FormData()
  // Track the optimistic file metadata + the temp id we got back from
  // addBrandAsset so we can either RECONCILE on success (swap temp →
  // persisted row) or ROLL BACK on failure (remove the orphan card).
  const pendingUploads: Array<{ tempId: string; name: string; sizeBytes: number }> = []

  for (const file of files) {
    if (file.size > SIZE_LIMIT) {
      warnings.value.push(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — over the 50 MB limit. Added anyway.`
      )
    }

    let previewUrl: string | undefined
    if (getAssetCategory(file.name) === 'image') {
      try {
        previewUrl = URL.createObjectURL(file)
      } catch (err) {
        console.warn('[ContextAssetUploader] failed to create preview URL', err)
      }
    }

    const tempId = projectsStore.addBrandAsset(props.projectId, file, previewUrl)
    added++

    if (!projectsStore.usingMocks && isPersistedProject && tempId) {
      formData.append('file', file)
      pendingUploads.push({ tempId, name: file.name, sizeBytes: file.size })
    }
  }

  // Backend upload — reconcile each optimistic entry with the persisted row
  // so we get the real id + extraction_status. Toast on failure.
  if (pendingUploads.length > 0) {
    try {
      const res = await $fetch<{ assets: any[]; warnings: string[] }>(
        `/api/projects/${props.projectId}/assets`,
        { method: 'POST', credentials: 'include', body: formData as any }
      )
      if (res.warnings?.length) warnings.value = [...warnings.value, ...res.warnings]

      // Reconcile: every server row that matches a pending upload swaps
      // its temp id for the real one + persisted metadata.
      const reconciledTempIds = new Set<string>()
      for (const row of res.assets ?? []) {
        const match = pendingUploads.find(
          (u) => u.name === row.name && u.sizeBytes === row.size_bytes,
        )
        if (match) {
          projectsStore.reconcileBrandAsset(props.projectId, match.name, match.sizeBytes, row)
          reconciledTempIds.add(match.tempId)
        }
      }

      // Roll back any optimistic entry the server didn't return — the
      // upload failed (likely a per-file warning was emitted, e.g.
      // "Bucket not found" or "DB insert failed"). Leaving these in
      // local state would mislead the user — the file isn't actually
      // saved and disappears on the next refresh.
      const orphans = pendingUploads.filter((u) => !reconciledTempIds.has(u.tempId))
      for (const orphan of orphans) {
        projectsStore.removeBrandAsset(props.projectId, orphan.tempId)
        added = Math.max(0, added - 1)
      }
      if (orphans.length > 0) {
        const detail = res.warnings?.length
          ? res.warnings.join('\n')
          : `${orphans.length} file${orphans.length === 1 ? '' : 's'} couldn't be saved.`
        useToast().error("Some uploads didn't save", { detail })
      }
    } catch (err: any) {
      console.warn('[ContextAssetUploader] upload failed', err)
      // Whole request failed (network, 5xx, auth, etc) — roll back
      // every optimistic entry so the UI matches reality.
      for (const pending of pendingUploads) {
        projectsStore.removeBrandAsset(props.projectId, pending.tempId)
      }
      added = Math.max(0, added - pendingUploads.length)
      useToast().error('Brand asset upload failed', {
        detail: err?.statusMessage || err?.message || 'Unknown error',
      })
    }
  }

  if (added > 0) {
    recentlyAdded.value = added
    if (recentlyAddedTimer) clearTimeout(recentlyAddedTimer)
    recentlyAddedTimer = setTimeout(() => (recentlyAdded.value = 0), 2200)
  }
}
</script>
