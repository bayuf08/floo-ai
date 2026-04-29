<template>
  <div
    class="sticky bottom-0"
    :style="{ padding: '12px 28px 22px', background: 'linear-gradient(to top, var(--bg) 60%, transparent)' }"
  >
    <div :style="{ maxWidth: '820px', margin: '0 auto' }">
      <!-- Brief chips -->
      <div v-if="attachments.length" class="flex flex-wrap" :style="{ gap: '8px', marginBottom: '10px' }">
        <span
          v-for="(file, idx) in attachments"
          :key="idx"
          class="inline-flex items-center"
          :style="briefChipStyle"
        >
          <span class="flex items-center justify-center" :style="briefIcoStyle">
            <Icon name="lucide:file-text" class="w-3.5 h-3.5" />
          </span>
          <span class="flex flex-col" :style="{ minWidth: 0, flex: 1, gap: '1px' }">
            <span :style="briefNameStyle">{{ file.name }}</span>
            <span :style="briefSizeStyle">{{ file.size }}</span>
          </span>
          <button
            type="button"
            :aria-label="`Remove ${file.name}`"
            @click="removeAttachment(idx)"
            class="flex"
            :style="{ color: 'var(--fg-3)' }"
          >
            <Icon name="lucide:x" class="w-3 h-3" />
          </button>
        </span>
      </div>

      <!-- Input box -->
      <div :style="[inputBoxStyle, { position: 'relative' }]">
        <MentionPopover
          v-if="mentionOpen && mentionFiles.length > 0"
          :files="mentionFiles"
          :selected-index="mentionSelectedIndex"
          @select="selectMention"
          @hover="(idx: number) => (mentionSelectedIndex = idx)"
        />
        <textarea
          ref="inputRef"
          v-model="inputText"
          @keydown="onKeydown"
          @input="onInput"
          @focus="focused = true"
          @blur="onBlur"
          placeholder="Ask Floo for a concept, copy, or research — drop files for context"
          :rows="2"
          :style="textareaStyle"
        />
        <div
          class="flex items-center"
          :style="{ gap: '6px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-soft)' }"
        >
          <ChatModeSelector />
          <!-- Model switcher removed: the GLM model is fixed by the
               server-side `GLM_MODEL` env var. Users don't need a
               per-message override. -->

          <button
            type="button"
            @click="fileInput?.click()"
            class="inline-flex items-center"
            :style="ctrlBtnStyle"
            @mouseenter="hoverCtrl($event, true)"
            @mouseleave="hoverCtrl($event, false)"
          >
            <Icon name="lucide:paperclip" class="w-3.5 h-3.5" />
            <span>Attach brief</span>
          </button>
          <input
            ref="fileInput"
            type="file"
            multiple
            class="hidden"
            @change="onFiles"
          />

          <!-- Knowledge chip — visible when persistent brand assets exist -->
          <span
            v-if="brandAssetCount > 0"
            class="inline-flex items-center"
            :title="`${brandAssetCount} brand ${brandAssetCount === 1 ? 'asset is' : 'assets are'} active on this project`"
            :style="{
              gap: '5px',
              padding: '4px 8px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--brand-tint)',
              color: 'var(--brand)',
              fontSize: '11.5px',
              fontWeight: 600,
              border: '1px solid color-mix(in srgb, var(--brand) 18%, transparent)',
            }"
          >
            <Icon name="lucide:library" class="w-3 h-3" />
            <span>{{ brandAssetCount }}</span>
          </span>

          <div class="relative">
            <button
              type="button"
              class="inline-flex items-center"
              :aria-expanded="skillsOpen"
              aria-label="Manage active skills"
              @click="skillsOpen = !skillsOpen"
              :style="ctrlBtnStyle"
              @mouseenter="hoverCtrl($event, true)"
              @mouseleave="hoverCtrl($event, false)"
            >
              <Icon name="lucide:hash" class="w-3.5 h-3.5" />
              <span>Skills · {{ activeSkillCount }}</span>
            </button>
            <ComposerSkillsPopover
              v-if="skillsOpen && projectsStore.activeProjectId"
              :project-id="projectsStore.activeProjectId"
              @close="skillsOpen = false"
            />
          </div>

          <button
            type="button"
            aria-label="Send"
            @click="send"
            :disabled="!inputText.trim()"
            class="ml-auto flex items-center justify-center"
            :style="sendBtnStyle"
            @mouseenter="hoverSend(true, $event)"
            @mouseleave="hoverSend(false, $event)"
          >
            <Icon name="lucide:send" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Footer hint -->
      <div
        class="flex items-center justify-between"
        :style="{ marginTop: '8px', fontSize: '11px', color: 'var(--fg-3)', padding: '0 4px' }"
      >
        <span>{{ footerHint }}</span>
        <span>
          <kbd
            :style="{
              fontFamily: 'inherit',
              fontSize: '10.5px',
              background: 'var(--bg-2)',
              padding: '1px 6px',
              borderRadius: '4px',
              border: '1px solid var(--border-soft)',
            }"
          >⌘ ↵</kbd>
          to send
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BrandAsset } from '~/types/project'
import type { MentionRef } from '~/utils/mention-refs'

