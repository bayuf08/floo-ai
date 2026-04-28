<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Page header -->
    <header
      class="flex-shrink-0"
      :style="{
        padding: '28px 40px 18px',
        borderBottom: '1px solid var(--border-soft)',
        background: 'var(--bg)',
      }"
    >
      <h1
        class="font-display"
        :style="{
          fontWeight: 700,
          fontSize: '24px',
          letterSpacing: '-0.015em',
          color: 'var(--fg)',
          marginBottom: '4px',
        }"
      >
        Workspace settings
      </h1>
      <p :style="{ fontSize: '13.5px', color: 'var(--fg-2)' }">
        Manage <strong :style="{ fontWeight: 600 }">{{ userStore.activeWorkspace?.name }}</strong> —
        general info, members, and danger zone.
      </p>
    </header>

    <!-- Body: tabs + content -->
    <div class="flex-1 flex min-h-0 overflow-hidden md:flex-row flex-col">
      <!-- Tab nav (vertical on desktop, horizontal on mobile) -->
      <nav
        class="md:flex-shrink-0 md:w-56 md:border-r md:border-b-0"
        :style="{
          padding: '20px 16px',
          borderRight: undefined,
          borderBottom: '1px solid var(--border-soft)',
        }"
      >
        <ul
          class="md:flex-col md:gap-0.5"
          :style="{ display: 'flex', gap: '4px', listStyle: 'none', margin: 0, padding: 0 }"
        >
          <li v-for="t in tabs" :key="t.value">
            <button
              type="button"
              @click="tab = t.value"
              class="w-full flex items-center gap-2.5"
              :style="tabBtnStyle(t.value)"
            >
              <Icon :name="t.icon" class="w-3.5 h-3.5" />
              <span>{{ t.label }}</span>
            </button>
          </li>
        </ul>
      </nav>

      <!-- Tab content -->
      <div class="flex-1 overflow-y-auto custom-scrollbar" :style="{ padding: '24px 40px 40px' }">
        <!-- General tab -->
        <section v-if="tab === 'general'" :style="{ maxWidth: '640px' }">
          <h2 :style="sectionHeadingStyle">General</h2>

          <div :style="fieldGroupStyle">
            <label for="ws-name" :style="labelStyle">Workspace name</label>
            <input
              id="ws-name"
              v-model="form.name"
              type="text"
              :style="inputStyle"
            />
          </div>

          <div :style="fieldGroupStyle">
            <span :style="labelStyle">Default platform</span>
            <div class="grid grid-cols-3" :style="{ gap: '8px' }">
              <button
                v-for="p in platformOptions"
                :key="p.value"
                type="button"
                @click="form.defaultPlatform = p.value"
                class="flex items-center justify-center gap-1.5"
                :style="platformChipStyle(p.value)"
              >
                <Icon :name="p.icon" class="w-3.5 h-3.5" />
                {{ p.label }}
              </button>
            </div>
          </div>

          <div :style="fieldGroupStyle">
            <label for="ws-desc" :style="labelStyle">Description</label>
            <textarea
              id="ws-desc"
              v-model="form.description"
              rows="3"
              :style="{ ...inputStyle, resize: 'none', fontFamily: 'var(--font-editorial)', fontSize: '14px', lineHeight: 1.55 }"
            />
          </div>

          <div class="flex items-center gap-3" :style="{ marginTop: '12px' }">
            <button
              type="button"
              @click="saveGeneral"
              :style="primaryBtnStyle"
            >
              Save changes
            </button>
            <span
              v-if="savedFlash"
              :style="{
                fontSize: '12.5px',
                color: 'var(--ft-green)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }"
            >
              <Icon name="lucide:check" class="w-3.5 h-3.5" />
              Saved
            </span>
          </div>
        </section>

        <!-- Members tab -->
        <section v-if="tab === 'members'" :style="{ maxWidth: '720px' }">
          <div class="flex items-center justify-between" :style="{ marginBottom: '16px' }">
            <h2 :style="sectionHeadingStyle">Members</h2>
            <button
              type="button"
              @click="inviteOpen = true"
              class="inline-flex items-center gap-1.5"
              :style="{ ...primaryBtnStyle, padding: '8px 14px' }"
            >
              <Icon name="lucide:plus" class="w-3.5 h-3.5" />
              Invite member
            </button>
          </div>

          <div
            :style="{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              overflow: 'hidden',
            }"
          >
            <div
              v-for="(m, idx) in members"
              :key="m.id"
              class="flex items-center"
              :style="{
                padding: '14px 16px',
                borderBottom: idx === members.length - 1 ? 'none' : '1px solid var(--border-soft)',
                gap: '12px',
              }"
            >
              <div
                class="flex items-center justify-center font-bold flex-shrink-0"
                :style="{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--r-md)',
                  background: m.color,
                  color: 'white',
                  fontSize: '13px',
                }"
              >
                {{ m.initials }}
              </div>
              <div class="flex-1 min-w-0">
                <div :style="{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }">
                  {{ m.name }}
                </div>
                <div :style="{ fontSize: '12px', color: 'var(--fg-3)' }">
                  {{ m.email }}
                </div>
              </div>
              <span :style="roleChipStyle(m.role)">{{ m.role }}</span>
              <button
                type="button"
                :aria-label="`Remove ${m.name}`"
                @click="removeMember(m.id)"
                :style="{
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--fg-3)',
                  borderRadius: 'var(--r-sm)',
                  transition: 'background 120ms var(--ease-out), color 120ms var(--ease-out)',
                }"
                @mouseenter="hoverRemove($event, true)"
                @mouseleave="hoverRemove($event, false)"
              >
                Remove
              </button>
            </div>
            <p
              v-if="members.length === 0"
              :style="{ padding: '24px', textAlign: 'center', color: 'var(--fg-3)', fontSize: '13px', fontStyle: 'italic' }"
            >
              No members yet. Invite one to get started.
            </p>
          </div>

          <!-- Pending invites for this workspace -->
          <PendingInvitesList
            v-if="userStore.activeWorkspace?.id"
            :workspace-id="userStore.activeWorkspace.id"
          />
        </section>

        <!-- Billing tab -->
        <SettingsBillingTab
          v-if="tab === 'billing' && userStore.activeWorkspace?.id"
          :workspace-id="userStore.activeWorkspace.id"
        />

        <!-- Danger Zone tab -->
        <section v-if="tab === 'danger'" :style="{ maxWidth: '640px' }">
          <h2 :style="sectionHeadingStyle">Danger zone</h2>

          <div
            :style="{
              background: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--ft-red) 30%, transparent)',
              borderRadius: 'var(--r-md)',
              padding: '20px',
            }"
          >
            <h3
              class="font-display"
              :style="{ fontWeight: 700, fontSize: '15px', color: 'var(--fg)', marginBottom: '4px' }"
            >
              Delete this workspace
            </h3>
            <p :style="{ fontSize: '13px', color: 'var(--fg-2)', lineHeight: 1.55, marginBottom: '14px' }">
              Permanently remove
              <strong :style="{ color: 'var(--fg)', fontWeight: 600 }">{{ userStore.activeWorkspace?.name }}</strong>
              and all of its projects, skills, and rules. This action cannot be undone.
            </p>
            <button
              type="button"
              @click="deleteOpen = true"
              :style="{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                background: 'var(--ft-red)',
                color: 'white',
                borderRadius: 'var(--r-md)',
                transition: 'opacity 120ms var(--ease-out)',
              }"
              @mouseenter="(($event.currentTarget as HTMLElement).style.opacity = '0.9')"
              @mouseleave="(($event.currentTarget as HTMLElement).style.opacity = '1')"
            >
              Delete workspace
            </button>
          </div>
        </section>
      </div>
    </div>

    <!-- Invite member dialog -->
    <AppDialog v-model="inviteOpen" title="Invite member">
      <form @submit.prevent="addMember">
        <label for="invite-email" :style="labelStyle">Email address</label>
        <input
          id="invite-email"
          v-model="inviteEmail"
          type="email"
          required
          placeholder="name@example.com"
          :style="inputStyle"
        />
      </form>
      <template #footer="{ close }">
        <button
          type="button"
          @click="close"
          :style="{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--fg-2)', borderRadius: 'var(--r-md)' }"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="addMember"
          :disabled="!inviteEmail.trim()"
          :style="{
            ...primaryBtnStyle,
            opacity: inviteEmail.trim() ? 1 : 0.5,
            cursor: inviteEmail.trim() ? 'pointer' : 'not-allowed',
          }"
        >
          Send invite
        </button>
      </template>
    </AppDialog>

    <!-- Delete workspace dialog (typed-confirm) -->
    <AppDialog v-model="deleteOpen" title="Delete workspace?">
      <p :style="{ fontSize: '14px', color: 'var(--fg-2)', lineHeight: 1.55, marginBottom: '14px' }">
        Type
        <strong :style="{ color: 'var(--fg)', fontWeight: 700 }">{{ userStore.activeWorkspace?.name }}</strong>
        to confirm. This cannot be undone.
      </p>
      <input
        v-model="deleteConfirm"
        type="text"
        :placeholder="userStore.activeWorkspace?.name"
        :style="inputStyle"
      />
      <template #footer="{ close }">
        <button
          type="button"
          @click="closeDeleteDialog(close)"
          :style="{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--fg-2)', borderRadius: 'var(--r-md)' }"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="doDelete(close)"
          :disabled="!canDelete"
          :style="{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            background: 'var(--ft-red)',
            color: 'white',
            borderRadius: 'var(--r-md)',
            opacity: canDelete ? 1 : 0.5,
            cursor: canDelete ? 'pointer' : 'not-allowed',
          }"
        >
          Delete forever
        </button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup lang="ts">
