<template>
  <aside
    class="flex flex-col h-full overflow-hidden"
    :style="{
      width: '340px',
      background: 'var(--surface-2)',
      borderLeft: '1px solid var(--border)',
    }"
  >
    <!-- Head -->
    <div
      class="flex items-center"
      :style="{ padding: '14px 18px', borderBottom: '1px solid var(--border-soft)', minHeight: '60px' }"
    >
      <span
        class="font-display flex-1"
        :style="{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.01em', color: 'var(--fg)' }"
      >Project context</span>
      <button
        type="button"
        aria-label="Close panel"
        @click="$emit('close')"
        :style="{ color: 'var(--fg-3)' }"
      >
        <Icon name="lucide:x" class="w-4 h-4" />
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex" :style="{ padding: '0 14px', borderBottom: '1px solid var(--border-soft)' }">
      <button
        v-for="t in tabs"
        :key="t.value"
        type="button"
        @click="setTab(t.value)"
        class="inline-flex items-center"
        :style="tabStyle(t.value)"
      >
        <span>{{ t.label }}</span>
        <span
          v-if="t.value === 'knowledge' && assetCount > 0"
          :style="{
            marginLeft: '6px',
            padding: '1px 6px',
            fontSize: '10px',
            fontWeight: 700,
            borderRadius: 'var(--r-pill)',
            background: tab === 'knowledge' ? 'var(--brand)' : 'var(--brand-tint)',
            color: tab === 'knowledge' ? 'white' : 'var(--brand)',
            lineHeight: 1.4,
          }"
        >{{ assetCount }}</span>
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" :style="{ padding: '18px 18px 24px' }">
      <!-- Rules tab -->
      <template v-if="tab === 'rules'">
        <div class="flex items-center justify-between" :style="{ marginBottom: '12px' }">
          <span :style="{ fontSize: '11.5px', color: 'var(--fg-3)', fontWeight: 500 }">
            Living document · synced with Floo on every message
          </span>
          <button
            type="button"
            class="inline-flex items-center"
            :style="{ fontSize: '11.5px', color: 'var(--brand)', fontWeight: 600, gap: '4px' }"
            @click="editing = !editing"
          >
            <Icon :name="editing ? 'lucide:check' : 'lucide:pencil'" class="w-3 h-3" />
            {{ editing ? 'Done' : 'Edit' }}
          </button>
        </div>

        <!-- Brand voice -->
        <div :style="ruleBlockStyle">
          <div :style="ruleLabelStyle">Brand voice</div>
          <textarea
            v-if="editing"
            :value="brandVoiceDraft"
            @input="brandVoiceDraft = ($event.target as HTMLTextAreaElement).value; commitBrandVoice()"
            rows="4"
            :style="ruleTextareaStyle"
          />
          <div v-else :style="ruleBodyStyle">
            {{ ctx?.brandVoice || defaultBrandVoice }}
          </div>
        </div>

        <!-- DO -->
        <div :style="ruleBlockStyle">
          <div :style="ruleLabelStyle">Do</div>
          <template v-if="editing">
            <div
              v-for="(item, idx) in ctx?.doGuidelines ?? []"
              :key="idx"
              class="flex items-start gap-1.5"
              :style="{ marginBottom: '6px' }"
            >
              <textarea
                :value="item"
                @input="updateDo(idx, ($event.target as HTMLTextAreaElement).value)"
                rows="2"
                :style="ruleItemTextareaStyle"
              />
              <button
                type="button"
                :aria-label="`Remove DO item ${idx + 1}`"
                @click="removeDo(idx)"
                :style="removeBtnStyle"
              >
                <Icon name="lucide:x" class="w-3 h-3" />
              </button>
            </div>
            <button type="button" @click="addDo" :style="addItemBtnStyle">
              <Icon name="lucide:plus" class="w-3 h-3" />
              Add guideline
            </button>
          </template>
          <div v-else :style="ruleBodyStyle">
            <template v-if="ctx?.doGuidelines?.length">
              {{ ctx.doGuidelines.join(' ') }}
            </template>
            <template v-else>{{ defaultDo }}</template>
          </div>
        </div>

        <!-- DON'T -->
        <div :style="ruleBlockStyle">
          <div :style="ruleLabelStyle">Don't</div>
          <template v-if="editing">
            <div
              v-for="(item, idx) in ctx?.dontGuidelines ?? []"
              :key="idx"
              class="flex items-start gap-1.5"
              :style="{ marginBottom: '6px' }"
            >
              <textarea
                :value="item"
                @input="updateDont(idx, ($event.target as HTMLTextAreaElement).value)"
                rows="2"
                :style="ruleItemTextareaStyle"
              />
              <button
                type="button"
                :aria-label="`Remove DON'T item ${idx + 1}`"
                @click="removeDont(idx)"
                :style="removeBtnStyle"
              >
                <Icon name="lucide:x" class="w-3 h-3" />
              </button>
            </div>
            <button type="button" @click="addDont" :style="addItemBtnStyle">
              <Icon name="lucide:plus" class="w-3 h-3" />
              Add guideline
            </button>
          </template>
          <div v-else :style="ruleBodyStyle">
            <template v-if="ctx?.dontGuidelines?.length">
              {{ ctx.dontGuidelines.join(' ') }}
            </template>
            <template v-else>{{ defaultDont }}</template>
          </div>
        </div>

        <!-- Hashtag set -->
        <div :style="ruleBlockStyle">
          <div :style="ruleLabelStyle">Hashtag set</div>
          <ContextHashtagSet
            v-if="projectId"
            :project-id="projectId"
            :editing="editing"
          />
        </div>

        <button
          type="button"
          @click="rulesTemplateOpen = true"
          class="w-full inline-flex items-center justify-center"
          :style="{
            marginTop: '6px',
            padding: '10px 12px',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--r-md)',
            color: 'var(--fg-2)',
            fontSize: '12.5px',
            fontWeight: 600,
            gap: '6px',
            background: 'transparent',
            transition: 'background 120ms var(--ease-out)',
          }"
          @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--bg-2)')"
          @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'transparent')"
        >
          <Icon name="lucide:plus" class="w-3 h-3" />
          Import rules template
        </button>

        <RulesTemplateModal
          v-if="projectId"
          v-model="rulesTemplateOpen"
          :project-id="projectId"
        />
      </template>

      <!-- Skills tab -->
      <template v-if="tab === 'skills'">
        <div class="flex items-center justify-between" :style="{ marginBottom: '12px' }">
          <span :style="{ fontSize: '11.5px', color: 'var(--fg-3)', fontWeight: 500 }">
            {{ activeSkills.length }} active in this project
          </span>
          <NuxtLink
            to="/skills"
            class="inline-flex items-center"
            :style="{ fontSize: '11.5px', color: 'var(--brand)', fontWeight: 600, gap: '4px' }"
          >
            <Icon name="lucide:plus" class="w-3 h-3" />
            Add
          </NuxtLink>
        </div>

        <div v-if="!ctx?.skills?.length" :style="{ padding: '12px 0' }">
          <p :style="{ fontSize: '12.5px', color: 'var(--fg-3)', fontStyle: 'italic', marginBottom: '12px' }">
            No skills active. Browse the library to add some.
          </p>
          <NuxtLink
            to="/skills"
            class="inline-flex items-center"
            :style="{
              padding: '8px 12px',
              fontSize: '12.5px',
              fontWeight: 600,
              background: 'var(--brand-tint)',
              color: 'var(--brand)',
              borderRadius: 'var(--r-md)',
              gap: '6px',
              textDecoration: 'none',
            }"
          >
            <Icon name="lucide:book-open" class="w-3.5 h-3.5" />
            Browse skill library
          </NuxtLink>
        </div>

        <div
          v-for="skill in ctx?.skills ?? []"
          :key="skill.id"
          class="flex items-center"
          :style="{
            padding: '12px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--r-md)',
            marginBottom: '8px',
            gap: '10px',
          }"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center" :style="{ gap: '8px', marginBottom: '4px' }">
              <span class="font-display" :style="{ fontWeight: 600, fontSize: '13.5px', color: 'var(--fg)' }">
                {{ skill.name }}
              </span>
              <span :style="categoryChipStyle(skill.id)">{{ skillCategory(skill.id) }}</span>
            </div>
            <div
              :style="{ fontFamily: 'var(--font-editorial)', fontSize: '12px', color: 'var(--fg-2)', lineHeight: 1.5 }"
            >
              {{ skillDescription(skill.id) }}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="skill.active"
            :aria-label="`Toggle ${skill.name}`"
            @click="onToggleSkill(skill.id)"
            class="relative inline-flex flex-shrink-0"
            :style="{
              width: '36px',
              height: '20px',
              borderRadius: '999px',
              background: skill.active ? 'var(--brand)' : 'var(--border-strong)',
              transition: 'background 120ms var(--ease-out)',
            }"
          >
            <span
              :style="{
                position: 'absolute',
                top: '2px',
                left: '2px',
                width: '16px',
                height: '16px',
                background: 'white',
                borderRadius: '999px',
                boxShadow: 'var(--shadow-xs)',
                transform: skill.active ? 'translateX(16px)' : 'translateX(0)',
                transition: 'transform 150ms var(--ease-out)',
              }"
            />
          </button>
        </div>

        <NuxtLink
          v-if="ctx?.skills?.length"
          to="/skills"
          class="inline-flex items-center"
          :style="{
            marginTop: '8px',
            padding: '8px 0',
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--brand)',
            gap: '4px',
            textDecoration: 'none',
          }"
        >
          <Icon name="lucide:plus" class="w-3 h-3" />
          Browse skill library
        </NuxtLink>
      </template>

      <!-- Platform tab (Feature 11 — full content) -->
      <template v-if="tab === 'platform'">
        <ContextPlatformTab
          v-if="projectId"
          :project-id="projectId"
        />
        <p v-else :style="{ fontSize: '12.5px', color: 'var(--fg-3)', fontStyle: 'italic' }">
          Select a project to manage its platform profile.
        </p>
      </template>

      <!-- Knowledge tab -->
      <template v-if="tab === 'knowledge'">
        <ContextKnowledgeTab
          v-if="projectId"
          :project-id="projectId"
        />
        <p v-else :style="{ fontSize: '12.5px', color: 'var(--fg-3)', fontStyle: 'italic' }">
          Select a project to manage its brand knowledge.
        </p>
      </template>

      <!-- Saved tab -->
      <template v-if="tab === 'saved'">
        <ContextSavedTab
          v-if="projectId"
          :project-id="projectId"
        />
        <p v-else :style="{ fontSize: '12.5px', color: 'var(--fg-3)', fontStyle: 'italic' }">
          Select a project to view its saved outputs.
        </p>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
