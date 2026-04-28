<template>
  <div class="inline-flex items-center" :style="{ marginLeft: '6px' }">
    <button
      type="button"
      :aria-label="`Manage ${members.length} ${members.length === 1 ? 'member' : 'members'}`"
      class="inline-flex items-center"
      @click="$emit('open')"
    >
      <span
        v-for="(m, idx) in visibleMembers"
        :key="m.id"
        :title="`${m.name} · ${roleLabel(m.role)}`"
        class="flex items-center justify-center font-bold"
        :style="{
          width: '26px',
          height: '26px',
          borderRadius: '7px',
          background: `linear-gradient(135deg, ${m.avatarColor} 0%, color-mix(in srgb, ${m.avatarColor} 60%, var(--ft-amber)) 130%)`,
          color: 'white',
          fontSize: '10.5px',
          marginLeft: idx === 0 ? '0' : '-6px',
          border: '2px solid var(--bg)',
          zIndex: members.length - idx,
          position: 'relative',
        }"
      >
        {{ m.initials }}
      </span>

      <span
        v-if="overflowCount > 0"
        :style="{
          marginLeft: '-6px',
          width: '26px',
          height: '26px',
          borderRadius: '7px',
          background: 'var(--surface)',
          color: 'var(--fg-2)',
          fontSize: '10px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid var(--bg)',
          position: 'relative',
        }"
      >
        +{{ overflowCount }}
      </span>
    </button>

    <button
      type="button"
      aria-label="Invite member"
      :title="'Invite member'"
      class="flex items-center justify-center"
      :style="{
        marginLeft: '4px',
        width: '26px',
        height: '26px',
        borderRadius: '7px',
        border: '1px dashed var(--border-strong)',
        color: 'var(--fg-3)',
        background: 'transparent',
        transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
      }"
      @click="$emit('invite')"
      @mouseenter="hoverPlus($event, true)"
      @mouseleave="hoverPlus($event, false)"
    >
      <Icon name="lucide:plus" class="w-3 h-3" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ProjectMember } from '~/types/project'

const props = defineProps<{
  members: ProjectMember[]
}>()

defineEmits<{
  open: []
  invite: []
}>()

const MAX_VISIBLE = 3

const visibleMembers = computed(() => props.members.slice(0, MAX_VISIBLE))
const overflowCount = computed(() => Math.max(0, props.members.length - MAX_VISIBLE))

function roleLabel(role: ProjectMember['role']): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function hoverPlus(e: MouseEvent, enter: boolean) {
  const el = e.currentTarget as HTMLElement
  el.style.background = enter ? 'var(--bg-2)' : 'transparent'
  el.style.borderColor = enter ? 'var(--brand)' : 'var(--border-strong)'
  el.style.color = enter ? 'var(--brand)' : 'var(--fg-3)'
}
</script>
