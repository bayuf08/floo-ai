<template>
  <!-- Belt-and-suspenders gate: even though the layout already conditionally
       mounts this component via showRightPanel, render nothing when there's
       no active project. Prevents the panel ever flashing the default rules
       text over an empty workspace state, and avoids relying solely on the
       layout-level gate (which has been observed to lag in some flows). -->
  <aside
    v-if="project"
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
    <div
      class="flex overflow-x-auto custom-scrollbar"
      :style="{ padding: '0 14px', borderBottom: '1px solid var(--border-soft)', scrollbarWidth: 'thin' }"
    >
      <button
        v-for="t in tabs"
        :key="t.value"
        type="button"
        @click="setTab(t.value)"
        class="inline-flex items-center"
        :title="isComingSoonTab(t.value) ? 'Coming soon' : undefined"
        :style="tabStyle(t.value)"
      >
        <span>{{ t.label }}</span>
        <span
          v-if="isComingSoonTab(t.value)"
          :style="{
            marginLeft: '6px',
            padding: '1px 6px',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            borderRadius: 'var(--r-pill)',
            background: 'var(--bg-2)',
            color: 'var(--fg-3)',
            lineHeight: 1.4,
          }"
        >Soon</span>
        <span
          v-else-if="t.value === 'knowledge' && assetCount > 0"
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
        <!-- Coming-soon placeholder — Rules editing is temporarily off
             while we ship the redesigned rules engine. Renders in place
             of all the brand-voice / DO / DON'T / hashtag editors so
             users still see the tab but understand why it's empty. -->
        <div :style="rulesEmptyStateStyle">
          <div :style="{ fontSize: '24px', lineHeight: 1, marginBottom: '8px' }">📋</div>
          <div
            class="font-display"
            :style="{ fontWeight: 700, fontSize: '15px', color: 'var(--fg)', marginBottom: '6px' }"
          >Rules — coming soon</div>
          <p
            :style="{
              fontFamily: 'var(--font-editorial)',
              fontSize: '12.5px',
              color: 'var(--fg-2)',
              lineHeight: 1.5,
              marginBottom: '4px',
              maxWidth: '260px',
            }"
          >
            We're rebuilding Rules so Floo can sound exactly like your brand.
            Until it ships, lean on Skills and Knowledge to steer outputs.
          </p>
        </div>
      </template>

      <!-- Rules tab — original implementation, hidden while the
           "coming soon" placeholder above is shown. Re-enable by
           swapping the v-if/template guard back when Rules ships. -->
      <template v-if="false">
        <!-- Empty state — shown when ALL four rule fields are blank.
             Replaces the four placeholder cards with a single guided
             prompt so users see one clear next step instead of four
             "Add a guideline…" buttons. -->
        <div v-if="rulesEmpty && !editing" :style="rulesEmptyStateStyle">
          <div :style="{ fontSize: '24px', lineHeight: 1, marginBottom: '8px' }">📋</div>
          <div
            class="font-display"
            :style="{ fontWeight: 700, fontSize: '15px', color: 'var(--fg)', marginBottom: '6px' }"
          >No rules set yet</div>
          <p
            :style="{
              fontFamily: 'var(--font-editorial)',
              fontSize: '12.5px',
              color: 'var(--fg-2)',
              lineHeight: 1.5,
              marginBottom: '14px',
              maxWidth: '260px',
            }"
          >
            Rules tell Floo how to sound and what to avoid. Without them,
            Floo writes in its default style.
          </p>
          <div class="flex items-center" :style="{ gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }">
            <button
              type="button"
              :disabled="!canEditRules"
              @click="rulesTemplateOpen = true"
              :style="primaryBtnStyle"
            >
              <Icon name="lucide:layout-template" class="w-3.5 h-3.5" />
              Import a template
            </button>
            <button
              type="button"
              :disabled="!canEditRules"
              @click="editing = true"
              :style="secondaryBtnStyle"
            >
              <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
              Set up manually
            </button>
          </div>
          <p
            v-if="!canEditRules"
            :style="{ fontSize: '11px', color: 'var(--fg-3)', fontStyle: 'italic', marginTop: '10px' }"
          >
            You're a viewer — ask an editor to set rules for this project.
          </p>
        </div>

        <template v-else>
          <div class="flex items-center justify-between" :style="{ marginBottom: '12px' }">
            <span :style="{ fontSize: '11.5px', color: 'var(--fg-3)', fontWeight: 500 }">
              Living document · synced with Floo on every message
            </span>
            <button
              v-if="canEditRules"
              type="button"
              class="inline-flex items-center"
              :style="{ fontSize: '11.5px', color: 'var(--brand)', fontWeight: 600, gap: '4px' }"
              @click="editing = !editing"
            >
              <Icon :name="editing ? 'lucide:check' : 'lucide:pencil'" class="w-3 h-3" />
              {{ editing ? 'Done' : 'Edit' }}
            </button>
          </div>

          <!-- Brand voice (polished editor: helper, char counter, placeholder) -->
          <div :style="ruleBlockStyle">
            <ContextBrandVoice
              :content="ctx?.brandVoice ?? ''"
              :editing="editing"
              @update="onBrandVoiceUpdate"
            />
          </div>

          <!-- DO — chip-based editor -->
          <div :style="ruleBlockStyle">
            <ContextDoSection
              :items="ctx?.doGuidelines ?? []"
              :editing="editing"
              @update:items="onUpdateDo"
            />
          </div>

          <!-- DON'T — chip-based editor -->
          <div :style="ruleBlockStyle">
            <ContextDontSection
              :items="ctx?.dontGuidelines ?? []"
              :editing="editing"
              @update:items="onUpdateDont"
            />
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
        </template>

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
          :style="{
            padding: '12px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--r-md)',
            marginBottom: '8px',
          }"
        >
          <div class="flex items-center" :style="{ gap: '10px' }">
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
              :disabled="!canToggleCurrentProjectSkills"
              @click="onToggleSkill(skill.id)"
              class="relative inline-flex flex-shrink-0"
              :style="{
                width: '36px',
                height: '20px',
                borderRadius: '999px',
                background: skill.active ? 'var(--brand)' : 'var(--border-strong)',
                transition: 'background 120ms var(--ease-out)',
                opacity: canToggleCurrentProjectSkills ? 1 : 0.5,
                cursor: canToggleCurrentProjectSkills ? 'pointer' : 'not-allowed',
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

          <!-- Instructions preview — collapsed by default. Lets the user
               verify what this skill actually injects into the prompt
               without leaving the panel. Only renders when there's
               instruction text on file. -->
          <div
            v-if="skillInstructions(skill.id)"
            :style="{ marginTop: '8px', borderTop: '1px solid var(--border-soft)', paddingTop: '8px' }"
          >
            <button
              type="button"
              @click="toggleSkillExpanded(skill.id)"
              class="inline-flex items-center"
              :style="{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--fg-3)',
                gap: '4px',
                background: 'transparent',
                padding: 0,
              }"
            >
              <Icon
                :name="expandedSkillIds.has(skill.id) ? 'lucide:chevron-down' : 'lucide:chevron-right'"
                class="w-3 h-3"
              />
              {{ expandedSkillIds.has(skill.id) ? 'Hide instructions' : 'Preview instructions' }}
            </button>
            <pre
              v-if="expandedSkillIds.has(skill.id)"
              :style="{
                marginTop: '6px',
                padding: '8px 10px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--r-sm)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '11px',
                color: 'var(--fg)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '180px',
                overflowY: 'auto',
              }"
            >{{ skillInstructions(skill.id) }}</pre>
          </div>
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
      <!-- Hidden for now — re-enable when the Platform feature is shipped.
      <template v-if="tab === 'platform'">
        <ContextPlatformTab
          v-if="projectId"
          :project-id="projectId"
        />
        <p v-else :style="{ fontSize: '12.5px', color: 'var(--fg-3)', fontStyle: 'italic' }">
          Select a project to manage its platform profile.
        </p>
      </template>
      -->


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
const rulesStore = useRulesStore()
const skillsStore = useSkillsStore()
const userStore = useUserStore()
const ui = useUiStore()

