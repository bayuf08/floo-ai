<template>
  <AppDialog v-model="open" title="Create new skill">
    <form @submit.prevent="onSubmit" class="space-y-4">
      <!-- Name -->
      <div>
        <label for="cs-name" class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
          Skill name
        </label>
        <input
          id="cs-name"
          v-model="form.name"
          type="text"
          required
          placeholder="e.g. Yogyakarta Slang"
          class="w-full px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition"
        />
      </div>

      <!-- Category -->
      <div>
        <label class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
          Category
        </label>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="cat in categories"
            :key="cat.value"
            type="button"
            @click="form.category = cat.value"
            class="px-3 py-2 text-[12px] font-medium rounded-floo-md border transition-colors"
            :class="form.category === cat.value
              ? 'border-floo-brand bg-floo-brand-tint text-floo-brand'
              : 'border-floo-border text-floo-text-secondary hover:border-floo-border-strong'"
          >
            {{ cat.label }}
          </button>
        </div>
      </div>

      <!-- Short description -->
      <div>
        <label for="cs-desc" class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
          Short description
        </label>
        <input
          id="cs-desc"
          v-model="form.description"
          type="text"
          required
          placeholder="One-line summary of what this skill does."
          class="w-full px-3 py-2 text-sm bg-floo-surface border border-floo-border rounded-floo-md focus:outline-none focus:border-floo-brand focus:ring-2 focus:ring-floo-brand/20 transition"
        />
      </div>

      <!-- Instructions -->
      <div>
        <label for="cs-inst" class="block text-[12px] font-medium text-floo-text-secondary mb-1.5">
          Instructions for Floo
          <span class="text-floo-text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="cs-inst"
          v-model="form.instructions"
          rows="4"
          placeholder="Describe exactly how Floo should apply this skill — vocabulary to use, rules to follow, references to draw on."
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
        :disabled="saving || !userStore.canManageSkills || !form.name.trim() || !form.description.trim()"
        class="px-4 py-2 text-sm font-medium bg-floo-cta text-floo-cta-fg rounded-floo-md hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ saving ? 'Creating…' : 'Create skill' }}
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { CATEGORY_LABELS, resolveSkillFormCategory, type SkillCategory, type SkillCategoryFilter } from '~/types/skill'

const props = defineProps<{
  modelValue: boolean
  defaultCategory?: SkillCategoryFilter
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const userStore = useUserStore()
const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const skillsStore = useSkillsStore()
const saving = ref(false)

const categories: { value: SkillCategory; label: string }[] = (
  ['marketing', 'creator'] as SkillCategory[]
).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))

const form = reactive({
  name: '',
  category: resolveSkillFormCategory(props.defaultCategory) as SkillCategory,
  description: '',
  instructions: '',
})

function reset() {
  form.name = ''
  form.category = resolveSkillFormCategory(props.defaultCategory)
  form.description = ''
  form.instructions = ''
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) reset()
})

async function onSubmit() {
  if (saving.value || !userStore.canManageSkills || !form.name.trim() || !form.description.trim()) return

  saving.value = true
  const createdId = await skillsStore.createSkill({
    name: form.name.trim(),
    category: form.category,
    description: form.description.trim(),
    instructions: form.instructions.trim() || undefined,
  })
  saving.value = false

  if (!createdId) return

  open.value = false
  reset()
}
</script>
