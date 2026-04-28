<template>
  <div
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

// Right panel is only meaningful on workspace (chat) views — '/' and '/projects/[id]'.
// All other routes (/projects, /skills, /platform-profiles, /settings) get full width.
const showRightPanel = computed(() => {
  if (route.path === '/') return true
  if (route.path.startsWith('/projects/') && route.params.id) return true
  return false
})

watch(() => route.fullPath, () => {
  ui.sidebarMobileOpen = false
})

const userStore = useUserStore()
const projectsStore = useProjectsStore()
const skillsStore = useSkillsStore()

onMounted(async () => {
  ui.initTheme()
  ui.initSidebar()
  // Hydrate workspaces → projects → skills from the backend if reachable.
  // Each call is a silent no-op when the API isn't configured (mocks remain).
  await userStore.loadFromBackend()
  await projectsStore.loadFromBackend()
  await skillsStore.loadFromBackend(userStore.activeWorkspace?.id)
})

usePlatformTheme()
</script>