import type { Platform } from '~/types/project'

useHead({ title: 'Workspace settings · Floo·Content' })

const userStore = useUserStore()
const router = useRouter()

type Tab = 'general' | 'members' | 'billing' | 'danger'
const tab = ref<Tab>('general')
const tabs: { value: Tab; label: string; icon: string }[] = [
  { value: 'general', label: 'General', icon: 'lucide:settings' },
  { value: 'members', label: 'Members', icon: 'lucide:users' },
  { value: 'billing', label: 'Billing', icon: 'lucide:credit-card' },
  { value: 'danger', label: 'Danger zone', icon: 'lucide:alert-triangle' },
]

// Auto-open Billing tab when Stripe redirects back with ?billing=success|cancel
const _settingsRoute = useRoute()
if (_settingsRoute.query.billing === 'success' || _settingsRoute.query.billing === 'cancel') {
  tab.value = 'billing'
}

// General tab state
const form = reactive({
  name: userStore.activeWorkspace?.name ?? '',
  defaultPlatform: 'tiktok' as Platform,
  description: '',
})
const savedFlash = ref(false)

watch(
  () => userStore.activeWorkspace?.name,
  (n) => { if (n) form.name = n }
)

async function saveGeneral() {
  const trimmed = form.name.trim() || userStore.activeWorkspace?.name
  if (userStore.activeWorkspace) {
    userStore.activeWorkspace.name = trimmed!
  }

  // Mirror to backend when not in mock mode
  if (!userStore.usingMocks && userStore.activeWorkspace?.id) {
    try {
      await $fetch(`/api/workspaces/${userStore.activeWorkspace.id}`, {
        method: 'PATCH',
        credentials: 'include',
        body: {
          name: trimmed,
          default_platform: form.defaultPlatform,
          description: form.description || null,
        },
      })
    } catch (err: any) {
      useToast().error('Couldn\'t save workspace settings', { detail: err?.statusMessage || err?.message })
      return
    }
  }

  savedFlash.value = true
  setTimeout(() => (savedFlash.value = false), 2000)
}

