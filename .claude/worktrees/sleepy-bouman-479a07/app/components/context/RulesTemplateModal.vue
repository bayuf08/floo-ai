<template>
  <AppDialog v-model="open" title="Import rules template">
    <p :style="{ fontSize: '13px', color: 'var(--fg-2)', lineHeight: 1.55, marginBottom: '14px' }">
      Pick a starter template. This will replace the current Brand voice, DO/DON'T, and hashtags
      for this project.
    </p>

    <!-- Confirmation step -->
    <div
      v-if="pending"
      :style="{
        padding: '12px 14px',
        background: 'var(--cta-tint)',
        border: '1px solid color-mix(in srgb, var(--cta) 30%, transparent)',
        borderRadius: 'var(--r-md)',
        marginBottom: '12px',
      }"
    >
      <p :style="{ fontSize: '12.5px', color: 'var(--fg)', marginBottom: '8px', fontWeight: 600 }">
        Replace current Rules with <strong :style="{ fontWeight: 700 }">{{ pending.name }}</strong>?
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          @click="apply"
          :style="{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 700,
            background: 'var(--cta)',
            color: 'var(--cta-fg)',
            borderRadius: 'var(--r-sm)',
          }"
        >
          Yes, replace
        </button>
        <button
          type="button"
          @click="pending = null"
          :style="{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--fg-2)',
            borderRadius: 'var(--r-sm)',
          }"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Template grid -->
    <div :style="{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }">
      <article
        v-for="t in templates"
        :key="t.id"
        :style="{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }"
      >
        <h3 class="font-display" :style="{ fontWeight: 700, fontSize: '13.5px', color: 'var(--fg)' }">
          {{ t.name }}
        </h3>
        <p
          :style="{
            fontFamily: 'var(--font-editorial)',
            fontSize: '12px',
            color: 'var(--fg-2)',
            lineHeight: 1.5,
            flex: 1,
          }"
        >
          {{ t.voicePreview }}
        </p>
        <button
          type="button"
          @click="pending = t"
          :style="{
            padding: '6px 10px',
            fontSize: '11.5px',
            fontWeight: 600,
            background: 'var(--brand-tint)',
            color: 'var(--brand)',
            borderRadius: 'var(--r-sm)',
            border: '1px solid color-mix(in srgb, var(--brand) 18%, transparent)',
          }"
        >
          Use template
        </button>
      </article>
    </div>

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
        Done
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { RULES_TEMPLATES, type RulesTemplate } from '~/types/project'

const props = defineProps<{
  modelValue: boolean
  projectId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const projectsStore = useProjectsStore()
const templates = RULES_TEMPLATES
const pending = ref<RulesTemplate | null>(null)

watch(open, (v) => {
  if (!v) pending.value = null
})

function apply() {
  if (!pending.value) return
  projectsStore.applyRulesTemplate(props.projectId, pending.value)
  pending.value = null
  open.value = false
}
</script>
