<template>
  <aside
    class="h-full flex flex-col"
    :style="{
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--border)',
      transition: 'width 200ms var(--ease-out)',
    }"
  >
    <!-- Brand row -->
    <div
      class="flex items-center justify-between"
      :style="{ padding: '18px 20px 14px 20px', borderBottom: '1px solid var(--border-soft)' }"
    >
      <div
        v-if="!collapsed"
        class="font-display flex items-baseline"
        :style="{ fontWeight: 800, fontSize: '19px', letterSpacing: '-0.02em', color: 'var(--fg)' }"
      >
        Floo<span :style="{ color: 'var(--brand)' }">·</span>Content
      </div>
      <div
        v-else
        class="font-display flex items-baseline"
        :style="{ fontWeight: 800, fontSize: '22px', letterSpacing: '-0.02em', color: 'var(--fg)' }"
      >
        F<span :style="{ color: 'var(--brand)' }">·</span>
      </div>
      <button
        type="button"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="$emit('toggle')"
        class="flex"
        :style="{ color: 'var(--fg-3)' }"
      >
        <Icon name="lucide:panel-left" class="w-4 h-4" />
      </button>
    </div>

    <!-- Workspace pill (with switcher dropdown) -->
    <div v-if="!collapsed" class="relative" :style="{ margin: '12px 16px 8px' }">
      <button
        type="button"
        :aria-label="`Switch workspace (current: ${activeWorkspace})`"
        :aria-expanded="workspaceMenuOpen"
        class="w-full inline-flex items-center gap-1.5 cursor-pointer"
        :style="{
          padding: '8px 12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          fontSize: '12px',
          color: 'var(--fg-2)',
          fontWeight: 500,
        }"
        @click="workspaceMenuOpen = !workspaceMenuOpen"
      >
        <span :style="{ width: '8px', height: '8px', borderRadius: '2px', background: userStore.activeWorkspace?.color ?? 'var(--brand)' }" />
        <span :style="{ fontWeight: 600, color: 'var(--fg)' }">{{ activeWorkspace }}</span>
        <span :style="{ marginLeft: 'auto', color: 'var(--fg-3)' }">
          <Icon name="lucide:chevron-down" class="w-3 h-3" />
        </span>
      </button>
      <SidebarWorkspaceSelect
        v-if="workspaceMenuOpen"
        @close="workspaceMenuOpen = false"
      />
    </div>

    <!-- New project CTA -->
    <button
      type="button"
      @click="newProjectOpen = true"
      class="flex items-center justify-center gap-2"
      :style="{
        margin: collapsed ? '4px auto 18px' : '4px 16px 18px',
        padding: collapsed ? '10px' : '10px 12px',
        background: 'var(--cta)',
        color: 'var(--cta-fg)',
        borderRadius: 'var(--r-md)',
        fontWeight: 700,
        fontSize: '13px',
        boxShadow: 'var(--shadow-xs)',
        transition: 'transform 120ms var(--ease-out), box-shadow 200ms var(--ease-out)',
      }"
    >
      <Icon name="lucide:plus" class="w-3.5 h-3.5" />
      <span v-if="!collapsed">New project</span>
    </button>

    <!-- Section label + filter toggle -->
    <div
      v-if="!collapsed"
      class="flex items-center justify-between"
      :style="{
        padding: '6px 22px 6px',
        fontSize: '10.5px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--fg-3)',
      }"
    >
      <span>
        Projects
        <span
          v-if="filteredProjects.length !== projectsStore.projectsByWorkspace.length"
          :style="{ color: 'var(--brand)', marginLeft: '6px', fontWeight: 700 }"
        >
          {{ filteredProjects.length }}/{{ projectsStore.projectsByWorkspace.length }}
        </span>
      </span>
      <button
        type="button"
        :aria-label="filterOpen ? 'Hide filters' : 'Show filters'"
        :aria-pressed="filterOpen"
        :style="{ color: filterActive ? 'var(--brand)' : 'var(--fg-3)' }"
        @click="filterOpen = !filterOpen"
      >
        <Icon name="lucide:filter" class="w-3 h-3" />
      </button>
    </div>

    <!-- Filter strip -->
    <SidebarProjectFilters
      v-if="!collapsed && filterOpen"
      v-model:selected-platforms="selectedPlatforms"
      v-model:sort="sort"
    />

    <!-- Project list (scrollable) -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" :style="{ padding: '4px 0 12px' }">
      <template v-for="(p, idx) in filteredProjects" :key="p.id">
        <!-- Divider between pinned and unpinned -->
        <div
          v-if="
            !collapsed &&
            hasPinnedProjects &&
            idx > 0 &&
            !p.isPinned &&
            filteredProjects[idx - 1]?.isPinned
          "
          :style="{
            margin: '6px 16px',
            height: '1px',
            background: 'var(--border-soft)',
          }"
        />
        <SidebarProjectItem :project="p" :collapsed="collapsed" />
      </template>
      <p
        v-if="filteredProjects.length === 0"
        :style="{
          padding: '12px 22px',
          fontSize: '12px',
          color: 'var(--fg-3)',
          fontStyle: 'italic',
        }"
      >
        No projects match these filters.
      </p>
    </div>

    <!-- Bottom nav -->
    <div
      v-if="!collapsed"
      :style="{ padding: '4px 0 8px', borderTop: '1px solid var(--border-soft)' }"
    >
      <NuxtLink
        v-for="link in bottomLinks"
        :key="link.label"
        :to="link.to"
        class="flex items-center gap-2.5 cursor-pointer"
        :style="navItemStyle(link.to)"
        @mouseenter="hoverNav($event, link.to, true)"
        @mouseleave="hoverNav($event, link.to, false)"
      >
        <Icon :name="link.icon" class="w-[15px] h-[15px]" />
        <span>{{ link.label }}</span>
        <span
          v-if="link.badge"
          :style="{ marginLeft: 'auto', fontSize: '11px', color: 'var(--fg-3)' }"
        >
          {{ link.badge }}
        </span>
      </NuxtLink>
    </div>

    <!-- User card -->
    <div
      ref="userCardRef"
      class="relative flex items-center gap-2.5"
      :style="{ borderTop: '1px solid var(--border-soft)', padding: '10px 14px' }"
    >
      <div
        class="flex items-center justify-center font-bold flex-shrink-0 overflow-hidden"
        :style="{
          width: '30px',
          height: '30px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, var(--brand) 0%, var(--ft-amber) 130%)',
          color: 'white',
          fontSize: '12px',
        }"
      >
        <img
          v-if="userStore.currentUser.avatarUrl"
          :src="userStore.currentUser.avatarUrl"
          :alt="userStore.currentUser.name"
          referrerpolicy="no-referrer"
          :style="{ width: '100%', height: '100%', objectFit: 'cover' }"
        />
        <span v-else>{{ userStore.currentUser.initials }}</span>
      </div>
      <div v-if="!collapsed" class="flex-1 min-w-0">
        <div
          :style="{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }"
        >
          {{ userStore.currentUser.name }}
        </div>
        <div
          :style="{
            fontSize: '11px',
            color: 'var(--fg-3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }"
        >
          {{ userStore.currentUser.role }}
        </div>
      </div>
      <ThemeToggle v-if="!collapsed" />
      <button
        v-if="!collapsed"
        type="button"
        aria-label="User menu"
        :aria-expanded="userMenuOpen"
        :style="{ color: 'var(--fg-3)' }"
        @click="userMenuOpen = !userMenuOpen"
      >
        <Icon name="lucide:more-horizontal" class="w-4 h-4" />
      </button>

      <SidebarUserMenu v-if="userMenuOpen" @close="userMenuOpen = false" />
    </div>

    <NewProjectDialog v-model="newProjectOpen" />
  </aside>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'

