<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="skill"
        class="fixed inset-0 z-40 flex justify-end"
        @click.self="handleClose"
        @keydown.esc="handleClose"
      >
        <div class="absolute inset-0 bg-black/30" />
        <aside
          class="relative w-full max-w-md bg-floo-surface border-l border-floo-border shadow-floo-xl flex flex-col h-full animate-fade-in-up"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header -->
          <header class="flex-shrink-0 px-6 py-4 border-b border-floo-border flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-floo-brand-tint text-floo-brand mb-2"
              >
                {{ CATEGORY_LABELS[skill.category] }}
              </span>
              <h2 class="font-display font-bold text-xl text-floo-text">
                {{ editing ? 'Edit skill' : skill.name }}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close skill details"
              @click="handleClose"
              class="p-1 rounded-md text-floo-text-muted hover:text-floo-text hover:bg-floo-surface-hover transition-colors flex-shrink-0"
            >
              <Icon name="heroicons:x-mark" class="w-5 h-5" />
            </button>
          </header>

          <!-- Body: read mode -->
          <div v-if="!editing" class="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5">
            <section>
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-floo-text-muted mb-1.5">
                Description
              </h3>
              <p class="text-sm text-floo-text leading-relaxed">{{ skill.description }}</p>
            </section>

            <section v-if="skill.instructions">
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-floo-text-muted mb-1.5">
                Instructions for Floo
              </h3>
              <!-- Skill bodies are authored as markdown (headings, lists,
                   tables, blockquotes). MarkdownBlock parses + sanitizes
                   so the document reads as a structured spec instead of
                   a wall of literal asterisks and hashes. -->
              <MarkdownBlock :source="skill.instructions" />
            </section>

            <section v-if="examplesList.length">
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-floo-text-muted mb-1.5">
                Examples
              </h3>
              <!-- Worked examples ground the skill — they show the AI
                   what a correct response looks like. Surfacing them in
                   the drawer lets the user audit the contract before
                   toggling the skill on a project. -->
              <ul class="space-y-2">
                <li
                  v-for="(ex, idx) in examplesList"
                  :key="idx"
                  class="text-sm text-floo-text-secondary leading-relaxed pl-3 border-l-2 border-floo-border-soft"
                >
                  {{ ex }}
                </li>
              </ul>
            </section>

            <section>
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-floo-text-muted mb-1.5">
                Active on
              </h3>
              <p v-if="activeProjects.length === 0" class="text-sm text-floo-text-muted italic">
                No projects use this skill yet.
              </p>
              <ul v-else class="space-y-1.5">
                <li
                  v-for="p in activeProjects"
                  :key="p.id"
                  class="flex items-center gap-2 text-sm text-floo-text"
                >
                  <span
                    class="w-2 h-2 rounded-full flex-shrink-0"
                    :style="{ background: p.color }"
                  />
                  {{ p.name }}
                </li>
              </ul>
            </section>
          </div>

          <!-- Body: edit mode -->
          <div v-else class="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-4">
            <div>
              <label class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
                Skill name
              </label>
              <input
                v-model="editForm.name"
                type="text"
                required
                class="w-full px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition"
              />
            </div>
            <div>
              <label class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
                Short description
              </label>
              <input
                v-model="editForm.description"
                type="text"
                required
                class="w-full px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition"
              />
            </div>
            <div>
              <label class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
                Instructions for Floo
                <span class="text-floo-text-muted font-normal">(optional · markdown supported)</span>
              </label>
              <textarea
                v-model="editForm.instructions"
                rows="8"
                placeholder="Describe exactly how Floo should apply this skill. Markdown headings and lists render in the read view."
                class="w-full px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition resize-y font-mono"
              />
            </div>
            <div>
              <label class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
                Examples
                <span class="text-floo-text-muted font-normal">(optional · one per line)</span>
              </label>
              <textarea
                v-model="editForm.examplesText"
                rows="4"
                placeholder="One worked example per line — describe the input → response shape Floo should produce."
                class="w-full px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition resize-y"
              />
              <p class="text-[11px] text-floo-text-muted mt-1.5 leading-snug">
                Examples ground the skill — the AI imitates them more strongly than the prose. Aim for 2–4.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <footer class="flex-shrink-0 px-6 py-4 border-t border-floo-border bg-floo-surface-2 flex items-center justify-between gap-3">
            <!-- Left: label or delete button -->
            <span v-if="!skill.isCustom" class="text-[12px] text-floo-text-muted">
              Built-in skill
            </span>
            <button
              v-else-if="!editing && canEditCustomSkill"
              type="button"
              :disabled="deleting"
              @click="confirmDelete"
              class="flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-floo-md transition-colors disabled:opacity-50"
            >
              <Icon v-if="deleting" name="heroicons:arrow-path" class="w-3.5 h-3.5 animate-spin" />
              <Icon v-else name="heroicons:trash" class="w-3.5 h-3.5" />
              {{ deleting ? 'Deleting…' : 'Delete' }}
            </button>
            <span v-else class="text-[12px] text-floo-text-muted">Custom skill</span>

            <!-- Right: action buttons -->
            <div class="flex items-center gap-2">
              <template v-if="!editing">
                <button
                  v-if="canEditCustomSkill"
                  type="button"
                  @click="startEdit"
                  class="px-3 py-1.5 text-[13px] font-medium text-floo-brand hover:bg-floo-brand-tint rounded-floo-md transition-colors"
                >
                  Edit skill
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  @click="cancelEdit"
                  class="px-3 py-1.5 text-[13px] font-medium text-floo-text-secondary hover:bg-floo-surface-hover rounded-floo-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  :disabled="saving || !editForm.name.trim() || !editForm.description.trim()"
                  @click="saveEdit"
                  class="flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium bg-floo-cta text-floo-cta-fg rounded-floo-md hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon v-if="saving" name="heroicons:arrow-path" class="w-3.5 h-3.5 animate-spin" />
                  {{ saving ? 'Saving…' : 'Save changes' }}
                </button>
              </template>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { CATEGORY_LABELS, type SkillDefinition } from '~/types/skill'

