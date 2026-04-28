<template>
  <div
    ref="menuRef"
    class="absolute z-50"
    :style="{
      bottom: 'calc(100% + 6px)',
      left: '8px',
      right: '8px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '6px',
      overflow: 'hidden',
    }"
    role="menu"
  >
    <!-- View profile (stub) -->
    <button
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-2.5 text-left"
      :style="itemStyle"
      @click="onViewProfile"
      @mouseenter="hoverItem($event, true)"
      @mouseleave="hoverItem($event, false)"
    >
      <Icon name="lucide:user" class="w-3.5 h-3.5" :style="{ color: 'var(--fg-3)' }" />
      <span :style="{ flex: 1 }">View profile</span>
    </button>

    <!-- Change avatar -->
    <button
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-2.5 text-left"
      :style="itemStyle"
      :disabled="uploading"
      @click="fileInput?.click()"
      @mouseenter="hoverItem($event, true)"
      @mouseleave="hoverItem($event, false)"
    >
      <Icon name="lucide:camera" class="w-3.5 h-3.5" :style="{ color: 'var(--fg-3)' }" />
      <span :style="{ flex: 1 }">{{ uploading ? 'Uploading…' : 'Change avatar' }}</span>
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onAvatarChange"
    />

    <!-- Theme inline toggle -->
    <button
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-2.5 text-left"
      :style="itemStyle"
      @click="toggleTheme"
      @mouseenter="hoverItem($event, true)"
      @mouseleave="hoverItem($event, false)"
    >
      <Icon
        :name="isDark ? 'lucide:sun' : 'lucide:moon'"
        class="w-3.5 h-3.5"
        :style="{ color: 'var(--fg-3)' }"
      />
      <span :style="{ flex: 1 }">Theme</span>
      <span :style="{ fontSize: '11px', color: 'var(--fg-3)', textTransform: 'capitalize' }">
        {{ isDark ? 'Dark' : 'Light' }}
      </span>
    </button>

    <!-- Divider -->
    <div :style="{ height: '1px', background: 'var(--border-soft)', margin: '4px 0' }" />

    <!-- Sign out -->
    <button
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-2.5 text-left"
      :style="itemStyle"
      @click="signOut"
      @mouseenter="hoverItem($event, true)"
      @mouseleave="hoverItem($event, false)"
    >
      <Icon name="lucide:log-out" class="w-3.5 h-3.5" :style="{ color: 'var(--fg-3)' }" />
      <span :style="{ flex: 1 }">Sign out</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'
import { useClickOutside } from '~/composables/useClickOutside'

const emit = defineEmits<{
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const projectsStore = useProjectsStore()
const userStore = useUserStore()
const { isDark, toggleTheme } = useTheme()
const { logout, fetchProfile } = useAuth()
const toast = useToast()

const uploading = ref(false)

useClickOutside(menuRef, () => {
  if (uploading.value) return  // don't close while a background upload is in flight
  emit('close')
})

const itemStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--r-sm)',
  background: 'transparent',
  color: 'var(--fg)',
  fontSize: '13px',
  fontWeight: 500,
}

function hoverItem(e: MouseEvent, enter: boolean) {
  ;(e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-2)' : 'transparent'
}

function onViewProfile() {
  emit('close')
  console.log('[SidebarUserMenu] View profile — coming soon')
}

async function onAvatarChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = '' // reset so re-picking the same file works
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error('Avatar must be an image file')
    return
  }
  uploading.value = true
  const formData = new FormData()
  formData.append('file', file)
  try {
    const updated = await $fetch<any>('/api/auth/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData as any,
    })
    // Refresh the auth profile + mirror into userStore.currentUser
    if (updated) {
      userStore.currentUser = {
        ...userStore.currentUser,
        avatarUrl: updated.avatar_url ?? undefined,
      }
      await fetchProfile(true)
    }
    toast.success('Avatar updated')
  } catch (err: any) {
    toast.error('Couldn\'t update your avatar', { detail: err?.statusMessage || err?.message })
  } finally {
    uploading.value = false
    emit('close')
  }
}

async function signOut() {
  projectsStore.setActiveProject(projectsStore.projects[0]?.id ?? '')
  emit('close')
  await logout()
}
</script>
