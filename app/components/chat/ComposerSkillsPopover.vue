<template>
  <div
    ref="popoverRef"
    class="absolute z-50"
    :style="{
      bottom: 'calc(100% + 6px)',
      left: '0',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '6px',
      minWidth: '280px',
      maxHeight: '320px',
      overflowY: 'auto',
    }"
    role="menu"
  >
    <div
      class="flex items-center justify-between"
      :style="{ padding: '6px 8px 8px' }"
    >
      <span
        :style="{
          fontSize: '10.5px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-3)',
        }"
      >Active skills</span>
      <button
        type="button"
        @click="openInPanel"
        :style="{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--brand)',
          background: 'transparent',
        }"
      >
        Manage in Skills tab →
      </button>
    </div>

    <p
      v-if="!skills.length"
      :style="{ padding: '8px 10px 12px', fontSize: '12px', color: 'var(--fg-3)', fontStyle: 'italic' }"
    >
      No skills set up yet.
    </p>

    <button
      v-for="s in skills"
      :key="s.id"
      type="button"
      :disabled="!userStore.canToggleProjectSkills"
      @click="onToggle(s.id)"
      class="w-full flex items-center text-left"
      :style="rowStyle"
      @mouseenter="(($event.currentTarget as HTMLElement).style.background = 'var(--bg-2)')"
      @mouseleave="(($event.currentTarget as HTMLElement).style.background = 'transparent')"
    >
      <div class="flex-1 min-w-0">
        <div
          class="font-display"
          :style="{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }"
        >{{ s.name }}</div>
      </div>
      <span
        role="switch"
        :aria-checked="s.active"
        class="relative inline-flex flex-shrink-0"
        :style="{
          width: '30px',
          height: '16px',
          borderRadius: '999px',
          background: s.active ? 'var(--brand)' : 'var(--border-strong)',
          transition: 'background 120ms var(--ease-out)',
        }"
      >
        <span
          :style="{
            position: 'absolute',
            top: '2px',
            left: '2px',
            width: '12px',
            height: '12px',
            background: 'white',
            borderRadius: '999px',
            transform: s.active ? 'translateX(14px)' : 'translateX(0)',
            transition: 'transform 150ms var(--ease-out)',
          }"
        />
      </span>
    </button>

    <div
      :style="{
        marginTop: '4px',
        padding: '8px',
        borderTop: '1px solid var(--border-soft)',
      }"
    >
      <NuxtLink
        to="/skills"
        @click="emit('close')"
        :style="{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11.5px',
          fontWeight: 600,
          color: 'var(--brand)',
          textDecoration: 'none',
        }"
      >
        Browse skill library →
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useClickOutside } from '~/composables/useClickOutside'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const projectsStore = useProjectsStore()
const userStore = useUserStore()
const ui = useUiStore()
const popoverRef = ref<HTMLElement | null>(null)

useClickOutside(popoverRef, () => emit('close'))

const skills = computed(() => {
  const p = projectsStore.projects.find((x) => x.id === props.projectId)
  return p?.contextRules?.skills ?? []
})

const rowStyle = computed(() => ({
  padding: '8px 10px',
  borderRadius: 'var(--r-sm)',
  gap: '10px',
  background: 'transparent',
  cursor: userStore.canToggleProjectSkills ? 'pointer' : 'not-allowed',
  opacity: userStore.canToggleProjectSkills ? 1 : 0.5,
}))

function onToggle(skillId: string) {
  if (!userStore.canToggleProjectSkills) return
  projectsStore.toggleSkill(props.projectId, skillId)
}

function openInPanel() {
  ui.rightPanelOpen = true
  ;(ui as unknown as { activeContextTab?: string | null }).activeContextTab = 'skills'
  emit('close')
}
</script>
