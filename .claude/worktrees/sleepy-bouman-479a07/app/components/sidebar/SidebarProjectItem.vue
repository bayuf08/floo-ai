<template>
  <div
    ref="rowRef"
    class="relative group"
    :style="{ margin: '1px 8px' }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- Inline rename input -->
    <div
      v-if="renaming"
      class="flex items-center gap-2.5"
      :style="rowStyle"
    >
      <span
        :style="{ width: '10px', height: '10px', borderRadius: '3px', flexShrink: 0, background: project.color }"
      />
      <input
        ref="renameInput"
        v-model="renameValue"
        type="text"
        class="flex-1 font-display"
        :style="{
          background: 'var(--surface)',
          border: '1px solid var(--brand)',
          borderRadius: 'var(--r-sm)',
          padding: '2px 6px',
          fontSize: '13.5px',
          fontWeight: 500,
          color: 'var(--fg)',
          outline: 'none',
          letterSpacing: '-0.005em',
          minWidth: 0,
        }"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
      />
    </div>

    <!-- Normal row (link) -->
    <NuxtLink
      v-else
      :to="`/projects/${project.id}`"
      class="flex items-center gap-2.5 cursor-pointer"
      :style="rowStyle"
    >
      <span
        :style="{ width: '10px', height: '10px', borderRadius: '3px', flexShrink: 0, background: project.color }"
      />
      <template v-if="!collapsed">
        <span
          class="font-display"
          :style="{
            fontWeight: 500,
            fontSize: '13.5px',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.005em',
          }"
        >
          {{ project.name }}
        </span>
        <!-- Time stamp (hidden on hover when ... is showing) -->
        <span
          v-if="!hovered && !menuOpen"
          :style="{ fontSize: '10.5px', color: 'var(--fg-3)', fontWeight: 500 }"
        >
          {{ projectsStore.getRelativeTime(project.updatedAt) }}
        </span>
      </template>
    </NuxtLink>

    <!-- Hover-revealed ... button (only when not collapsed and not renaming) -->
    <button
      v-if="!collapsed && !renaming && (hovered || menuOpen)"
      type="button"
      :aria-label="`Project options for ${project.name}`"
      class="absolute flex items-center justify-center"
      :style="{
        top: '50%',
        right: '12px',
        transform: 'translateY(-50%)',
        width: '22px',
        height: '22px',
        borderRadius: 'var(--r-sm)',
        color: 'var(--fg-3)',
        background: menuOpen ? 'var(--bg-2)' : 'transparent',
        transition: 'background 120ms var(--ease-out)',
      }"
      @click.prevent.stop="menuOpen = !menuOpen"
      @mouseenter="hoverDots($event, true)"
      @mouseleave="hoverDots($event, false)"
    >
      <Icon name="lucide:more-horizontal" class="w-3.5 h-3.5" />
    </button>

    <!-- Context menu popover -->
    <div
      v-if="menuOpen"
      ref="menuRef"
      class="absolute z-50"
      :style="{
        top: 'calc(100% + 4px)',
        right: '0',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-md)',
        padding: '6px',
        minWidth: '160px',
      }"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        class="w-full flex items-center gap-2.5 text-left"
        :style="menuItemStyle"
        @click="startRename"
        @mouseenter="hoverItem($event, true)"
        @mouseleave="hoverItem($event, false)"
      >
        <Icon name="lucide:pencil" class="w-3.5 h-3.5" :style="{ color: 'var(--fg-3)' }" />
        <span :style="{ flex: 1 }">Rename</span>
      </button>
      <button
        type="button"
        role="menuitem"
        class="w-full flex items-center gap-2.5 text-left"
        :style="menuItemStyleDanger"
        @click="confirmDelete"
        @mouseenter="hoverDanger($event, true)"
        @mouseleave="hoverDanger($event, false)"
      >
        <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
        <span :style="{ flex: 1 }">Delete</span>
      </button>
    </div>

    <!-- Delete confirmation dialog -->
    <AppDialog v-model="deleteOpen" :title="`Delete project`">
      <p :style="{ fontSize: '14px', color: 'var(--fg-2)', lineHeight: 1.55 }">
        Delete <strong :style="{ color: 'var(--fg)', fontWeight: 600 }">{{ project.name }}</strong>?
        This cannot be undone.
      </p>
      <template #footer="{ close }">
        <button
          type="button"
          @click="close"
          class="px-4 py-2 rounded-floo-md transition-colors"
          :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-2)' }"
          @mouseenter="hoverDialogBtn($event, true)"
          @mouseleave="hoverDialogBtn($event, false)"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="doDelete(close)"
          class="px-4 py-2 rounded-floo-md transition-colors"
          :style="{
            fontSize: '13px',
            fontWeight: 600,
            background: 'var(--ft-red)',
            color: '#FFFFFF',
          }"
          @mouseenter="hoverDeleteBtn($event, true)"
          @mouseleave="hoverDeleteBtn($event, false)"
        >
          Delete project
        </button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup lang="ts">
