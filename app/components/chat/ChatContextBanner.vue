<template>
  <!-- Renders one of three states:
       1. Hidden       — no active project (chat thread is empty/loading)
       2. Active       — green pill + summary chips of context layers in play
       3. Empty        — muted dashed banner nudging user to set up rules

       Sits at the top of ChatThread, inside the scroll container, above
       the message list. So users can always see "yes, the AI is using my
       brand voice" without diving into the right-panel context tab. -->
  <div v-if="!activeProject" />

  <!-- ── Active state ───────────────────────────────────────── -->
  <div
    v-else-if="hasAnyContext"
    role="status"
    :aria-label="`Project context active — ${summaryAria}`"
    :style="bannerStyle"
  >
    <span :style="dotStyle" />
    <span :style="labelStyle">Project context active</span>
    <span :style="dividerStyle">·</span>

    <span
      v-for="chip in chips"
      :key="chip.label"
      :style="chipStyle"
      :title="chip.title"
    >
      <Icon :name="chip.icon" class="w-3 h-3" :style="{ color: chip.accent ?? 'var(--fg-3)' }" />
      <span>{{ chip.label }}</span>
    </span>
  </div>

  <!-- ── Empty state ────────────────────────────────────────── -->
  <button
    v-else
    type="button"
    :style="emptyBannerStyle"
    @click="openRulesTab"
    @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--surface)')"
    @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'var(--bg-2)')"
  >
    <Icon name="lucide:alert-triangle" class="w-3.5 h-3.5" :style="{ color: 'var(--ft-amber, #d97706)' }" />
    <span :style="{ fontWeight: 600, color: 'var(--fg)' }">No project context set</span>
    <span :style="{ color: 'var(--fg-2)' }">— add brand knowledge so Floo has something to work from.</span>
    <span :style="{ marginLeft: 'auto', color: 'var(--brand)', fontWeight: 600 }">
      Add knowledge
      <Icon name="lucide:arrow-right" class="w-3 h-3" style="display: inline-block; vertical-align: middle; margin-left: 2px;" />
    </span>
  </button>
</template>

<script setup lang="ts">
const projectsStore = useProjectsStore()
const uiStore = useUiStore()

const activeProject = computed(() => projectsStore.activeProject)
const ctx = computed(() => activeProject.value?.contextRules)

// Each chip surfaces one context layer that's actually populated, so the
// banner reflects ground truth rather than always claiming everything's on.
interface BannerChip {
  label: string
  icon: string
  accent?: string
  title?: string
}

const chips = computed<BannerChip[]>(() => {
  const out: BannerChip[] = []
  const c = ctx.value
  if (!c) return out

  if (c.brandVoice && c.brandVoice.trim().length > 0) {
    out.push({
      label: 'Brand voice',
      icon: 'lucide:sparkles',
      accent: 'var(--brand)',
      title: c.brandVoice.slice(0, 200),
    })
  }
  if (c.doGuidelines && c.doGuidelines.length > 0) {
    out.push({
      label: `${c.doGuidelines.length} DO`,
      icon: 'lucide:check-circle-2',
      accent: 'var(--ft-green, #059669)',
      title: c.doGuidelines.join(' · '),
    })
  }
  if (c.dontGuidelines && c.dontGuidelines.length > 0) {
    out.push({
      label: `${c.dontGuidelines.length} DON'T`,
      icon: 'lucide:x-circle',
      accent: 'var(--ft-coral, #dc2626)',
      title: c.dontGuidelines.join(' · '),
    })
  }
  if (c.hashtags && c.hashtags.length > 0) {
    out.push({
      label: `${c.hashtags.length} hashtag${c.hashtags.length === 1 ? '' : 's'}`,
      icon: 'lucide:hash',
      accent: 'var(--ft-blue, #2563eb)',
      title: c.hashtags.slice(0, 12).join(' '),
    })
  }
  const activeSkills = (c.skills ?? []).filter((s) => s.active).length
  if (activeSkills > 0) {
    out.push({
      label: `${activeSkills} skill${activeSkills === 1 ? '' : 's'}`,
      icon: 'lucide:wrench',
      accent: 'var(--brand)',
      title: (c.skills ?? []).filter((s) => s.active).map((s) => s.name).join(' · '),
    })
  }
  const fileCount = c.brandAssets?.length ?? 0
  if (fileCount > 0) {
    out.push({
      label: `${fileCount} file${fileCount === 1 ? '' : 's'}`,
      icon: 'lucide:file-text',
      accent: 'var(--fg-2)',
      title: (c.brandAssets ?? []).map((a) => a.name).join(' · '),
    })
  }
  return out
})

const hasAnyContext = computed(() => chips.value.length > 0)

const summaryAria = computed(() => chips.value.map((c) => c.label).join(', '))

function openRulesTab() {
  // Rules is "coming soon" — route the empty-context CTA to Knowledge,
  // which is the only context surface users can populate today.
  uiStore.activeContextTab = 'knowledge'
  uiStore.rightPanelOpen = true
}

// ── Styles ────────────────────────────────────────────────────────────────
const bannerStyle = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  gap: '8px',
  maxWidth: '820px',
  margin: '0 auto 16px',
  padding: '8px 12px',
  background: 'color-mix(in srgb, var(--ft-green, #059669) 6%, var(--surface))',
  border: '1px solid color-mix(in srgb, var(--ft-green, #059669) 22%, transparent)',
  borderRadius: 'var(--r-md)',
  fontSize: '12px',
}

const dotStyle = {
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: 'var(--ft-green, #059669)',
  boxShadow: '0 0 0 3px color-mix(in srgb, var(--ft-green, #059669) 18%, transparent)',
  flexShrink: 0,
}

const labelStyle = {
  fontWeight: 600,
  color: 'var(--fg)',
}

const dividerStyle = {
  color: 'var(--fg-3)',
  margin: '0 2px',
}

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  borderRadius: 'var(--r-pill)',
  background: 'var(--surface)',
  border: '1px solid var(--border-soft)',
  color: 'var(--fg-2)',
  fontWeight: 500,
  fontSize: '11.5px',
  whiteSpace: 'nowrap' as const,
}

const emptyBannerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  maxWidth: '820px',
  margin: '0 auto 16px',
  padding: '8px 12px',
  background: 'var(--bg-2)',
  border: '1px dashed var(--border)',
  borderRadius: 'var(--r-md)',
  fontSize: '12px',
  color: 'var(--fg-2)',
  cursor: 'pointer',
  transition: 'background 120ms var(--ease-out)',
  textAlign: 'left' as const,
  fontFamily: 'inherit',
}
</script>
