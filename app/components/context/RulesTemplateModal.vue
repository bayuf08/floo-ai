<template>
  <AppDialog v-model="open" title="Import rules template">
    <p :style="{ fontSize: '13px', color: 'var(--fg-2)', lineHeight: 1.55, marginBottom: '14px' }">
      Pick a starter template. This will replace the current Brand voice, DO/DON'T, and hashtags
      for this project.
    </p>

    <div
      v-if="pendingApply"
      :style="bannerStyle('apply')"
    >
      <p :style="bannerTextStyle">
        Replace current Rules with <strong :style="{ fontWeight: 700 }">{{ pendingApply.name }}</strong>?
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          @click="applyPending"
          :disabled="submitting"
          :style="primaryBtnStyle"
        >
          {{ submitting ? 'Applying…' : 'Yes, replace' }}
        </button>
        <button
          type="button"
          @click="pendingApply = null"
          :style="secondaryBtnStyle"
        >
          Cancel
        </button>
      </div>
    </div>

    <div
      v-if="pendingDelete"
      :style="bannerStyle('delete')"
    >
      <p :style="bannerTextStyle">
        Delete custom template <strong :style="{ fontWeight: 700 }">{{ pendingDelete.name }}</strong>?
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          @click="deletePending"
          :disabled="submitting"
          :style="dangerBtnStyle"
        >
          {{ submitting ? 'Deleting…' : 'Delete template' }}
        </button>
        <button
          type="button"
          @click="pendingDelete = null"
          :style="secondaryBtnStyle"
        >
          Cancel
        </button>
      </div>
    </div>

    <div v-if="mode !== 'browse'">
      <div
        :style="{
          padding: '12px 14px',
          background: 'var(--surface-2)',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)',
          marginBottom: '12px',
        }"
      >
        <div class="font-display" :style="{ fontWeight: 700, fontSize: '13.5px', color: 'var(--fg)', marginBottom: '4px' }">
          {{ mode === 'create' ? 'Create custom template' : 'Edit custom template' }}
        </div>
        <p :style="{ fontSize: '12px', color: 'var(--fg-2)', lineHeight: 1.5 }">
          Voice preview and Brand voice are required so the template stays legible in the modal and useful when applied.
        </p>
      </div>

      <div :style="{ display: 'grid', gap: '10px' }">
        <label :style="fieldLabelStyle">
          <span>Name</span>
          <input
            v-model="form.name"
            type="text"
            placeholder="Quiet Artisan"
            :style="fieldInputStyle"
          />
        </label>

        <label :style="fieldLabelStyle">
          <span>Voice preview</span>
          <textarea
            v-model="form.voicePreview"
            rows="2"
            placeholder="A short summary shown in the template card."
            :style="fieldTextareaStyle"
          />
        </label>

        <label :style="fieldLabelStyle">
          <span>Brand voice</span>
          <textarea
            v-model="form.brandVoice"
            rows="4"
            placeholder="Describe how Floo should sound when this template is applied."
            :style="fieldTextareaStyle"
          />
        </label>

        <label :style="fieldLabelStyle">
          <span>DO guidelines</span>
          <textarea
            v-model="form.doText"
            rows="4"
            placeholder="One guideline per line."
            :style="fieldTextareaStyle"
          />
        </label>

        <label :style="fieldLabelStyle">
          <span>DON'T guidelines</span>
          <textarea
            v-model="form.dontText"
            rows="4"
            placeholder="One guideline per line."
            :style="fieldTextareaStyle"
          />
        </label>

        <label :style="fieldLabelStyle">
          <span>Hashtags</span>
          <input
            v-model="form.hashtagsText"
            type="text"
            placeholder="#SlowCraft #MadeByHand"
            :style="fieldInputStyle"
          />
        </label>
      </div>

      <p
        v-if="formError"
        :style="{ marginTop: '10px', fontSize: '12px', color: 'var(--ft-red)', fontWeight: 600 }"
      >
        {{ formError }}
      </p>
    </div>

    <div v-else>
      <div class="flex items-center justify-between" :style="{ marginBottom: '12px', gap: '10px' }">
        <p :style="{ fontSize: '12px', color: 'var(--fg-2)', lineHeight: 1.5 }">
          System templates are read-only. Workspace templates can be edited and deleted by owners and editors.
        </p>
        <button
          v-if="rulesStore.canManageTemplates"
          type="button"
          @click="startCreate"
          :style="primaryGhostBtnStyle"
        >
          <Icon name="lucide:plus" class="w-3 h-3" />
          New template
        </button>
      </div>

      <p
        v-if="rulesStore.loading"
        :style="{ fontSize: '12.5px', color: 'var(--fg-3)', fontStyle: 'italic', marginBottom: '12px' }"
      >
        Loading templates…
      </p>

      <section :style="{ marginBottom: '14px' }">
        <div :style="sectionLabelStyle">System templates</div>
        <div :style="gridStyle">
          <article
            v-for="template in groups.system"
            :key="template.id"
            :style="cardStyle"
          >
            <div class="flex items-center justify-between" :style="{ gap: '8px' }">
              <h3 class="font-display" :style="{ fontWeight: 700, fontSize: '13.5px', color: 'var(--fg)' }">
                {{ template.name }}
              </h3>
              <span :style="chipStyle(true)">System</span>
            </div>
            <p :style="cardBodyStyle">
              {{ template.voicePreview || 'No preview yet.' }}
            </p>
            <div class="flex items-center gap-2">
              <button
                type="button"
                :disabled="!rulesStore.canApplyTemplates"
                @click="pendingApply = template"
                :style="templateActionStyle(rulesStore.canApplyTemplates)"
              >
                Use template
              </button>
            </div>
          </article>
        </div>
      </section>

      <section>
        <div :style="sectionLabelStyle">Workspace templates</div>
        <p
          v-if="groups.workspace.length === 0"
          :style="{ fontSize: '12.5px', color: 'var(--fg-3)', fontStyle: 'italic', marginBottom: '8px' }"
        >
          No custom templates yet.
        </p>
        <div :style="gridStyle">
          <article
            v-for="template in groups.workspace"
            :key="template.id"
            :style="cardStyle"
          >
            <div class="flex items-center justify-between" :style="{ gap: '8px' }">
              <h3 class="font-display" :style="{ fontWeight: 700, fontSize: '13.5px', color: 'var(--fg)' }">
                {{ template.name }}
              </h3>
              <span :style="chipStyle(false)">Custom</span>
            </div>
            <p :style="cardBodyStyle">
              {{ template.voicePreview || 'No preview yet.' }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                :disabled="!rulesStore.canApplyTemplates"
                @click="pendingApply = template"
                :style="templateActionStyle(rulesStore.canApplyTemplates)"
              >
                Use template
              </button>
              <button
                v-if="rulesStore.canManageTemplates"
                type="button"
                @click="startEdit(template)"
                :style="plainBtnStyle"
              >
                Edit
              </button>
              <button
                v-if="rulesStore.canManageTemplates"
                type="button"
                @click="pendingDelete = template"
                :style="dangerLinkStyle"
              >
                Delete
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <template #footer="{ close }">
      <template v-if="mode !== 'browse'">
        <button
          type="button"
          @click="cancelForm"
          :style="secondaryBtnStyle"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="saveForm"
          :disabled="submitting"
          :style="primaryBtnStyle"
        >
          {{ submitting ? 'Saving…' : mode === 'create' ? 'Create template' : 'Save changes' }}
        </button>
      </template>
      <button
        v-else
        type="button"
        @click="close"
        :style="secondaryBtnStyle"
      >
        Done
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import type { RulesTemplateRecord } from '~/types/rules-template'
import { splitRulesTemplates } from '~/types/rules-template'

const props = defineProps<{
  modelValue: boolean
  projectId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const rulesStore = useRulesStore()

const groups = computed(() => splitRulesTemplates(rulesStore.templates))
const mode = ref<'browse' | 'create' | 'edit'>('browse')
const editingTemplateId = ref<string | null>(null)
const pendingApply = ref<RulesTemplateRecord | null>(null)
const pendingDelete = ref<RulesTemplateRecord | null>(null)
const submitting = ref(false)
const formError = ref('')
const form = reactive({
  name: '',
  voicePreview: '',
  brandVoice: '',
  doText: '',
  dontText: '',
  hashtagsText: '',
})

watch(open, async (value) => {
  if (value) {
    await rulesStore.loadTemplates(undefined, { force: rulesStore.usingFallback })
    return
  }
  resetTransientState()
})

function resetTransientState() {
  mode.value = 'browse'
  editingTemplateId.value = null
  pendingApply.value = null
  pendingDelete.value = null
  submitting.value = false
  formError.value = ''
  fillForm(null)
}

function fillForm(template: RulesTemplateRecord | null) {
  form.name = template?.name ?? ''
  form.voicePreview = template?.voicePreview ?? ''
  form.brandVoice = template?.brandVoice ?? ''
  form.doText = (template?.doGuidelines ?? []).join('\n')
  form.dontText = (template?.dontGuidelines ?? []).join('\n')
  form.hashtagsText = (template?.hashtags ?? []).join(' ')
}

function startCreate() {
  pendingApply.value = null
  pendingDelete.value = null
  formError.value = ''
  editingTemplateId.value = null
  mode.value = 'create'
  fillForm(null)
}

function startEdit(template: RulesTemplateRecord) {
  pendingApply.value = null
  pendingDelete.value = null
  formError.value = ''
  editingTemplateId.value = template.id
  mode.value = 'edit'
  fillForm(template)
}

function cancelForm() {
  mode.value = 'browse'
  editingTemplateId.value = null
  formError.value = ''
  fillForm(null)
}

function buildFormPayload() {
  return {
    name: form.name,
    voicePreview: form.voicePreview,
    brandVoice: form.brandVoice,
    doGuidelines: form.doText.split('\n'),
    dontGuidelines: form.dontText.split('\n'),
    hashtags: form.hashtagsText.split(/\s+/).filter(Boolean),
  }
}

async function saveForm() {
  formError.value = ''
  if (!form.name.trim() || !form.voicePreview.trim() || !form.brandVoice.trim()) {
    formError.value = 'Name, voice preview, and brand voice are required.'
    return
  }

  submitting.value = true
  const ok = mode.value === 'create'
    ? await rulesStore.createTemplate(buildFormPayload())
    : await rulesStore.updateTemplate(editingTemplateId.value!, buildFormPayload())
  submitting.value = false

  if (ok) {
    cancelForm()
  }
}

async function applyPending() {
  if (!pendingApply.value) return
  submitting.value = true
  const ok = await rulesStore.applyTemplate(props.projectId, pendingApply.value.id)
  submitting.value = false
  if (ok) {
    pendingApply.value = null
    open.value = false
  }
}

async function deletePending() {
  if (!pendingDelete.value) return
  submitting.value = true
  const ok = await rulesStore.deleteTemplate(pendingDelete.value.id)
  submitting.value = false
  if (ok) {
    pendingDelete.value = null
  }
}

function bannerStyle(kind: 'apply' | 'delete') {
  return {
    padding: '12px 14px',
    background: kind === 'delete' ? 'color-mix(in srgb, var(--ft-red) 8%, white)' : 'var(--cta-tint)',
    border: `1px solid ${kind === 'delete'
      ? 'color-mix(in srgb, var(--ft-red) 24%, transparent)'
      : 'color-mix(in srgb, var(--cta) 30%, transparent)'}`,
    borderRadius: 'var(--r-md)',
    marginBottom: '12px',
  }
}

const bannerTextStyle = {
  fontSize: '12.5px',
  color: 'var(--fg)',
  marginBottom: '8px',
  fontWeight: 600,
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
}

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  padding: '12px 14px',
  display: 'flex',
  // `as const` narrows the literal so it satisfies CSSProperties'
  // FlexDirection union ('row' | 'column' | …) instead of plain string.
  flexDirection: 'column' as const,
  gap: '8px',
}

const cardBodyStyle = {
  fontFamily: 'var(--font-editorial)',
  fontSize: '12px',
  color: 'var(--fg-2)',
  lineHeight: 1.5,
  flex: 1,
}

const sectionLabelStyle = {
  fontSize: '11px',
  color: 'var(--fg-3)',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  marginBottom: '8px',
}

const fieldLabelStyle = {
  display: 'grid',
  gap: '6px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--fg)',
}

const fieldInputStyle = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  fontSize: '12.5px',
  color: 'var(--fg)',
  outline: 'none',
}