import type { Project } from '~/types/project'
import { useClickOutside } from '~/composables/useClickOutside'

const props = defineProps<{
  project: Project
  collapsed: boolean
}>()

const projectsStore = useProjectsStore()
const route = useRoute()
const router = useRouter()

const rowRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)

const hovered = ref(false)
const menuOpen = ref(false)
const renaming = ref(false)
const renameValue = ref(props.project.name)
const deleteOpen = ref(false)
const originalName = ref(props.project.name)

useClickOutside(menuRef, () => (menuOpen.value = false))

const isActive = computed(
  () =>
    route.path === `/projects/${props.project.id}` ||
    (route.path === '/' && projectsStore.activeProjectId === props.project.id)
)

const rowStyle = computed(() => ({
  padding: '8px 14px 8px 16px',
  borderRadius: 'var(--r-md)',
  color: isActive.value ? 'var(--fg)' : 'var(--fg-2)',
  fontSize: '13px',
  background: isActive.value ? 'var(--brand-tint)' : hovered.value ? 'var(--surface)' : 'transparent',
  transition: 'background 120ms var(--ease-out), color 120ms var(--ease-out)',
  textDecoration: 'none',
}))

const menuItemStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--r-sm)',
  background: 'transparent',
  color: 'var(--fg)',
  fontSize: '13px',
  fontWeight: 500,
}

const menuItemStyleDanger = {
  ...menuItemStyle,
  color: 'var(--ft-red)',
}

function startRename() {
  menuOpen.value = false
  renaming.value = true
  renameValue.value = props.project.name
  originalName.value = props.project.name
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function commitRename() {
  if (!renaming.value) return
  const trimmed = renameValue.value.trim()
  if (trimmed && trimmed !== originalName.value) {
    projectsStore.renameProject(props.project.id, trimmed)
  }
  renaming.value = false
}

function cancelRename() {
  renameValue.value = originalName.value
  renaming.value = false
}

function confirmDelete() {
  menuOpen.value = false
  deleteOpen.value = true
}

function doDelete(closeFn: () => void) {
  const wasActive = isActive.value
  projectsStore.deleteProject(props.project.id)
  closeFn()
  if (wasActive) {
    const fallback = projectsStore.projects[0]?.id
    if (fallback) router.push(`/projects/${fallback}`)
    else router.push('/projects')
  }
}

function hoverDots(e: MouseEvent, enter: boolean) {
  if (menuOpen.value) return
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}

function hoverItem(e: MouseEvent, enter: boolean) {
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}

function hoverDanger(e: MouseEvent, enter: boolean) {
  ;(e.currentTarget as HTMLElement).style.background = enter
    ? 'color-mix(in srgb, var(--ft-red) 12%, transparent)'
    : 'transparent'
}

function hoverDialogBtn(e: MouseEvent, enter: boolean) {
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}

function hoverDeleteBtn(e: MouseEvent, enter: boolean) {
  ;(e.currentTarget as HTMLElement).style.opacity = enter ? '0.9' : '1'
}
</script>
