<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-floo-border">
      <h2 class="font-display font-bold text-base text-floo-text">Project context</h2>
      <button
        @click="$emit('close')"
        class="p-1.5 rounded-lg text-floo-text-muted hover:text-floo-text hover:bg-floo-surface-hover transition-colors"
      >
        <Icon name="heroicons:x-mark" class="w-4.5 h-4.5" />
      </button>
    </div>

    <!-- Tabs -->
    <ContextTabs v-model="activeTab" />

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <!-- Rules tab -->
      <div v-if="activeTab === 'rules'" class="px-5 py-4 space-y-5">
        <!-- Sync badge -->
        <ContextSyncBadge :editing="editing" @toggle-edit="editing = !editing" />

        <!-- Brand Voice -->
        <ContextBrandVoice
          :content="context?.brandVoice ?? ''"
          :editing="editing"
          @update="updateBrandVoice"
        />

        <!-- DO -->
        <ContextDoSection
          :items="context?.doGuidelines ?? []"
          :editing="editing"
        />

        <!-- DON'T -->
        <ContextDontSection
          :items="context?.dontGuidelines ?? []"
          :editing="editing"
        />
      </div>

      <!-- Skills tab -->
      <div v-else-if="activeTab === 'skills'" class="px-5 py-4">
        <div class="space-y-2">
          <div
            v-for="skill in context?.skills ?? []"
            :key="skill.id"
            class="flex items-center justify-between py-2.5 px-3 bg-floo-bg rounded-lg"
          >
            <div class="flex items-center gap-2">
              <Icon name="heroicons:bolt" class="w-4 h-4 text-amber-400" />
              <span class="text-[13px] font-medium text-floo-text">{{ skill.name }}</span>
            </div>
            <button
              class="w-8 h-5 rounded-full transition-colors relative"
              :class="skill.active ? 'bg-purple-500' : 'bg-floo-border'"
            >
              <span
                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                :class="skill.active ? 'left-3.5' : 'left-0.5'"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- Platform tab -->
      <div v-else-if="activeTab === 'platform'" class="px-5 py-4">
        <div class="text-center py-8">
          <Icon name="heroicons:globe-alt" class="w-10 h-10 text-floo-text-muted mx-auto mb-3" />
          <p class="text-[13px] text-floo-text-muted">
            Platform profile settings for this project.
          </p>
          <button class="mt-3 text-[12px] font-medium text-purple-500 hover:text-purple-600 transition-colors">
            Configure platform
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  close: []
}>()

const projectsStore = useProjectsStore()
const activeTab = ref<'rules' | 'skills' | 'platform'>('rules')
const editing = ref(false)

const context = computed(() => projectsStore.activeProject?.contextRules)

function updateBrandVoice(value: string) {
  if (projectsStore.activeProject?.contextRules) {
    projectsStore.activeProject.contextRules.brandVoice = value
  }
}
</script>
