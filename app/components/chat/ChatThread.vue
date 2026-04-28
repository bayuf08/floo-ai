<template>
  <div
    ref="threadRef"
    class="flex-1 overflow-y-auto custom-scrollbar"
    :style="{ padding: '24px 28px 8px' }"
  >
    <!-- Mock-mode banner. Three gates so it doesn't flash during the boot
         window now that the chat is wired to a real provider:
           1. userStore.hydrated      — we've at least tried the backend
           2. !userStore.usingMocks    — the backend was reachable
           3. chatStore.usingMocks     — but the chat thread couldn't flip
         Together: "we're authenticated, the backend works, but
         /api/projects/:id/messages still hasn't returned a successful
         response" — i.e. a real problem worth surfacing. -->
    <div
      v-if="showMockBanner"
      role="status"
      :style="bannerStyle"
    >
      <Icon name="lucide:info" class="w-4 h-4" :style="{ color: 'var(--fg-3)', flexShrink: 0 }" />
      <div :style="{ flex: 1, minWidth: 0 }">
        <div :style="{ fontWeight: 600, color: 'var(--fg)', fontSize: '12.5px' }">
          You're seeing sample responses
        </div>
        <div :style="{ fontSize: '11.5px', color: 'var(--fg-2)', marginTop: '2px' }">
          The chat hasn't connected to a real AI provider yet. If you set
          <code :style="codeStyle">GLM_API_KEY</code> in <code :style="codeStyle">.env</code>,
          sign out and back in to retry the session-cookie + history fetch.
        </div>
      </div>
    </div>

    <!-- Context-live banner. Shows whether the AI is using project rules
         (green pill + chips for each active layer) or warns the user that
         no context is set. Hidden when the project hasn't loaded yet. -->
    <ChatContextBanner v-if="!showEmptyState" />

    <!-- Empty state for brand-new (or freshly cleared) chats. Renders only
         when there are no messages AND the assistant isn't currently thinking,
         so the placeholder doesn't flash between the user's first send and
         the assistant's first token. -->
    <div
      v-if="showEmptyState"
      class="flex flex-col items-center justify-center text-center"
      :style="{
        minHeight: '100%',
        padding: '24px 16px',
        gap: '20px',
      }"
    >
      <div
        class="flex items-center justify-center"
        :style="{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'var(--brand-tint)',
          color: 'var(--brand)',
        }"
      >
        <Icon :name="platformIcon" class="w-8 h-8" />
      </div>

      <div :style="{ maxWidth: '440px' }">
        <h2
          class="font-display"
          :style="{
            fontWeight: 700,
            fontSize: '20px',
            letterSpacing: '-0.01em',
            color: 'var(--fg)',
            marginBottom: '8px',
          }"
        >
          {{ title }}
        </h2>
        <p
          :style="{
            fontFamily: 'var(--font-editorial)',
            fontSize: '14px',
            color: 'var(--fg-2)',
            lineHeight: 1.55,
          }"
        >
          {{ subtitle }}
        </p>
      </div>

      <!-- Suggestion chips — clicking a chip drops the prompt into the
           composer textarea via the chatStore.composerDraft slot. -->
      <div
        v-if="suggestions.length > 0"
        class="flex flex-wrap items-center justify-center"
        :style="{ gap: '8px', maxWidth: '560px' }"
      >
        <button
          v-for="s in suggestions"
          :key="s"
          type="button"
          @click="onSuggestion(s)"
          :style="suggestionChipStyle"
          @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--bg-2)')"
          @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'var(--surface)')"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div v-else :style="{ maxWidth: '820px', margin: '0 auto' }">
      <template v-for="message in chatStore.activeMessages" :key="message.id">
        <ChatMessageAI v-if="message.role === 'assistant'" :message="message" />
        <ChatMessageUser v-else :message="message" />
      </template>

      <!-- Thinking indicator -->
      <ChatThinkingIndicator v-if="chatStore.isThinking" />

      <!-- Scroll anchor -->
      <div ref="scrollAnchor" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'

const chatStore = useChatStore()
const projectsStore = useProjectsStore()
const userStore = useUserStore()
const threadRef = ref<HTMLElement>()
const scrollAnchor = ref<HTMLElement>()

