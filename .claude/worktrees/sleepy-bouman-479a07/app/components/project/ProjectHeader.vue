<template>
  <header
    class="flex items-center gap-3.5"
    :style="{
      padding: '14px 28px',
      borderBottom: '1px solid var(--border-soft)',
      background: 'var(--bg)',
      minHeight: '60px',
    }"
  >
    <!-- Mobile sidebar toggle -->
    <button
      type="button"
      aria-label="Open menu"
      class="md:hidden flex items-center justify-center"
      :style="iconBtnStyle"
      @click="ui.sidebarMobileOpen = true"
    >
      <Icon name="lucide:menu" class="w-4 h-4" />
    </button>

    <!-- Desktop sidebar collapse toggle -->
    <button
      type="button"
      :aria-label="ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      class="hidden md:flex items-center justify-center"
      :style="iconBtnStyle"
      @click="ui.toggleSidebar"
    >
      <Icon name="lucide:panel-left" class="w-4 h-4" />
    </button>

    <!-- Project title (with inline rename) -->
    <div
      v-if="project"
      class="font-display flex items-center gap-2.5 min-w-0"
      :style="{ fontWeight: 700, fontSize: '19px', letterSpacing: '-0.015em', color: 'var(--fg)' }"
    >
      <span :style="{ width: '12px', height: '12px', borderRadius: '4px', background: project.color, flexShrink: 0 }" />
      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameDraft"
        type="text"
        class="font-display"
        :style="{
          minWidth: '180px',
          maxWidth: '420px',
          padding: '2px 8px',
          background: 'var(--surface)',
          border: '1px solid var(--brand)',
          borderRadius: 'var(--r-sm)',
          fontSize: '19px',
          fontWeight: 700,
          letterSpacing: '-0.015em',
          color: 'var(--fg)',
          outline: 'none',
        }"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
      />
      <button
        v-else
        type="button"
        @dblclick="startRename"
        :title="'Double-click to rename'"
        class="truncate text-left"
        :style="{ background: 'transparent', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', cursor: 'text' }"
      >{{ project.name }}</button>
    </div>

    <!-- Platform badge (with switcher popover) -->
    <div v-if="project" class="relative">
      <button
        type="button"
        :aria-label="`Switch platform (current: ${project.platform})`"
        :aria-expanded="platformPopoverOpen"
        class="inline-flex items-center gap-1.5"
        :style="{
          padding: '5px 10px 5px 8px',
          borderRadius: 'var(--r-pill)',
          background: 'var(--platform-tint)',
          color: 'var(--platform)',
          fontWeight: 600,
          fontSize: '11.5px',
          border: '1px solid color-mix(in srgb, var(--platform) 20%, transparent)',
        }"
        @click="platformPopoverOpen = !platformPopoverOpen"
      >
        <Icon :name="platformIcon" class="w-3 h-3" />
        <span class="capitalize">{{ project.platform === 'twitter' ? 'X' : project.platform }}</span>
      </button>
      <PlatformSwitcherPopover
        v-if="platformPopoverOpen"
        :project-id="project.id"
        :current-platform="project.platform"
        @close="platformPopoverOpen = false"
      />
    </div>

    <!-- Edited time -->
    <span
      v-if="project"
      class="hidden sm:inline"
      :style="{ fontSize: '11.5px', color: 'var(--fg-3)', fontWeight: 500, marginLeft: '4px' }"
    >
      edited {{ projectsStore.getRelativeTime(project.updatedAt) }} ago
    </span>

    <!-- Member avatars -->
    <ProjectMemberAvatars
      v-if="project && (project.members?.length ?? 0) > 0"
      :members="project.members ?? []"
      class="hidden md:inline-flex"
      @open="openMembersModal('members')"
      @invite="openMembersModal('invite')"
    />

    <!-- Header actions -->
    <div class="ml-auto flex items-center gap-2">
      <!-- Bookmark / pin -->
      <button
        v-if="project"
        type="button"
        :aria-label="project.isPinned ? 'Unpin project' : 'Pin project'"
        :title="project.isPinned ? 'Pinned' : 'Pin to top'"
        :style="bookmarkBtnStyle"
        class="hidden sm:flex items-center justify-center"
        @click="projectsStore.togglePin(project.id)"
        @mouseenter="hoverBg($event, true)"
        @mouseleave="hoverBg($event, false)"
      >
        <Icon
          :name="project.isPinned ? 'lucide:bookmark-check' : 'lucide:bookmark'"
          class="w-4 h-4"
        />
      </button>

      <!-- More menu -->
      <div v-if="project" class="relative">
        <button
          type="button"
          aria-label="More actions"
          :aria-expanded="moreMenuOpen"
          :style="iconBtnStyle"
          class="flex items-center justify-center"
          @click="moreMenuOpen = !moreMenuOpen"
          @mouseenter="hoverBg($event, true)"
          @mouseleave="hoverBg($event, false)"
        >
          <Icon name="lucide:more-horizontal" class="w-4 h-4" />
        </button>
        <ProjectMoreMenu
          v-if="moreMenuOpen"
          @close="moreMenuOpen = false"
          @select="onMoreMenuSelect"
        />
      </div>

      <!-- Settings (right panel toggle) -->
      <button
        type="button"
        :aria-label="ui.rightPanelOpen ? 'Hide context' : 'Show context'"
        :style="settingsBtnStyle"
        @click="ui.toggleRightPanel"
      >
        <Icon name="lucide:settings-2" class="w-4 h-4" />
      </button>
    </div>

    <!-- Change platform modal -->
    <AppDialog v-model="changePlatformOpen" title="Change platform">
      <p :style="{ fontSize: '13px', color: 'var(--fg-2)', marginBottom: '14px' }">
        Choose the primary platform for this project. Floo will adapt tone and limits accordingly.
      </p>
      <div :style="{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }">
        <button
          v-for="p in allPlatforms"
          :key="p.value"
          type="button"
          @click="onChangePlatformConfirm(p.value)"
          class="flex items-center justify-center gap-1.5"
          :style="modalPlatformChip(p.value)"
        >
          <Icon :name="p.icon" class="w-3.5 h-3.5" />
          {{ p.label }}
        </button>
      </div>
      <template #footer="{ close }">
        <button
          type="button"
          @click="close"
          :style="{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--fg-2)', borderRadius: 'var(--r-md)' }"
        >Cancel</button>
      </template>
    </AppDialog>

    <!-- Delete project confirmation -->
    <AppDialog v-model="deleteOpen" title="Delete project?">
      <p :style="{ fontSize: '14px', color: 'var(--fg-2)', lineHeight: 1.55 }">
        Delete <strong :style="{ color: 'var(--fg)', fontWeight: 600 }">{{ project?.name }}</strong>?
        This cannot be undone — chat history, rules, skills, and brand assets will be lost.
      </p>
      <template #footer="{ close }">
        <button
          type="button"
          @click="close"
          :style="{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--fg-2)', borderRadius: 'var(--r-md)' }"
        >Cancel</button>
        <button
          type="button"
          @click="onDeleteConfirm(close)"
          :style="{ padding: '8px 16px', fontSize: '13px', fontWeight: 700, background: 'var(--ft-red)', color: 'white', borderRadius: 'var(--r-md)' }"
        >Delete project</button>
      </template>
    </AppDialog>

    <!-- Members modal -->
    <ProjectInviteModal
      v-if="project"
      v-model="membersModalOpen"
      :project-id="project.id"
      :initial-tab="membersInitialTab"
    />
  </header>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'