defineEmits<{
  close: []
}>()

const projectsStore = useProjectsStore()
const skillsStore = useSkillsStore()
const ui = useUiStore()

type Tab = 'rules' | 'skills' | 'platform' | 'knowledge' | 'saved'
const tab = ref<Tab>('rules')
const tabs: { value: Tab; label: string }[] = [
  { value: 'rules', label: 'Rules' },
  { value: 'skills', label: 'Skills' },
  { value: 'platform', label: 'Platform' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'saved', label: 'Saved' },
]

const project = computed(() => projectsStore.activeProject)
const ctx = computed(() => project.value?.contextRules)
const projectId = computed(() => project.value?.id ?? null)
const assetCount = computed(() => ctx.value?.brandAssets?.length ?? 0)
const activeSkills = computed(() => ctx.value?.skills?.filter((s) => s.active) ?? [])

const editing = ref(false)
const rulesTemplateOpen = ref(false)
const brandVoiceDraft = ref(ctx.value?.brandVoice ?? '')

watch(
  () => ctx.value?.brandVoice,
  (v) => { brandVoiceDraft.value = v ?? '' }
)

// Allow other components to switch the tab via ui.activeContextTab
watch(
  () => (ui as unknown as { activeContextTab?: Tab }).activeContextTab,
  (val) => {
    if (val && tabs.some((t) => t.value === val)) {
      tab.value = val
      ;(ui as unknown as { activeContextTab?: Tab | null }).activeContextTab = null
    }
  }
)

