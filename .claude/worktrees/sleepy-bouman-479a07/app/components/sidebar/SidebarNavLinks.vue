<template>
  <nav class="px-2 space-y-0.5">
    <NuxtLink
      v-for="link in links"
      :key="link.label"
      :to="link.to"
      class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-floo-text-secondary hover:text-floo-text hover:bg-floo-surface-hover transition-colors"
      :exact-active-class="'bg-floo-brand-tint text-floo-brand'"
    >
      <Icon :name="link.icon" class="w-[18px] h-[18px] flex-shrink-0" />
      <template v-if="!collapsed">
        <span class="flex-1 text-[13px]">{{ link.label }}</span>
        <span
          v-if="link.badge"
          class="text-[11px] text-floo-text-muted bg-floo-bg px-1.5 py-0.5 rounded-full tabular-nums"
        >
          {{ link.badge }}
        </span>
      </template>
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
defineProps<{
  collapsed: boolean
}>()

const skillsStore = useSkillsStore()

const links = computed(() => [
  {
    label: 'Skill library',
    icon: 'heroicons:book-open',
    to: '/skills',
    badge: String(skillsStore.skills.length),
  },
  { label: 'All projects', icon: 'heroicons:folder', to: '/projects', badge: undefined },
  { label: 'Platform profiles', icon: 'heroicons:globe-alt', to: '#', badge: undefined },
  { label: 'Workspace settings', icon: 'heroicons:cog-6-tooth', to: '#', badge: undefined },
])
</script>
