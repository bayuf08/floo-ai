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
  let toUpload = 0

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

    projectsStore.addBrandAsset(props.projectId, file, previewUrl)
    added++

    if (!projectsStore.usingMocks && isPersistedProject) {
      formData.append('file', file)
      toUpload++
    }
  }

  // Fire-and-forget backend upload — toast on failure, success flash on success.
  if (toUpload > 0) {
    try {
      const res = await $fetch<{ assets: any[]; warnings: string[] }>(
        `/api/projects/${props.projectId}/assets`,
        { method: 'POST', credentials: 'include', body: formData as any }
      )
      if (res.warnings?.length) warnings.value = [...warnings.value, ...res.warnings]
      // Replace the optimistic local rows with server rows so the asset card
      // picks up the real id + extraction_status (pending / done / error).
      await projectsStore.refreshBrandAssets(props.projectId)
    } catch (err: any) {
      console.warn('[ContextAssetUploader] upload failed', err)
      useToast().error('Brand asset upload failed', { detail: err?.message })
    }
  }

  if (added > 0) {
    recentlyAdded.value = added
    if (recentlyAddedTimer) clearTimeout(recentlyAddedTimer)
    recentlyAddedTimer = setTimeout(() => (recentlyAdded.value = 0), 2200)
  }
}
</script>