function setTab(value: Tab) {
  tab.value = value
}

function commitBrandVoice() {
  if (!projectId.value) return
  projectsStore.updateBrandVoice(projectId.value, brandVoiceDraft.value)
}

function updateDo(idx: number, value: string) {
  if (!projectId.value || !ctx.value) return
  const next = [...ctx.value.doGuidelines]
  next[idx] = value
  projectsStore.updateDoGuidelines(projectId.value, next)
}

function removeDo(idx: number) {
  if (!projectId.value || !ctx.value) return
  const next = ctx.value.doGuidelines.filter((_, i) => i !== idx)
  projectsStore.updateDoGuidelines(projectId.value, next)
}

function addDo() {
  if (!projectId.value || !ctx.value) return
  projectsStore.updateDoGuidelines(projectId.value, [...ctx.value.doGuidelines, ''])
}

function updateDont(idx: number, value: string) {
  if (!projectId.value || !ctx.value) return
  const next = [...ctx.value.dontGuidelines]
  next[idx] = value
  projectsStore.updateDontGuidelines(projectId.value, next)
}

function removeDont(idx: number) {
  if (!projectId.value || !ctx.value) return
  const next = ctx.value.dontGuidelines.filter((_, i) => i !== idx)
  projectsStore.updateDontGuidelines(projectId.value, next)
}