// See the v-if on the banner above for the rationale on each gate.
const showMockBanner = computed(
  () =>
    userStore.hydrated &&
    !userStore.usingMocks &&
    chatStore.usingMocks,
)

// Show the empty state only when there are no messages yet AND no in-flight
// assistant response. The second guard prevents the placeholder from briefly
// re-appearing during the gap between the user submitting and the assistant
// streaming its first token.
const showEmptyState = computed(
  () => chatStore.activeMessages.length === 0 && !chatStore.isThinking,
)

const platform = computed<Platform | null>(
  () => projectsStore.activeProject?.platform ?? null,
)

const projectName = computed(() => projectsStore.activeProject?.name ?? 'this project')

// Per-platform icon — falls back to a generic spark when no platform.
const platformIcon = computed(() => {
  switch (platform.value) {
    case 'tiktok': return 'simple-icons:tiktok'
    case 'instagram': return 'simple-icons:instagram'
    case 'twitter': return 'simple-icons:x'
    case 'youtube': return 'simple-icons:youtube'
    case 'linkedin': return 'simple-icons:linkedin'
    case 'threads': return 'simple-icons:threads'
    default: return 'lucide:sparkles'
  }
})

const title = computed(() => `Start the conversation for ${projectName.value}`)

const subtitle = computed(
  () =>
    'Ask Floo to research a trend, draft a hook, sketch a script, or build a hashtag set. Project rules and skills will be applied automatically.',
)

// Per-platform starter prompts. Hand-picked rather than generic so the user
// has something concrete to click instead of staring at a blank screen.
const suggestions = computed<string[]>(() => {
  switch (platform.value) {
    case 'tiktok':
      return [
        'Research trending audio for this week',
        'Draft 3 hooks for a 30-second video',
        'Suggest a content series for this account',
      ]
    case 'instagram':
      return [
        'Draft a carousel post outline',
        'Suggest 10 on-brand hashtags',
        'Write a Reel hook + caption',
      ]
    case 'twitter':
      return [
        'Draft a 5-tweet thread',
        'Suggest a contrarian take to start a discussion',
        'Rewrite my last post for more engagement',
      ]
    case 'youtube':
      return [
        'Outline a 5-minute video script',
        'Suggest 5 thumbnail concepts',
        'Write a compelling video title',
      ]
    case 'linkedin':
      return [
        'Draft a thought-leadership post',
        'Outline a case-study post',
        'Suggest a discussion question for my network',
      ]
    case 'threads':
      return [
        'Draft a casual conversation starter',
        'Write a 3-post mini-thread',
        'Suggest a hot take for the timeline',
      ]
    default:
      return [
        'Research a trend in my niche',
        'Draft my first post',
        'Brainstorm a content series',
      ]
  }
})

// Hand the suggestion to the composer via the chat-store bridge. The
// composer's watcher copies it into its local textarea and focuses the input.
function onSuggestion(text: string) {
  chatStore.composerDraft = text
}

function scrollToBottom() {
  nextTick(() => {
    scrollAnchor.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(
  () => chatStore.activeMessages.length,
  () => scrollToBottom(),
)
watch(() => chatStore.isThinking, () => scrollToBottom())

onMounted(() => scrollToBottom())

// ── Styles ──────────────────────────────────────────────────────────────────

const suggestionChipStyle = {
  padding: '8px 14px',
  fontSize: '12.5px',
  fontWeight: 500,
  color: 'var(--fg-2)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-pill)',
  cursor: 'pointer',
  transition: 'background 120ms var(--ease-out)',
}

// Dashed-border, low-saturation banner — same visual register as the
// "Mock — configure an AI provider" pill on assistant messages. Stays
// pinned at the top of the thread so the warning doesn't scroll out of
// view as messages accumulate.
const bannerStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  maxWidth: '820px',
  margin: '0 auto 16px',
  padding: '10px 14px',
  background: 'var(--bg-2)',
  border: '1px dashed var(--border)',
  borderRadius: 'var(--r-md)',
}

const codeStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '10.5px',
  padding: '1px 5px',
  borderRadius: '3px',
  background: 'var(--surface)',
  border: '1px solid var(--border-soft)',
}
</script>
