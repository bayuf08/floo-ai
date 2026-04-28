<template>
  <AppDialog v-model="open" title="Create new project">
    <form @submit.prevent="onSubmit" class="space-y-4">
      <!-- Title -->
      <div>
        <label for="np-title" class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
          Project name
        </label>
        <input
          id="np-title"
          v-model="form.name"
          type="text"
          required
          placeholder="e.g. Summer drop teaser"
          class="w-full px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition"
        />
      </div>

      <!-- Platform -->
      <div>
        <label class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
          Primary platform
        </label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="p in platforms"
            :key="p.value"
            type="button"
            @click="form.platform = p.value"
            class="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-floo-md border transition-colors"
            :class="form.platform === p.value
              ? 'border-floo-brand bg-floo-brand-tint text-floo-brand'
              : 'border-floo-border text-floo-text-secondary hover:border-floo-border-strong hover:bg-floo-surface-hover'"
          >
            <Icon :name="p.icon" class="w-3.5 h-3.5" />
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- Description (optional) -->
      <div>
        <label for="np-desc" class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
          Brief description
          <span class="text-floo-text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="np-desc"
          v-model="form.description"
          rows="3"
          placeholder="A short note on the project's voice or goal — Floo will use this as a starting brand voice."
          class="w-full px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition resize-none"
        />
      </div>
    </form>

    <template #footer="{ close }">
      <button
        type="button"
        @click="close"
        class="px-4 py-2 text-sm font-medium text-floo-text-secondary hover:bg-floo-surface-hover rounded-floo-md transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        @click="onSubmit"
        :disabled="!form.name.trim()"
        class="px-4 py-2 text-sm font-medium bg-floo-cta text-floo-cta-fg rounded-floo-md hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Create project
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const projectsStore = useProjectsStore()
const router = useRouter()

const platforms: { value: Platform; label: string; icon: string }[] = [
  { value: 'tiktok', label: 'TikTok', icon: 'simple-icons:tiktok' },
  { value: 'instagram', label: 'Instagram', icon: 'simple-icons:instagram' },
  { value: 'twitter', label: 'X', icon: 'simple-icons:x' },
  { value: 'youtube', label: 'YouTube', icon: 'simple-icons:youtube' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'simple-icons:linkedin' },
  { value: 'threads', label: 'Threads', icon: 'simple-icons:threads' },
]

const form = reactive({
  name: '',
  platform: 'tiktok' as Platform,
  description: '',
})

function reset() {
  form.name = ''
  form.platform = 'tiktok'
  form.description = ''
}

async function onSubmit() {
  if (!form.name.trim()) return
  const id = await projectsStore.createProject({
    name: form.name.trim(),
    platform: form.platform,
    description: form.description.trim() || undefined,
  })
  open.value = false
  reset()
  await router.push(`/projects/${id}`)
}
</script>
