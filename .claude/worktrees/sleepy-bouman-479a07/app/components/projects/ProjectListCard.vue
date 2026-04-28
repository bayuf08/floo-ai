<template>
  <NuxtLink
    :to="`/projects/${project.id}`"
    class="group block bg-floo-surface border border-floo-border rounded-floo-lg overflow-hidden hover:shadow-floo-md hover:border-floo-border-strong transition-all duration-200"
  >
    <!-- Cover (gradient based on project color) -->
    <div
      class="h-24 relative overflow-hidden"
      :style="`background: linear-gradient(135deg, ${project.color} 0%, ${project.color}99 100%)`"
    >
      <!-- Decorative double-loop motif -->
      <svg
        class="absolute -bottom-6 -right-6 w-24 h-24 text-white opacity-20"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        aria-hidden="true"
      >
        <circle cx="38" cy="50" r="22" />
        <circle cx="62" cy="50" r="22" />
      </svg>
      <!-- Platform tag -->
      <div class="absolute top-3 left-3">
        <ProjectPlatformTag :platform="project.platform" size="sm" />
      </div>
    </div>

    <!-- Body -->
    <div class="p-4">
      <h3 class="font-display font-semibold text-[15px] text-floo-text leading-snug mb-1 truncate group-hover:text-floo-brand transition-colors">
        {{ project.name }}
      </h3>
      <div class="flex items-center justify-between text-[12px] text-floo-text-muted">
        <span>Updated {{ projectsStore.getRelativeTime(project.updatedAt) }} ago</span>
        <span v-if="project.contextRules?.skills?.length">
          {{ project.contextRules.skills.filter(s => s.active).length }} skills
        </span>
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { Project } from '~/types/project'

defineProps<{
  project: Project
}>()

const projectsStore = useProjectsStore()
</script>
