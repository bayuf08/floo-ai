<template>
  <div class="relative">
    <div class="flex items-center gap-2.5">
      <!-- Avatar -->
      <div
        class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
        style="background: linear-gradient(135deg, #5B479D 0%, #7B67BD 100%)"
      >
        {{ userStore.currentUser.initials }}
      </div>

      <!-- Name & Role -->
      <div v-if="!collapsed" class="flex-1 min-w-0">
        <p class="text-[13px] font-medium text-floo-text truncate">
          {{ userStore.currentUser.name }}
        </p>
        <p class="text-[11px] text-floo-text-muted truncate">
          {{ userStore.currentUser.role }}
        </p>
      </div>

      <!-- Theme toggle (always visible when expanded) -->
      <ThemeToggle v-if="!collapsed" />

      <!-- Menu button -->
      <button
        v-if="!collapsed"
        type="button"
        aria-label="User menu"
        @click="menuOpen = !menuOpen"
        class="p-1 rounded-md text-floo-text-muted hover:text-floo-text-secondary hover:bg-floo-surface-hover transition-colors flex-shrink-0"
      >
        <Icon name="heroicons:ellipsis-horizontal" class="w-4 h-4" />
      </button>
    </div>

    <!-- User menu popover (outside-click handled by document listener below) -->
    <div
      v-if="menuOpen && !collapsed"
      class="absolute bottom-full left-0 right-0 mb-2 bg-floo-surface border border-floo-border rounded-floo-lg shadow-floo-lg overflow-hidden z-30 animate-fade-in"
    >
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-[13px] text-floo-text hover:bg-floo-surface-hover transition-colors flex items-center gap-2"
        @click="menuOpen = false"
      >
        <Icon name="heroicons:cog-6-tooth" class="w-4 h-4 text-floo-text-muted" />
        Settings
      </button>
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-[13px] text-floo-text hover:bg-floo-surface-hover transition-colors flex items-center gap-2"
        @click="menuOpen = false"
      >
        <Icon name="heroicons:user-circle" class="w-4 h-4 text-floo-text-muted" />
        Account
      </button>
      <hr class="border-floo-border" />
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-[13px] text-floo-text hover:bg-floo-surface-hover transition-colors flex items-center gap-2"
        @click="menuOpen = false"
      >
        <Icon name="heroicons:arrow-right-on-rectangle" class="w-4 h-4 text-floo-text-muted" />
        Sign out
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  collapsed: boolean
}>()

const userStore = useUserStore()
const menuOpen = ref(false)

// Close menu on Escape or click outside
if (import.meta.client) {
  const onClick = (e: MouseEvent) => {
    if (!menuOpen.value) return
    const target = e.target as HTMLElement
    if (!target.closest('.relative')) menuOpen.value = false
  }
  onMounted(() => document.addEventListener('click', onClick))
  onBeforeUnmount(() => document.removeEventListener('click', onClick))
}
</script>
