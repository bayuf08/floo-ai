<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="skill"
        class="fixed inset-0 z-40 flex justify-end"
        @click.self="$emit('close')"
        @keydown.esc="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/30" />
        <aside
          class="relative w-full max-w-md bg-floo-surface border-l border-floo-border shadow-floo-xl flex flex-col h-full animate-fade-in-up"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header -->
          <header class="flex-shrink-0 px-6 py-4 border-b border-floo-border flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-floo-brand-tint text-floo-brand mb-2"
              >
                {{ CATEGORY_LABELS[skill.category] }}
              </span>
              <h2 class="font-display font-bold text-xl text-floo-text">
                {{ skill.name }}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close skill details"
              @click="$emit('close')"
              class="p-1 rounded-md text-floo-text-muted hover:text-floo-text hover:bg-floo-surface-hover transition-colors flex-shrink-0"
            >
              <Icon name="heroicons:x-mark" class="w-5 h-5" />
            </button>
          </header>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5">
            <section>
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-floo-text-muted mb-1.5">
                Description
              </h3>
              <p class="text-sm text-floo-text leading-relaxed">{{ skill.description }}</p>
            </section>

            <section v-if="skill.instructions">
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-floo-text-muted mb-1.5">
                Instructions for Floo
              </h3>
              <p class="text-sm text-floo-text-secondary leading-relaxed whitespace-pre-line">
                {{ skill.instructions }}
              </p>
            </section>

            <section>
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-floo-text-muted mb-1.5">
                Active on
              </h3>
              <p v-if="activeProjects.length === 0" class="text-sm text-floo-text-muted italic">
                No projects use this skill yet.
              </p>
              <ul v-else class="space-y-1.5">
                <li
                  v-for="p in activeProjects"
                  :key="p.id"
                  class="flex items-center gap-2 text-sm text-floo-text"
                >
                  <span
                    class="w-2 h-2 rounded-full flex-shrink-0"
                    :style="{ background: p.color }"
                  />
                  {{ p.name }}
                </li>
              </ul>
            </section>
          </div>

          <!-- Footer -->
          <footer class="flex-shrink-0 px-6 py-4 border-t border-floo-border bg-floo-surface-2 flex items-center justify-between">
            <span class="text-[12px] text-floo-text-muted">
              {{ skill.isCustom ? 'Custom skill' : 'Built-in skill' }}
            </span>
            <button
              v-if="skill.isCustom"
              type="button"
              class="px-3 py-1.5 text-[13px] font-medium text-floo-brand hover:bg-floo-brand-tint rounded-floo-md transition-colors"
            >
              Edit skill
            </button>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { CATEGORY_LABELS, type SkillDefinition } from '~/types/skill'

const props = defineProps<{
  skill: SkillDefinition | null
}>()

defineEmits<{
  close: []
}>()

const projectsStore = useProjectsStore()

const activeProjects = computed(() => {
  if (!props.skill) return []
  return projectsStore.projects.filter((p) =>
    p.contextRules?.skills?.some((s) => s.id === props.skill?.id && s.active)
  )
})
</script>