type Tab = 'rules' | 'skills' | 'platform' | 'knowledge' | 'saved'
/**
 * Tabs that are visible in the panel but not yet shipped. Rendered with
 * a "Soon" badge and a coming-soon placeholder body. Clicking still
 * activates the tab so users can read the message — Rules used to be
 * the default tab, so we also fall back to Skills as the new default
 * (see initial value of `tab` below) and skip these in any auto-routing
 * triggered via `ui.activeContextTab`.
 */
const COMING_SOON_TABS: ReadonlySet<Tab> = new Set(['rules'])
const tab = ref<Tab>('skills')
const tabs: { value: Tab; label: string }[] = [
  { value: 'rules', label: 'Rules' },
  { value: 'skills', label: 'Skills' },
  // Hidden for now — re-enable when the Platform feature is shipped.
  // { value: 'platform', label: 'Platform' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'saved', label: 'Saved' },
]

function isComingSoonTab(value: Tab): boolean {
  return COMING_SOON_TABS.has(value)
}

const project = computed(() => projectsStore.activeProject)
const ctx = computed(() => project.value?.contextRules)
const projectId = computed(() => project.value?.id ?? null)
const assetCount = computed(() => ctx.value?.brandAssets?.length ?? 0)
const activeSkills = computed(() => ctx.value?.skills?.filter((s) => s.active) ?? [])
const canToggleCurrentProjectSkills = computed(() =>
  !!projectId.value && userStore.canToggleProjectSkills
)
const canEditRules = computed(() => !!projectId.value && rulesStore.canEditProjectRules)