const projectsStore = useProjectsStore()
const chatStore = useChatStore()
const ui = useUiStore()
const router = useRouter()

const project = computed(() => projectsStore.activeProject)

// Local state
const renaming = ref(false)
const renameDraft = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

const platformPopoverOpen = ref(false)
const moreMenuOpen = ref(false)
const changePlatformOpen = ref(false)
const deleteOpen = ref(false)
const membersModalOpen = ref(false)
const membersInitialTab = ref<'members' | 'invite'>('members')

// ─── Rename ─────────────────────────────────────────────
function startRename() {
  if (!project.value) return
  renameDraft.value = project.value.name
  renaming.value = true
  nextTick(() => renameInput.value?.focus())
}

function commitRename() {
  if (!renaming.value || !project.value) return
  const trimmed = renameDraft.value.trim()
  if (trimmed && trimmed !== project.value.name) {
    projectsStore.renameProject(project.value.id, trimmed)
  }
  renaming.value = false
}

function cancelRename() {
  renaming.value = false
}

// ─── More menu actions ─────────────────────────────────
function onMoreMenuSelect(key: 'rename' | 'platform' | 'members' | 'duplicate' | 'export' | 'delete') {
  if (!project.value) return
  switch (key) {
    case 'rename':
      startRename()
      break
    case 'platform':
      changePlatformOpen.value = true
      break
    case 'members':
      openMembersModal('members')
      break
    case 'duplicate':
      onDuplicate()
      break
    case 'export':
      onExportConversation()
      break
    case 'delete':
      deleteOpen.value = true
      break
  }
}