const props = defineProps<{
  skill: SkillDefinition | null
}>()

const emit = defineEmits<{
  close: []
}>()

const userStore = useUserStore()
const skillsStore = useSkillsStore()
const projectsStore = useProjectsStore()
const canEditCustomSkill = computed(() => !!props.skill?.isCustom && userStore.canManageSkills)

// ── Edit state ────────────────────────────────────────────────────────────────
const editing = ref(false)
const saving  = ref(false)
const deleting = ref(false)

const editForm = reactive({
  name:         '',
  description:  '',
  instructions: '',
  /**
   * UI-only buffer — the textarea is one-example-per-line. Converted to
   * the `examples` string[] in saveEdit(). We keep the buffer in the
   * form rather than the store so unsaved edits stay editable line-by-line.
   */
  examplesText: '',
})

/** Convert the stored examples array to a textarea-friendly buffer. */
function examplesArrayToText(examples: string[] | undefined): string {
  return (examples ?? []).join('\n')
}

/** Convert the textarea buffer back to a sanitized examples array. */
function examplesTextToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// Sync form whenever the drawer opens for a different skill.
watch(
  () => props.skill,
  (s) => {
    editing.value = false
    saving.value  = false
    deleting.value = false
    if (s) {
      editForm.name         = s.name
      editForm.description  = s.description
      editForm.instructions = s.instructions ?? ''
      editForm.examplesText = examplesArrayToText(s.examples)
    }
  },
  { immediate: true }
)

function startEdit() {
  if (!props.skill) return
  editForm.name         = props.skill.name
  editForm.description  = props.skill.description
  editForm.instructions = props.skill.instructions ?? ''
  editForm.examplesText = examplesArrayToText(props.skill.examples)
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

async function saveEdit() {
  if (!props.skill || saving.value) return
  saving.value = true
  const examples = examplesTextToArray(editForm.examplesText)
  const ok = await skillsStore.updateSkill(props.skill.id, {
    name:         editForm.name.trim(),
    description:  editForm.description.trim(),
    instructions: editForm.instructions.trim() || undefined,
    // Always send the current array — even when empty — so a user who
    // deliberately cleared all examples gets that committed. The server's
    // buildSkillPatch maps [] → null in the DB.
    examples,
  })
  saving.value  = false
  if (ok) editing.value = false
}

async function confirmDelete() {
  if (!props.skill || deleting.value) return
  // Using a plain confirm for now; swap for an AppDialog confirmation if desired.
  const ok = window.confirm(
    `Delete "${props.skill.name}"?\n\nThis will remove it from all projects and cannot be undone.`
  )
  if (!ok) return
  deleting.value = true
  const deleted = await skillsStore.deleteSkill(props.skill.id)
  deleting.value = false
  if (deleted) emit('close')
}

function handleClose() {
  if (editing.value) {
    cancelEdit()
    return
  }
  emit('close')
}

// ── Derived data ──────────────────────────────────────────────────────────────

/**
 * Non-empty examples for display. Defensive against legacy rows whose
 * examples column might contain blank strings or null entries — those
 * shouldn't render as empty bullets in the drawer.
 */
const examplesList = computed(() => {
  const raw = props.skill?.examples ?? []
  return raw.filter((ex): ex is string => typeof ex === 'string' && ex.trim().length > 0)
})

const activeProjects = computed(() => {
  if (!props.skill) return []
  return projectsStore.projects.filter((p) =>
    p.contextRules?.skills?.some((s) => s.id === props.skill?.id && s.active)
  )
})
</script>