defineProps<{
  collapsed: boolean
}>()

defineEmits<{
  toggle: []
  closeMobile: []
}>()

const projectsStore = useProjectsStore()
const userStore = useUserStore()
const skillsStore = useSkillsStore()
const route = useRoute()

// Local UI state
const newProjectOpen = ref(false)
const workspaceMenuOpen = ref(false)
const userMenuOpen = ref(false)
const filterOpen = ref(false)
const userCardRef = ref<HTMLElement | null>(null)

// Filter state (resets when filter strip is closed)
const selectedPlatforms = ref<Platform[]>([])
const sort = ref<'recent' | 'alpha'>('recent')

watch(filterOpen, (open) => {
  if (!open) {
    selectedPlatforms.value = []
    sort.value = 'recent'
  }
})

const filterActive = computed(
  () => selectedPlatforms.value.length > 0 || sort.value !== 'recent'
)

const filteredProjects = computed(() => {
  let list = [...projectsStore.projectsByWorkspace]
  if (selectedPlatforms.value.length > 0) {
    list = list.filter((p) => selectedPlatforms.value.includes(p.platform))
  }
  if (sort.value === 'alpha') {
    list.sort((a, b) => a.name.localeCompare(b.name))
  } else {
    list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }
  // Pinned projects always float to the top, regardless of sort
  list.sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned))
  return list
})

const hasPinnedProjects = computed(() => filteredProjects.value.some((p) => p.isPinned))

const activeWorkspace = computed(() => userStore.activeWorkspace?.name ?? 'Workspace')

const bottomLinks = computed(() => [
  { label: 'Skill library', icon: 'lucide:book-open', to: '/skills', badge: String(skillsStore.skills.length) },
  { label: 'All projects', icon: 'lucide:layout-grid', to: '/projects', badge: undefined },
  { label: 'Platform profiles', icon: 'lucide:at-sign', to: '/platform-profiles', badge: undefined },
  { label: 'Workspace settings', icon: 'lucide:settings', to: '/settings', badge: undefined },
])

function navItemStyle(to: string) {
  const active = route.path === to || route.path.startsWith(`${to}/`)
  return {
    padding: '8px 14px 8px 16px',
    margin: '1px 8px',
    borderRadius: 'var(--r-md)',
    color: active ? 'var(--fg)' : 'var(--fg-2)',
    fontSize: '13px',
    fontWeight: 500,
    background: active ? 'var(--brand-tint)' : 'transparent',
    transition: 'background 120ms var(--ease-out)',
    textDecoration: 'none',
  }
}

function hoverNav(e: MouseEvent, to: string, enter: boolean) {
  if (route.path === to) return
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--surface)' : 'transparent'
}
</script>