const editing = ref(false)
const rulesTemplateOpen = ref(false)

/**
 * "All four rule fields blank" check — drives the empty-state CTA pair.
 * Watches brand voice, DO, DON'T, and hashtags; ignores skills/files since
 * those have their own tabs and shouldn't gate the rules empty-state.
 */
const rulesEmpty = computed(() => {
  const c = ctx.value
  if (!c) return true
  const noBrandVoice = !c.brandVoice || c.brandVoice.trim().length === 0
  const noDo = !c.doGuidelines || c.doGuidelines.length === 0
  const noDont = !c.dontGuidelines || c.dontGuidelines.length === 0
  const noHashtags = !c.hashtags || c.hashtags.length === 0
  return noBrandVoice && noDo && noDont && noHashtags
})

watch(canEditRules, (allowed) => {
  if (!allowed) editing.value = false
})

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

function onBrandVoiceUpdate(value: string) {
  if (!projectId.value || !canEditRules.value) return
  rulesStore.updateBrandVoice(projectId.value, value)
}

/**
 * The chip-based DO/DON'T components emit the entire next array (add /
 * remove / inline-edit are all handled inside ContextRuleChips). We just
 * forward to the rules store.
 */
function onUpdateDo(items: string[]) {
  if (!projectId.value || !canEditRules.value) return
  rulesStore.updateDoGuidelines(projectId.value, items)
}

function onUpdateDont(items: string[]) {
  if (!projectId.value || !canEditRules.value) return
  rulesStore.updateDontGuidelines(projectId.value, items)
}

function onToggleSkill(skillId: string) {
  if (!projectId.value || !canToggleCurrentProjectSkills.value) return
  projectsStore.toggleSkill(projectId.value, skillId)
}

function skillDescription(id: string) {
  return skillsStore.getSkill(id)?.description ?? 'Skill applied to this project.'
}

function skillCategory(id: string) {
  return skillsStore.getSkill(id)?.category ?? 'skill'
}

/**
 * Returns the raw instructions text the prompt-builder injects for this
 * skill, or null if the catalog row has none. Surfaced in the panel so
 * users can verify what the model actually sees instead of guessing.
 */
function skillInstructions(id: string): string | null {
  return skillsStore.getSkill(id)?.instructions ?? null
}

const expandedSkillIds = reactive(new Set<string>())

function toggleSkillExpanded(id: string) {
  if (expandedSkillIds.has(id)) expandedSkillIds.delete(id)
  else expandedSkillIds.add(id)
}

// Styles
const rulesEmptyStateStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  textAlign: 'center' as const,
  padding: '32px 20px 28px',
  background: 'var(--surface)',
  border: '1px dashed var(--border-strong)',
  borderRadius: 'var(--r-md)',
  marginTop: '4px',
}

const primaryBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  fontSize: '12.5px',
  fontWeight: 600,
  background: 'var(--brand)',
  color: 'white',
  borderRadius: 'var(--r-sm)',
  cursor: 'pointer',
}

const secondaryBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  fontSize: '12.5px',
  fontWeight: 600,
  background: 'var(--surface)',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  cursor: 'pointer',
}

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

function tabStyle(value: Tab) {
  const active = tab.value === value
  const soon = isComingSoonTab(value)
  return {
    padding: '12px 14px',
    fontSize: '12.5px',
    fontWeight: 600,
    color: active ? 'var(--fg)' : 'var(--fg-3)',
    borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
    marginBottom: '-1px',
    background: 'transparent',
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
    opacity: soon && !active ? 0.7 : 1,
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