function onDuplicate() {
  if (!project.value) return
  const newId = projectsStore.duplicateProject(project.value.id)
  if (newId) router.push(`/projects/${newId}`)
}

function onExportConversation() {
  if (!project.value) return
  const messages = chatStore.activeMessages
  const lines: string[] = [
    `# ${project.value.name}`,
    `Platform: ${project.value.platform}`,
    `Exported: ${new Date().toLocaleString()}`,
    '',
  ]
  for (const m of messages) {
    const time = m.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    lines.push(`[${time}] ${m.role === 'user' ? 'You' : 'Floo'}:`)
    if (m.content) lines.push(m.content)
    if (m.outputCards?.length) {
      for (const card of m.outputCards) {
        lines.push(`\n— ${(card.label ?? 'Output').toUpperCase()} —`)
        card.items.forEach((it, i) => lines.push(`  ${i + 1}. ${it}`))
      }
    }
    lines.push('')
  }
  const text = lines.join('\n')
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.value.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function onDeleteConfirm(close: () => void) {
  if (!project.value) return
  const id = project.value.id
  projectsStore.deleteProject(id)
  close()
  router.push('/projects')
}

// ─── Platform change ────────────────────────────────────
function onChangePlatformConfirm(platform: Platform) {
  if (!project.value) return
  projectsStore.changePlatform(project.value.id, platform)
  changePlatformOpen.value = false
}

// ─── Members modal ─────────────────────────────────────
function openMembersModal(tab: 'members' | 'invite') {
  membersInitialTab.value = tab
  membersModalOpen.value = true
}

// ─── Styles ────────────────────────────────────────────
const iconBtnStyle = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  color: 'var(--fg-2)',
  transition: 'background 120ms var(--ease-out)',
}

const bookmarkBtnStyle = computed(() => ({
  ...iconBtnStyle,
  color: project.value?.isPinned ? 'var(--brand)' : 'var(--fg-2)',
  background: project.value?.isPinned ? 'var(--brand-tint)' : 'transparent',
}))

const settingsBtnStyle = computed(() => ({
  ...iconBtnStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: ui.rightPanelOpen ? 'var(--brand-tint)' : 'transparent',
  color: ui.rightPanelOpen ? 'var(--brand)' : 'var(--fg-2)',
}))

const platformIcon = computed(() => {
  const map: Record<Platform, string> = {
    instagram: 'simple-icons:instagram',
    tiktok: 'simple-icons:tiktok',
    twitter: 'simple-icons:x',
    youtube: 'simple-icons:youtube',
    linkedin: 'simple-icons:linkedin',
    threads: 'simple-icons:threads',
  }
  return map[project.value?.platform ?? 'tiktok']
})

const allPlatforms: { value: Platform; label: string; icon: string }[] = [
  { value: 'tiktok', label: 'TikTok', icon: 'simple-icons:tiktok' },
  { value: 'instagram', label: 'Instagram', icon: 'simple-icons:instagram' },
  { value: 'twitter', label: 'X', icon: 'simple-icons:x' },
  { value: 'youtube', label: 'YouTube', icon: 'simple-icons:youtube' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'simple-icons:linkedin' },
  { value: 'threads', label: 'Threads', icon: 'simple-icons:threads' },
]

function modalPlatformChip(value: Platform) {
  const active = project.value?.platform === value
  return {
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    borderRadius: 'var(--r-md)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
    background: active ? 'var(--brand-tint)' : 'var(--surface)',
    color: active ? 'var(--brand)' : 'var(--fg-2)',
    transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
  }
}

function hoverBg(e: MouseEvent, enter: boolean) {
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}
</script>