// Members tab state
type Member = { id: string; name: string; email: string; initials: string; role: string; color: string }
const members = ref<Member[]>([
  { id: 'm-1', name: 'Rara Anjani', email: 'rara@floothink.com', initials: 'RA', role: 'Owner', color: '#5B479D' },
  { id: 'm-2', name: 'Bayu Pratama', email: 'bayu@floothink.com', initials: 'BP', role: 'Editor', color: '#FBB040' },
  { id: 'm-3', name: 'Senja Larasati', email: 'senja@floothink.com', initials: 'SL', role: 'Viewer', color: '#4DAF4E' },
])

const inviteOpen = ref(false)
const inviteEmail = ref('')

function addMember() {
  const email = inviteEmail.value.trim()
  if (!email) return
  const namePart = email.split('@')[0]?.replace(/[._-]/g, ' ') ?? 'New member'
  const initials = namePart
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
  const palette = ['#5B479D', '#FBB040', '#4DAF4E', '#4B70B6', '#E8645A']
  members.value.push({
    id: `m-${Date.now()}`,
    name: namePart.replace(/\b\w/g, (c) => c.toUpperCase()),
    email,
    initials: initials || '??',
    role: 'Editor',
    color: palette[members.value.length % palette.length]!,
  })
  inviteEmail.value = ''
  inviteOpen.value = false
}

