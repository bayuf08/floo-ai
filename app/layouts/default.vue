<template>
  <!-- No-workspace gate: when the authenticated user has zero workspaces, the
       full-screen onboarding view takes over. We avoid rendering it during the
       hydration race (before /api/workspaces returns) and during mock mode
       (when mocks pre-populate workspaces). -->
  <CreateFirstWorkspace v-if="noWorkspace" />

  <div
    v-else
    class="flex w-screen h-screen overflow-hidden"
    :style="{ background: 'var(--bg)', color: 'var(--fg)' }"
  >
    <!-- Mobile backdrop for sidebar drawer -->
    <div
      v-if="ui.sidebarMobileOpen"
      class="md:hidden fixed inset-0 z-30"
      :style="{ background: 'rgba(0,0,0,0.4)' }"
      aria-hidden="true"
      @click="ui.sidebarMobileOpen = false"
    />

    <!-- Sidebar: static on md+, drawer on mobile -->
    <div
      class="md:static z-40"
      :class="[
        'fixed top-0 bottom-0 left-0 transition-transform md:transition-none',
        ui.sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ]"
      :style="{ width: ui.sidebarCollapsed ? '64px' : '264px' }"
    >
      <AppSidebar
        :collapsed="ui.sidebarCollapsed"
        @toggle="ui.toggleSidebar"
        @close-mobile="ui.sidebarMobileOpen = false"
      />
    </div>

    <!-- Main column -->
    <main class="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      <slot />
    </main>

    <!-- Right panel: pinned on xl+, overlay below -->
    <Transition name="fade">
      <div
        v-if="ui.rightPanelOpen && showRightPanel"
        class="z-40 fixed top-0 bottom-0 right-0 xl:static"
        :style="{ width: '340px' }"
      >
        <AppRightPanel @close="ui.rightPanelOpen = false" />
      </div>
    </Transition>

    <!-- Right panel mobile/tablet backdrop -->
    <div
      v-if="ui.rightPanelOpen && showRightPanel"
      class="xl:hidden fixed inset-0 z-30"
      :style="{ background: 'rgba(0,0,0,0.3)' }"
      aria-hidden="true"
      @click="ui.rightPanelOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
const route = useRoute()

const userStore = useUserStore()
const projectsStore = useProjectsStore()
const skillsStore = useSkillsStore()

// Right panel is only meaningful on workspace (chat) views — '/' and
// '/projects/[id]' — AND only when there's an actual project to talk about.
// Without an active project, the panel would render its empty rules tab over
// nothing useful.
const showRightPanel = computed(() => {
  if (!projectsStore.activeProject) return false
  if (route.path === '/') return true
  if (route.path.startsWith('/projects/') && route.params.id) return true
  return false
})

// Show the full-screen onboarding view only after we've confirmed via the
// backend that the user genuinely has zero workspaces. During the hydration
// race (before loadFromBackend resolves) and during mock mode (mocks
// pre-populate workspaces) the gate stays closed.
const noWorkspace = computed(() =>
  userStore.hydrated && !userStore.usingMocks && userStore.workspaces.length === 0,
)

watch(() => route.fullPath, () => {
  ui.sidebarMobileOpen = false
})

// When the active project disappears (workspace switch, deletion, navigation
// to a non-project route), force the right panel closed. The showRightPanel
// computed already prevents new mounts, but `ui.rightPanelOpen` can carry
// over from a prior project view — without this watcher the next time the
// user opens a project, the panel would auto-open even if they'd previously
// closed it. Worse, in some HMR/reactivity edge cases, the layout-level
// `v-if` was observed leaving the panel slot mounted.
watch(
  () => projectsStore.activeProject?.id,
  (id, prevId) => {
    if (!id && prevId) {
      ui.rightPanelOpen = false
    }
  },
)

watch(
  () => userStore.activeWorkspace?.id,
  async (wsId, prevWsId) => {
    if (!userStore.hydrated || userStore.usingMocks) return
    if (wsId === prevWsId) return
    await skillsStore.loadFromBackend(wsId)
  }
)

onMounted(async () => {
  ui.initTheme()
  ui.initSidebar()

  // 1. Workspaces first — this is the only call that can flip us out of
  //    mock mode. If it fails (network / 401), we keep mocks visible and
  //    skip the rest so we don't fire requests with mock workspace ids.
  await userStore.loadFromBackend()

  if (userStore.usingMocks) {
    // Backend unreachable or unauthenticated — leave the mock UI as-is.
    return
  }

  // 2. Projects for the active workspace (if any) — backend mode only.
  // Recover activeWorkspace if it's null but workspaces exist (can happen
  // when loadFromBackend() returned early due to hydrated guard).
  if (!userStore.activeWorkspace && userStore.workspaces.length > 0) {
    userStore.setActiveWorkspace(userStore.workspaces[0]!)
  }

  let wsId = userStore.activeWorkspace?.id
  if (!wsId && userStore.workspaces.length === 0) {
    // Authenticated user with zero workspaces (e.g. new sign-up whose
    // auto-workspace insert failed). Create a default workspace now so
    // the user is never left in a state where project creation silently
    // fails with a UUID mismatch.
    try {
      await userStore.createWorkspace({ name: 'My Workspace', activate: true })
      wsId = userStore.activeWorkspace?.id
    } catch {
      // createWorkspace already shows a toast; just wipe mock projects
      // so the sidebar renders an empty state rather than fictional rows.
      projectsStore.$patch({ projects: [], usingMocks: false })
    }
  }

  if (wsId) {
    await projectsStore.loadFromBackend(wsId)
  } else {
    // Still no workspace after attempted creation — render empty state.
    projectsStore.$patch({ projects: [], usingMocks: false })
  }

  // 3. Skills catalog — independent of projects.
  await skillsStore.loadFromBackend(wsId)
})

usePlatformTheme()
</script>