const chatStore = useChatStore()
const projectsStore = useProjectsStore()
const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement>()
const fileInput = ref<HTMLInputElement>()
const focused = ref(false)
const attachments = ref<{ name: string; size: string }[]>([])
const skillsOpen = ref(false)

// Mention popover state. The popover opens whenever the textarea content
// has a valid @-trigger between the caret and the most recent whitespace
// (or start of text). The composer owns the selected index because the
// textarea retains focus while the popover is rendered.
const mentionOpen = ref(false)
const mentionStart = ref(0)
const mentionQuery = ref('')
const mentionSelectedIndex = ref(0)

// Tracks every file the user inserted via the @-popover. We reconcile
// this against the textarea text on send (the user may have deleted
// the @filename text by hand) to build the referencedAssetIds payload.
const mentionRefs = ref<MentionRef[]>([])

const mentionFiles = computed<BrandAsset[]>(() => {
  if (!mentionOpen.value) return []
  const all = projectsStore.activeProject?.contextRules?.brandAssets ?? []
  if (!mentionQuery.value) return all
  const q = mentionQuery.value.toLowerCase()
  return all.filter((a) => a.name.toLowerCase().includes(q))
})

// If the filter narrows to zero, close the popover instead of showing an
// empty list. If the index falls off the end after filtering, snap back to 0.
watch(mentionFiles, (files) => {
  if (!mentionOpen.value) return
  if (files.length === 0) {
    mentionOpen.value = false
  } else if (mentionSelectedIndex.value >= files.length) {
    mentionSelectedIndex.value = 0
  }
})

// Bridge from outside surfaces (e.g. ChatThread's empty-state suggestion
// chips). When `chatStore.composerDraft` is set non-empty, copy it into our
// local textarea, focus the input, and clear the bridge so subsequent
// identical drafts still trigger.
watch(
  () => chatStore.composerDraft,
  (draft) => {
    if (!draft) return
    // Drop any in-flight @-trigger — the injected draft owns the textarea now.
    mentionOpen.value = false
    inputText.value = draft
    chatStore.composerDraft = ''
    nextTick(() => {
      inputRef.value?.focus()
      // Move caret to end so the user can keep typing if they want to refine.
      const len = inputText.value.length
      inputRef.value?.setSelectionRange(len, len)
      autoResize()
    })
  },
)

const activeSkillCount = computed(() =>
  projectsStore.activeProject?.contextRules?.skills.filter((s) => s.active).length ?? 0
)

const brandAssetCount = computed(() =>
  projectsStore.activeProject?.contextRules?.brandAssets?.length ?? 0
)

const footerHint = computed(() => {
  const parts: string[] = ['Project rules']
  if (activeSkillCount.value > 0) {
    parts.push(`${activeSkillCount.value} ${activeSkillCount.value === 1 ? 'skill' : 'skills'}`)
  }
  if (brandAssetCount.value > 0) {
    parts.push(`${brandAssetCount.value} brand ${brandAssetCount.value === 1 ? 'asset' : 'assets'}`)
  }
  return `${parts.join(' + ')} will be applied`
})

// Styles
const inputBoxStyle = computed(() => ({
  background: 'var(--surface)',
  border: focused.value ? '1px solid var(--brand)' : '1px solid var(--border)',
  borderRadius: 'var(--r-lg)',
  boxShadow: focused.value
    ? '0 0 0 3px var(--brand-tint), var(--shadow-sm)'
    : 'var(--shadow-sm)',
  padding: '14px 14px 10px',
  transition: 'border-color 120ms var(--ease-out), box-shadow 200ms var(--ease-out)',
}))

const textareaStyle = {
  width: '100%',
  minHeight: '24px',
  maxHeight: '200px',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  resize: 'none' as const,
  fontFamily: 'var(--font-editorial)',
  fontSize: '15.5px',
  lineHeight: 1.55,
  color: 'var(--fg)',
}

const ctrlBtnStyle = {
  gap: '6px',
  padding: '6px 8px',
  borderRadius: 'var(--r-sm)',
  color: 'var(--fg-2)',
  fontSize: '12.5px',
  fontWeight: 500,
  transition: 'background 120ms var(--ease-out)',
}

const sendBtnStyle = computed(() => ({
  width: '36px',
  height: '36px',
  borderRadius: '10px',
  background: inputText.value.trim() ? 'var(--cta)' : 'var(--border)',
  color: inputText.value.trim() ? 'var(--cta-fg)' : 'var(--fg-3)',
  cursor: inputText.value.trim() ? 'pointer' : 'not-allowed',
  transition: 'transform 120ms var(--ease-out), box-shadow 200ms var(--ease-out)',
}))

