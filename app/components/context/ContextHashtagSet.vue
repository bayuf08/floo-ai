<template>
  <div>
    <!-- View mode: chips that copy on click -->
    <template v-if="!editing">
      <div v-if="hashtags.length === 0" :style="{ fontSize: '12px', color: 'var(--fg-3)', fontStyle: 'italic' }">
        No hashtags set yet.
      </div>
      <div v-else class="flex flex-wrap" :style="{ gap: '5px', marginTop: '4px' }">
        <button
          v-for="(h, idx) in hashtags"
          :key="`${h}-${idx}`"
          type="button"
          :title="`Copy ${h}`"
          @click="copyOne(h, idx)"
          :style="chipStyle(idx)"
        >
          <span>{{ h }}</span>
          <Icon
            v-if="copiedIndex === idx"
            name="lucide:check"
            class="w-3 h-3"
            :style="{ marginLeft: '4px', color: 'var(--ft-green)' }"
          />
        </button>
        <button
          v-if="hashtags.length > 0"
          type="button"
          @click="copyAll"
          :title="'Copy all hashtags'"
          :style="{
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--brand)',
            background: 'transparent',
            borderRadius: 'var(--r-pill)',
            border: '1px dashed color-mix(in srgb, var(--brand) 30%, transparent)',
          }"
        >
          {{ copiedAll ? 'Copied' : 'Copy all' }}
        </button>
      </div>
    </template>

    <!-- Edit mode: removable chips + add input -->
    <template v-else>
      <div class="flex flex-wrap" :style="{ gap: '5px', marginTop: '4px', marginBottom: '8px' }">
        <span
          v-for="(h, idx) in hashtags"
          :key="`${h}-${idx}`"
          class="inline-flex items-center"
          :style="{
            gap: '4px',
            padding: '3px 4px 3px 8px',
            fontSize: '11px',
            background: 'var(--bg-2)',
            color: 'var(--fg-2)',
            borderRadius: 'var(--r-pill)',
            fontWeight: 500,
          }"
        >
          <span>{{ h }}</span>
          <button
            type="button"
            :aria-label="`Remove ${h}`"
            @click="removeAt(idx)"
            class="flex items-center justify-center"
            :style="{
              width: '14px',
              height: '14px',
              borderRadius: '999px',
              color: 'var(--fg-3)',
              background: 'transparent',
            }"
            @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--border)')"
            @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'transparent')"
          >
            <Icon name="lucide:x" class="w-2.5 h-2.5" />
          </button>
        </span>
      </div>
      <div class="relative">
        <input
          v-model="draft"
          type="text"
          placeholder="Type and press Enter — # added if missing"
          aria-label="Add hashtag"
          @keydown.enter.prevent="addDraft"
          :style="inputStyle"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useClipboard } from '~/composables/useClipboard'

const props = defineProps<{
  projectId: string
  editing: boolean
}>()

const projectsStore = useProjectsStore()
const rulesStore = useRulesStore()
const { copy } = useClipboard()

const hashtags = computed(() => {
  const p = projectsStore.projects.find((x) => x.id === props.projectId)
  return p?.contextRules?.hashtags ?? []
})

const draft = ref('')
const copiedIndex = ref<number | null>(null)
const copiedAll = ref(false)
let copyIndexTimer: ReturnType<typeof setTimeout> | null = null
let copyAllTimer: ReturnType<typeof setTimeout> | null = null

async function copyOne(text: string, idx: number) {
  await copy(text)
  copiedIndex.value = idx
  if (copyIndexTimer) clearTimeout(copyIndexTimer)
  copyIndexTimer = setTimeout(() => (copiedIndex.value = null), 1200)
}

async function copyAll() {
  await copy(hashtags.value.join(' '))
  copiedAll.value = true
  if (copyAllTimer) clearTimeout(copyAllTimer)
  copyAllTimer = setTimeout(() => (copiedAll.value = false), 1500)
}

function addDraft() {
  let v = draft.value.trim()
  if (!v) return
  if (!v.startsWith('#')) v = `#${v}`
  v = v.replace(/\s+/g, '')
  if (v.length <= 1) return
  if (hashtags.value.includes(v)) {
    draft.value = ''
    return
  }
  rulesStore.updateHashtags(props.projectId, [...hashtags.value, v])
  draft.value = ''
}

function removeAt(idx: number) {
  rulesStore.updateHashtags(
    props.projectId,
    hashtags.value.filter((_, i) => i !== idx)
  )
}

function chipStyle(idx: number) {
  const isCopied = copiedIndex.value === idx
  return {
    padding: '3px 8px',
    fontSize: '11px',
    fontWeight: 500,
    background: isCopied ? 'color-mix(in srgb, var(--ft-green) 14%, transparent)' : 'var(--bg-2)',
    color: isCopied ? 'var(--ft-green)' : 'var(--fg-2)',
    borderRadius: 'var(--r-pill)',
    transition: 'background 120ms var(--ease-out), color 120ms var(--ease-out)',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
  }
}

const inputStyle = {
  width: '100%',
  padding: '6px 10px',
  fontSize: '12px',
  background: 'var(--surface)',
  border: '1px dashed var(--border-strong)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--fg)',
  outline: 'none',
}
</script>