function addDont() {
  if (!projectId.value || !ctx.value) return
  projectsStore.updateDontGuidelines(projectId.value, [...ctx.value.dontGuidelines, ''])
}

function onToggleSkill(skillId: string) {
  if (!projectId.value) return
  projectsStore.toggleSkill(projectId.value, skillId)
}

function skillDescription(id: string) {
  return skillsStore.getSkill(id)?.description ?? 'Skill applied to this project.'
}

function skillCategory(id: string) {
  return skillsStore.getSkill(id)?.category ?? 'skill'
}

const defaultBrandVoice = 'Set a brand voice in edit mode to give Floo a clearer sense of how you sound.'
const defaultDo = "Add do-guidelines to steer Floo toward what you want."
const defaultDont = "Add don't-guidelines so Floo knows what to avoid."

// Styles
const ruleBlockStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--r-md)',
  padding: '12px 14px',
  marginBottom: '10px',
}

const ruleLabelStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: '12px',
  letterSpacing: '0.02em',
  color: 'var(--fg-3)',
  textTransform: 'uppercase' as const,
  marginBottom: '6px',
}

const ruleBodyStyle = {
  fontFamily: 'var(--font-editorial)',
  fontSize: '13.5px',
  color: 'var(--fg)',
  lineHeight: 1.55,
}

const ruleTextareaStyle = {
  width: '100%',
  fontFamily: 'var(--font-editorial)',
  fontSize: '13.5px',
  color: 'var(--fg)',
  background: 'var(--bg-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  padding: '8px 10px',
  outline: 'none',
  resize: 'vertical' as const,
  lineHeight: 1.5,
}

const ruleItemTextareaStyle = {
  flex: 1,
  fontFamily: 'var(--font-editorial)',
  fontSize: '13px',
  color: 'var(--fg)',
  background: 'var(--bg-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  padding: '6px 8px',
  outline: 'none',
  resize: 'none' as const,
  lineHeight: 1.4,
  minWidth: 0,
}

const removeBtnStyle = {
  flexShrink: 0,
  marginTop: '4px',
  width: '22px',
  height: '22px',
  borderRadius: 'var(--r-sm)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--fg-3)',
  background: 'transparent',
}

const addItemBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  fontSize: '11.5px',
  fontWeight: 600,
  color: 'var(--brand)',
  background: 'transparent',
  borderRadius: 'var(--r-sm)',
}

function tabStyle(value: Tab) {
  const active = tab.value === value
  return {
    padding: '12px 14px',
    fontSize: '12.5px',
    fontWeight: 600,
    color: active ? 'var(--fg)' : 'var(--fg-3)',
    borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
    marginBottom: '-1px',
    background: 'transparent',
  }
}

function categoryChipStyle(skillId: string) {
  return {
    padding: '1px 6px',
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    background: 'var(--bg-2)',
    color: 'var(--fg-3)',
    borderRadius: 'var(--r-xs)',
  }
}
</script>
