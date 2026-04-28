<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-[11px] font-semibold tracking-wider text-floo-text-muted uppercase">
        Brand Voice
      </h3>

      <!-- Helper trigger — opens an inline tooltip with brand-voice writing tips.
           Visible in both view + edit so users discover it before they start typing. -->
      <button
        type="button"
        ref="helperRef"
        class="inline-flex items-center text-[10.5px] text-floo-text-muted hover:text-purple-600 transition-colors"
        :aria-expanded="helperOpen"
        @click="helperOpen = !helperOpen"
      >
        <Icon name="lucide:help-circle" class="w-3 h-3 mr-1" />
        What makes a good brand voice?
      </button>
    </div>

    <!-- Tooltip / inline help. Plain markup (not a portal) so it scrolls with
         the panel; positioning is below the trigger via absolute. -->
    <div
      v-if="helperOpen"
      class="mb-2 rounded-md border border-purple-200 bg-purple-50/60 px-3 py-2.5"
    >
      <div class="text-[11.5px] leading-snug text-floo-text">
        <p class="font-semibold mb-1">A useful brand voice tells Floo:</p>
        <ul class="list-disc pl-4 space-y-0.5 text-floo-text-muted">
          <li>The <strong>tone</strong> — warm vs clinical, playful vs serious.</li>
          <li>The <strong>pronoun</strong> you use — "you", "we", "I", or none.</li>
          <li>One or two <strong>vocabulary rules</strong> — words you use, words you ban.</li>
          <li>The <strong>punctuation rule</strong> — exclamation marks, em-dashes, emoji.</li>
        </ul>
        <p class="mt-2 text-[10.5px] text-floo-text-muted italic">
          Keep it 1–3 sentences. The more specific, the more on-brand the output.
        </p>
      </div>
    </div>

    <template v-if="editing">
      <textarea
        :value="content"
        :placeholder="placeholder"
        :maxlength="maxLength"
        @input="onInput"
        rows="5"
        class="w-full text-[13px] leading-relaxed text-floo-text bg-floo-bg border border-purple-200 rounded-lg px-3 py-2.5 outline-none focus:border-purple-400 resize-none"
      />
      <div class="mt-1 flex items-center justify-between text-[10.5px]">
        <span class="text-floo-text-muted italic">
          Tip: short, specific, opinionated. "Warm and direct" beats "professional and friendly."
        </span>
        <span
          :class="[
            'tabular-nums',
            charCount > maxLength * 0.9 ? 'text-amber-600 font-semibold' : 'text-floo-text-muted',
          ]"
        >
          {{ charCount }} / {{ maxLength }}
        </span>
      </div>
    </template>

    <p v-else-if="content" class="text-[13px] leading-relaxed text-floo-text">
      {{ content }}
    </p>

    <!-- View-mode placeholder when no brand voice is set. Lives here (not in
         the parent) so the section keeps its weight even when empty. -->
    <p v-else class="text-[12.5px] leading-relaxed text-floo-text-muted italic">
      No brand voice set yet. Click <strong>Edit</strong> to describe how this
      brand should sound — Floo will match it on every response.
    </p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  content: string
  editing: boolean
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const maxLength = 500

const placeholder =
  'e.g. "Warm and direct. We use \'you\', not \'we\'. Never hype, no exclamation marks, avoid jargon."'

const helperOpen = ref(false)
const helperRef = ref<HTMLElement>()

const charCount = computed(() => props.content?.length ?? 0)

function onInput(e: Event) {
  emit('update', (e.target as HTMLTextAreaElement).value)
}
</script>
