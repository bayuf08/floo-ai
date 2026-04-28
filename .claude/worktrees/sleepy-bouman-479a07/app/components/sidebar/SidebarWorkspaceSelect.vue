<template>
  <div
    ref="menuRef"
    class="absolute z-50"
    :style="{
      top: 'calc(100% + 4px)',
      left: '0',
      right: '0',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '6px',
      overflow: 'hidden',
    }"
    role="menu"
  >
    <div
      :style="{
        fontSize: '10.5px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--fg-3)',
        padding: '6px 10px 4px',
      }"
    >
      Workspaces
    </div>
    <button
      v-for="ws in userStore.workspaces"
      :key="ws.id"
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-2.5 text-left"
      :style="itemStyle(ws.id)"
      @click="select(ws)"
      @mouseenter="hover($event, ws.id, true)"
      @mouseleave="hover($event, ws.id, false)"
    >
      <span
        :style="{
          width: '8px',
          height: '8px',
          borderRadius: '2px',
          background: ws.color,
          flexShrink: 0,
        }"
      />
      <span :style="{ flex: 1 }">{{ ws.name }}</span>
      <Icon
        v-if="ws.id === userStore.activeWorkspace?.id"
        name="lucide:check"
        class="w-3.5 h-3.5"
        :style="{ color: 'var(--brand)' }"
      />
    </button>

    <!-- Divider -->
    <div :style="{ height: '1px', background: 'var(--border-soft)', margin: '4px 0' }" />

    <!-- Create new workspace -->
    <button
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-2.5 text-left"
      :style="createBtnStyle"
      @click="openCreate"
      @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--bg-2)')"
      @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'transparent')"
    >
      <span
        class="flex items-center justify-center"
        :style="{
          width: '14px',
          height: '14px',
          borderRadius: '4px',
          border: '1px dashed var(--border-strong)',
          color: 'var(--brand)',
        }"
      >
        <Icon name="lucide:plus" class="w-2.5 h-2.5" />
      </span>
      <span :style="{ flex: 1, color: 'var(--brand)' }">New workspace</span>
    </button>

    <CreateWorkspaceDialog v-model="createOpen" />
  </div>
</template>

<script setup lang="ts">
import type { Workspace } from '~/types/user'
import { useClickOutside } from '~/composables/useClickOutside'

const emit = defineEmits<{
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const userStore = useUserStore()
const createOpen = ref(false)

useClickOutside(menuRef, () => {
  // Don't close the dropdown while the create-workspace dialog is open —
  // the dialog is teleported to <body> so a click inside it counts as "outside" the menu.
  if (createOpen.value) return
  emit('close')
})

function isActive(id: string) {
  return id === userStore.activeWorkspace?.id
}

function itemStyle(id: string) {
  return {
    padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    background: isActive(id) ? 'var(--brand-tint)' : 'transparent',
    color: 'var(--fg)',
    fontSize: '13px',
    fontWeight: 500,
  }
}

const createBtnStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--r-sm)',
  background: 'transparent',
  fontSize: '13px',
  fontWeight: 600,
}

function hover(e: MouseEvent, id: string, enter: boolean) {
  if (isActive(id)) return
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}

function select(ws: Workspace) {
  userStore.setActiveWorkspace(ws)
  emit('close')
}

function openCreate() {
  createOpen.value = true
}

// When the dialog closes (workspace was created or cancelled), close the dropdown too
watch(createOpen, (v, old) => {
  if (old && !v) emit('close')
})
</script>