function removeMember(id: string) {
  members.value = members.value.filter((m) => m.id !== id)
}

// Danger zone state
const deleteOpen = ref(false)
const deleteConfirm = ref('')
const canDelete = computed(
  () => deleteConfirm.value.trim() === (userStore.activeWorkspace?.name ?? '')
)

function closeDeleteDialog(close: () => void) {
  deleteConfirm.value = ''
  close()
}

function doDelete(close: () => void) {
  if (!canDelete.value) return
  // Remove the active workspace from the list and switch to the next one
  const idx = userStore.workspaces.findIndex((w) => w.id === userStore.activeWorkspace?.id)
  if (idx >= 0) userStore.workspaces.splice(idx, 1)
  const next = userStore.workspaces[0]
  if (next) userStore.setActiveWorkspace(next)
  deleteConfirm.value = ''
  close()
  router.push('/')
}

// Platform options for the General tab
const platformOptions: { value: Platform; label: string; icon: string }[] = [
  { value: 'tiktok', label: 'TikTok', icon: 'simple-icons:tiktok' },
  { value: 'instagram', label: 'Instagram', icon: 'simple-icons:instagram' },
  { value: 'twitter', label: 'X', icon: 'simple-icons:x' },
  { value: 'youtube', label: 'YouTube', icon: 'simple-icons:youtube' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'simple-icons:linkedin' },
  { value: 'threads', label: 'Threads', icon: 'simple-icons:threads' },
]

// Styles
const sectionHeadingStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '18px',
  letterSpacing: '-0.01em',
  color: 'var(--fg)',
  marginBottom: '16px',
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--fg-2)',
  marginBottom: '6px',
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  fontSize: '14px',
  color: 'var(--fg)',
  outline: 'none',
}

const fieldGroupStyle = {
  marginBottom: '16px',
}

const primaryBtnStyle = {
  padding: '10px 16px',
  fontSize: '13px',
  fontWeight: 700,
  background: 'var(--cta)',
  color: 'var(--cta-fg)',
  borderRadius: 'var(--r-md)',
  boxShadow: 'var(--shadow-xs)',
  transition: 'opacity 120ms var(--ease-out)',
}

function tabBtnStyle(value: Tab) {
  const active = value === tab.value
  return {
    padding: '8px 12px',
    borderRadius: 'var(--r-md)',
    fontSize: '13px',
    fontWeight: 500,
    color: active ? 'var(--fg)' : 'var(--fg-2)',
    background: active ? 'var(--brand-tint)' : 'transparent',
    transition: 'background 120ms var(--ease-out)',
    textAlign: 'left' as const,
  }
}

function platformChipStyle(value: Platform) {
  const active = form.defaultPlatform === value
  return {
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    borderRadius: 'var(--r-md)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
    background: active ? 'var(--brand-tint)' : 'var(--surface)',
    color: active ? 'var(--brand)' : 'var(--fg-2)',
    transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
  }
}

function roleChipStyle(role: string) {
  const isOwner = role === 'Owner'
  return {
    padding: '2px 10px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: 'var(--r-pill)',
    background: isOwner ? 'var(--brand-tint)' : 'var(--bg-2)',
    color: isOwner ? 'var(--brand)' : 'var(--fg-2)',
    border: `1px solid ${isOwner ? 'color-mix(in srgb, var(--brand) 18%, transparent)' : 'var(--border)'}`,
  }
}

function hoverRemove(e: MouseEvent, enter: boolean) {
  const el = e.currentTarget as HTMLElement
  el.style.background = enter ? 'color-mix(in srgb, var(--ft-red) 12%, transparent)' : 'transparent'
  el.style.color = enter ? 'var(--ft-red)' : 'var(--fg-3)'
}
</script>