const fieldTextareaStyle = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  fontSize: '12.5px',
  color: 'var(--fg)',
  outline: 'none',
  resize: 'vertical' as const,
  lineHeight: 1.5,
}

const primaryBtnStyle = {
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 700,
  background: 'var(--cta)',
  color: 'var(--cta-fg)',
  borderRadius: 'var(--r-sm)',
}

const secondaryBtnStyle = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--fg-2)',
  borderRadius: 'var(--r-md)',
}

const dangerBtnStyle = {
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 700,
  background: 'var(--ft-red)',
  color: 'white',
  borderRadius: 'var(--r-sm)',
}

const plainBtnStyle = {
  padding: '6px 8px',
  fontSize: '11.5px',
  fontWeight: 600,
  color: 'var(--fg-2)',
  borderRadius: 'var(--r-sm)',
}

const dangerLinkStyle = {
  padding: '6px 8px',
  fontSize: '11.5px',
  fontWeight: 600,
  color: 'var(--ft-red)',
  borderRadius: 'var(--r-sm)',
}

const primaryGhostBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 10px',
  fontSize: '11.5px',
  fontWeight: 600,
  background: 'var(--brand-tint)',
  color: 'var(--brand)',
  borderRadius: 'var(--r-sm)',
  border: '1px solid color-mix(in srgb, var(--brand) 18%, transparent)',
  flexShrink: 0,
}

function chipStyle(system: boolean) {
  return {
    padding: '1px 6px',
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    background: system ? 'var(--bg-2)' : 'color-mix(in srgb, var(--brand) 12%, transparent)',
    color: system ? 'var(--fg-3)' : 'var(--brand)',
    borderRadius: 'var(--r-xs)',
  }
}

function templateActionStyle(enabled: boolean) {
  return {
    padding: '6px 10px',
    fontSize: '11.5px',
    fontWeight: 600,
    background: 'var(--brand-tint)',
    color: 'var(--brand)',
    borderRadius: 'var(--r-sm)',
    border: '1px solid color-mix(in srgb, var(--brand) 18%, transparent)',
    opacity: enabled ? 1 : 0.5,
    cursor: enabled ? 'pointer' : 'not-allowed',
  }
}
</script>