const briefChipStyle = {
  gap: '8px',
  padding: '6px 8px 6px 10px',
  background: 'var(--brand-tint)',
  border: '1px solid color-mix(in srgb, var(--brand) 18%, transparent)',
  borderRadius: 'var(--r-md)',
  fontSize: '12px',
  color: 'var(--fg)',
  fontWeight: 500,
  maxWidth: '240px',
}

const briefIcoStyle = {
  width: '24px',
  height: '24px',
  borderRadius: '5px',
  background: 'var(--surface)',
  color: 'var(--brand)',
  flexShrink: 0,
}

const briefNameStyle = {
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const briefSizeStyle = {
  fontSize: '10.5px',
  color: 'var(--fg-3)',
  fontWeight: 500,
}

function hoverCtrl(e: MouseEvent, enter: boolean) {
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}

function hoverSend(enter: boolean, e: MouseEvent) {
  if (!inputText.value.trim()) return
  const el = e.currentTarget as HTMLElement
  el.style.transform = enter ? 'translateY(-1px)' : 'none'
  el.style.boxShadow = enter ? 'var(--shadow-md)' : 'none'
}

function onKeydown(e: KeyboardEvent) {
  // Mention popover takes priority over send / newline.
  if (mentionOpen.value && mentionFiles.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionSelectedIndex.value =
        (mentionSelectedIndex.value + 1) % mentionFiles.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionSelectedIndex.value =
        (mentionSelectedIndex.value - 1 + mentionFiles.value.length) %
        mentionFiles.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const file = mentionFiles.value[mentionSelectedIndex.value]
      if (file) selectMention(file)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      mentionOpen.value = false
      return
    }
  }

  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    send()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    send()
  }
}

function onInput() {
  autoResize()
  const ta = inputRef.value
  if (!ta) return
  const trigger = detectMentionTrigger(inputText.value, ta.selectionStart ?? 0)
  if (trigger) {
    // Reset the highlight only on a new trigger context (different @-position
    // or popover transitioning from closed to open). Keystrokes that refine
    // the same trigger preserve the user's current selection — the watch on
    // mentionFiles still snaps the index back to 0 if the list shrinks below
    // the current selection.
    const isNewTrigger = !mentionOpen.value || trigger.start !== mentionStart.value
    mentionOpen.value = true
    mentionStart.value = trigger.start
    mentionQuery.value = trigger.query
    if (isNewTrigger) mentionSelectedIndex.value = 0
  } else {
    mentionOpen.value = false
  }
}

function onBlur() {
  focused.value = false
  // Close the popover on blur. The popover items use @mousedown.prevent so
  // clicking an option fires `select` BEFORE blur, not after — meaning a
  // click selection still works.
  mentionOpen.value = false
}

function selectMention(file: BrandAsset) {
  const ta = inputRef.value
  if (!ta) return
  const caret = ta.selectionStart ?? inputText.value.length
  const result = replaceMentionTrigger(
    inputText.value,
    mentionStart.value,
    caret,
    file.name,
  )
  inputText.value = result.text
  mentionOpen.value = false
  // Track this insertion so we can resolve filenames → asset ids on send.
  // Reconciliation drops entries whose @filename was later deleted from
  // the textarea, and de-duplicates by assetId.
  mentionRefs.value.push({ assetId: file.id, filename: file.name })
  nextTick(() => {
    inputRef.value?.setSelectionRange(result.caret, result.caret)
    inputRef.value?.focus()
    autoResize()
  })
}

function autoResize() {
  const ta = inputRef.value
  if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
}

function onFiles(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files) return
  for (const f of Array.from(target.files)) {
    attachments.value.push({ name: f.name, size: formatBytes(f.size) })
  }
  target.value = ''
}

function removeAttachment(idx: number) {
  attachments.value.splice(idx, 1)
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function send() {
  const text = inputText.value.trim()
  if (!text || !projectsStore.activeProjectId) return
  const fullText = attachments.value.length
    ? `${text}\n\n[Attached: ${attachments.value.map((a) => a.name).join(', ')}]`
    : text
  // Resolve picker-tracked refs against the (full) message text. Tags whose
  // filename was deleted by hand drop out; duplicates collapse to one id.
  const referencedAssetIds = reconcileMentionRefs(fullText, mentionRefs.value)
  chatStore.sendMessage(
    fullText,
    projectsStore.activeProjectId,
    referencedAssetIds.length > 0 ? referencedAssetIds : undefined,
  )
  inputText.value = ''
  attachments.value = []
  mentionRefs.value = []
  // Send-button click doesn't blur the textarea, so onBlur won't fire to
  // close the popover. Close it explicitly here for both keyboard and click
  // send paths.
  mentionOpen.value = false
  nextTick(() => {
    if (inputRef.value) inputRef.value.style.height = 'auto'
  })
}
</script>
