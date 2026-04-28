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

          <!-- Loading skeleton -->
          <div
            v-if="userStore.membersLoading"
            :style="{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              overflow: 'hidden',
            }"
          >
            <div
              v-for="i in 3"
              :key="i"
              class="flex items-center"
              :style="{
                padding: '14px 16px',
                borderBottom: i < 3 ? '1px solid var(--border-soft)' : 'none',
                gap: '12px',
              }"
            >
              <div
                :style="{
                  width: '36px', height: '36px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--bg-2)',
                  flexShrink: 0,
                }"
              />
              <div class="flex-1" :style="{ display: 'flex', flexDirection: 'column', gap: '6px' }">
                <div :style="{ height: '12px', width: '140px', background: 'var(--bg-2)', borderRadius: '4px' }" />
                <div :style="{ height: '10px', width: '180px', background: 'var(--bg-2)', borderRadius: '4px' }" />
              </div>
            </div>
          </div>

          <!-- Loaded member + pending-invite list (unified) -->
          <div
            v-else
            :style="{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              overflow: 'hidden',
            }"
          >
            <template v-for="(row, idx) in displayRows" :key="row.type === 'member' ? row.m.id : `inv-${row.inv.id}`">
              <!-- Confirmed member row -->
              <div
                v-if="row.type === 'member'"
                class="flex items-center"
                :style="{
                  padding: '14px 16px',
                  borderBottom: idx === displayRows.length - 1 ? 'none' : '1px solid var(--border-soft)',
                  gap: '12px',
                }"
              >
                <!-- Avatar -->
                <img
                  v-if="row.m.avatarUrl"
                  :src="row.m.avatarUrl"
                  :alt="row.m.name"
                  :style="{
                    width: '36px', height: '36px',
                    borderRadius: 'var(--r-md)',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }"
                />
                <div
                  v-else
                  class="flex items-center justify-center font-bold flex-shrink-0"
                  :style="{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--r-md)',
                    background: avatarColor(row.m.id),
                    color: 'white',
                    fontSize: '13px',
                  }"
                >
                  {{ row.m.initials }}
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div :style="{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }">
                    {{ row.m.name }}
                    <span
                      v-if="row.m.id === userStore.currentUser.id"
                      :style="{ fontSize: '11px', color: 'var(--fg-3)', fontWeight: 400, marginLeft: '4px' }"
                    >(you)</span>
                  </div>
                  <div :style="{ fontSize: '12px', color: 'var(--fg-3)' }">
                    {{ row.m.email }}
                  </div>
                </div>

                <!-- Role chip -->
                <span :style="roleChipStyle(row.m.role)">{{ capitalize(row.m.role) }}</span>

                <!-- Remove (hidden for owners and self) -->
                <button
                  v-if="row.m.role !== 'owner' && row.m.id !== userStore.currentUser.id"
                  type="button"
                  :aria-label="`Remove ${row.m.name}`"
                  @click="removeMember(row.m.id)"
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
                <span
                  v-else
                  :style="{ width: '62px', flexShrink: 0 }"
                />
              </div>

              <!-- Pending invite row -->
              <div
                v-else
                class="flex items-center"
                :style="{
                  padding: '14px 16px',
                  borderBottom: idx === displayRows.length - 1 ? 'none' : '1px solid var(--border-soft)',
                  gap: '12px',
                }"
              >
                <!-- Mail-icon avatar -->
                <span
                  class="flex items-center justify-center flex-shrink-0"
                  :style="{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--cta-tint)',
                    color: 'var(--ft-amber-deep)',
                  }"
                >
                  <Icon name="lucide:mail" class="w-4 h-4" />
                </span>

                <!-- Info: email + invited-by + expires -->
                <div class="flex-1 min-w-0">
                  <div :style="{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }">
                    {{ row.inv.email }}
                  </div>
                  <div :style="{ fontSize: '12px', color: 'var(--fg-3)' }">
                    Invited by {{ row.inv.inviter?.name ?? 'someone' }} · expires {{ relativeTime(row.inv.expires_at) }}
                  </div>
                </div>

                <!-- Role chip -->
                <span :style="roleChipStyle(row.inv.role)">{{ capitalize(row.inv.role) }}</span>

                <!-- Pending status pill -->
                <span :style="pendingChipStyle">Pending</span>

                <!-- Revoke -->
                <button
                  type="button"
                  :aria-label="`Revoke invite for ${row.inv.email}`"
                  @click="revokeInvite(row.inv.id)"
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
                  Revoke
                </button>
              </div>
            </template>

            <p
              v-if="displayRows.length === 0"
              :style="{ padding: '24px', textAlign: 'center', color: 'var(--fg-3)', fontSize: '13px', fontStyle: 'italic' }"
            >
              No members yet. Invite one to get started.
            </p>
          </div>
        </section>

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
        <div :style="fieldGroupStyle">
          <label for="invite-email" :style="labelStyle">Email address</label>
          <input
            id="invite-email"
            v-model="inviteEmail"
            type="email"
            required
            placeholder="name@example.com"
            :style="inputStyle"
          />
        </div>

        <div :style="fieldGroupStyle">
          <span :style="labelStyle">Role</span>
          <div class="flex gap-2">
            <button
              v-for="r in (['editor', 'viewer'] as const)"
              :key="r"
              type="button"
              @click="inviteRole = r"
              :style="roleToggleStyle(r)"
            >
              {{ capitalize(r) }}
            </button>
          </div>
          <p :style="{ marginTop: '6px', fontSize: '11.5px', color: 'var(--fg-3)' }">
            {{ inviteRole === 'editor' ? 'Can create and edit content in this workspace.' : 'Can view content but cannot make changes.' }}
          </p>
        </div>
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

// ── Tab navigation ────────────────────────────────────────────────────────────

type Tab = 'general' | 'members' | 'danger'
const tab = ref<Tab>('general')
const tabs: { value: Tab; label: string; icon: string }[] = [
  { value: 'general', label: 'General', icon: 'lucide:settings' },
  { value: 'members', label: 'Members', icon: 'lucide:users' },
  { value: 'danger', label: 'Danger zone', icon: 'lucide:alert-triangle' },
]

// ── General tab ───────────────────────────────────────────────────────────────

const form = reactive({
  name: userStore.activeWorkspace?.name ?? '',
  defaultPlatform: (userStore.activeWorkspace?.defaultPlatform ?? 'tiktok') as Platform,
  description: userStore.activeWorkspace?.description ?? '',
})

const savedFlash = ref(false)

// Keep the form in sync whenever the active workspace changes (e.g. user
// switches workspaces while the settings page is open).
watch(
  () => userStore.activeWorkspace,
  (ws) => {
    if (ws) {
      form.name = ws.name
      form.defaultPlatform = (ws.defaultPlatform ?? 'tiktok') as Platform
      form.description = ws.description ?? ''
    }
  },
  { immediate: true },
)

async function saveGeneral() {
  const id = userStore.activeWorkspace?.id
  if (!id) return
  await userStore.updateWorkspace(id, {
    name: form.name.trim() || userStore.activeWorkspace?.name,
    defaultPlatform: form.defaultPlatform,
    description: form.description || undefined,
  })
  savedFlash.value = true
  setTimeout(() => (savedFlash.value = false), 2000)
}

// ── Members tab ───────────────────────────────────────────────────────────────

// Pending invites are merged into the same list as confirmed members so
// users can see at a glance who is invited but hasn't joined yet — and so
// they don't accidentally try to re-invite someone who already has a
// pending invite (which the API would 409 on anyway).
interface PendingInvite {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
  accepted_at: string | null
  inviter: { name?: string; email?: string } | null
}

const pendingInvites = ref<PendingInvite[]>([])

async function loadPendingInvites() {
  const wsId = userStore.activeWorkspace?.id
  if (!wsId) {
    pendingInvites.value = []
    return
  }
  try {
    pendingInvites.value = await $fetch<PendingInvite[]>(
      `/api/invites?workspace=${wsId}`,
      { credentials: 'include' },
    )
  } catch (err: any) {
    pendingInvites.value = []
    console.warn('[settings] loadPendingInvites failed', err)
  }
}

async function revokeInvite(id: string) {
  const previous = pendingInvites.value
  pendingInvites.value = pendingInvites.value.filter((i) => i.id !== id)
  try {
    await $fetch(`/api/invites/by-id/${id}`, { method: 'DELETE', credentials: 'include' })
    useToast().success('Invite revoked')
  } catch (err: any) {
    pendingInvites.value = previous // rollback
    useToast().error('Couldn\'t revoke invite', { detail: err?.statusMessage || err?.message })
  }
}

// Unified list — members first, then pending invites. Each row carries a
// discriminator so the template can branch on display + actions.
type DisplayRow =
  | { type: 'member'; m: typeof userStore.workspaceMembers[number] }
  | { type: 'invite'; inv: PendingInvite }

const displayRows = computed<DisplayRow[]>(() => [
  ...userStore.workspaceMembers.map((m) => ({ type: 'member' as const, m })),
  ...pendingInvites.value.map((inv) => ({ type: 'invite' as const, inv })),
])

// Load members + pending invites when the Members tab is opened or the
// active workspace changes.
watch(
  [tab, () => userStore.activeWorkspace?.id],
  ([t, wsId]) => {
    if (t === 'members' && wsId) {
      if (!userStore.usingMocks) {
        userStore.loadWorkspaceMembers(wsId)
        loadPendingInvites()
      } else {
        // Populate with mock members when in mock mode so the tab isn't empty
        userStore.workspaceMembers.splice(0, userStore.workspaceMembers.length,
          { id: 'user-1', name: 'Rara Anjani', email: 'rara@floothink.com', initials: 'RA', role: 'owner' },
          { id: 'user-2', name: 'Bayu Pratama', email: 'bayu@floothink.com', initials: 'BP', role: 'editor' },
          { id: 'user-3', name: 'Senja Larasati', email: 'senja@floothink.com', initials: 'SL', role: 'viewer' },
        )
        pendingInvites.value = []
      }
    }
  },
  { immediate: true },
)

const inviteOpen = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<'editor' | 'viewer'>('editor')

async function addMember() {
  const email = inviteEmail.value.trim()
  const wsId = userStore.activeWorkspace?.id
  if (!email || !wsId) return

  const result = await userStore.inviteWorkspaceMember(wsId, email, inviteRole.value)

  if (result) {
    if (result.email_mock) {
      useToast().info('Invite created', {
        detail: 'Email logged to console — set NUXT_PUBLIC_APP_URL + RESEND_API_KEY to send real emails.',
      })
    } else if (result.email_sent) {
      useToast().success('Invite sent!', { detail: `An invitation email is on its way to ${email}.` })
    } else {
      // Invite row created but email delivery failed — surface the accept URL
      // so the inviter can share the link manually (useful in dev / no domain).
      const linkHint = result.accept_url
        ? `Share this link manually:\n${result.accept_url}`
        : 'Share the invite link manually if needed.'
      useToast().warning('Invite created, but email failed to send', {
        detail: result.email_error
          ? `${result.email_error}\n\n${linkHint}`
          : linkHint,
        durationMs: 12000,
      })
    }

    // Only refresh on success — on a 409 (duplicate / already member) the
    // store surfaces an error toast and we shouldn't re-fetch unnecessarily.
    await loadPendingInvites()
  }

  inviteEmail.value = ''
  inviteRole.value = 'editor'
  inviteOpen.value = false
}

// Compact relative-time helper for "expires in N days".
function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const days = Math.ceil(diff / 86_400_000)
  if (days <= 1) return 'today'
  if (days <= 30) return `in ${days} day${days === 1 ? '' : 's'}`
  return `in ${Math.ceil(days / 7)} weeks`
}

async function removeMember(userId: string) {
  const wsId = userStore.activeWorkspace?.id
  if (!wsId) return
  await userStore.removeWorkspaceMember(wsId, userId)
}

// Deterministic avatar colour based on user id (same palette across sessions)
const avatarPalette = ['#5B479D', '#FBB040', '#4DAF4E', '#4B70B6', '#E8645A', '#E1306C', '#FBE225']
function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return avatarPalette[hash % avatarPalette.length]!
}

// ── Danger zone ───────────────────────────────────────────────────────────────

const deleteOpen = ref(false)
const deleteConfirm = ref('')
const canDelete = computed(
  () => deleteConfirm.value.trim() === (userStore.activeWorkspace?.name ?? ''),
)

function closeDeleteDialog(close: () => void) {
  deleteConfirm.value = ''
  close()
}

async function doDelete(close: () => void) {
  if (!canDelete.value || !userStore.activeWorkspace?.id) return
  const ok = await userStore.deleteWorkspace(userStore.activeWorkspace.id)
  // Only navigate away if the deletion actually succeeded — otherwise the
  // workspace is still present on the server and the user would be confused
  // by the redirect with no real change. The store surfaces a toast on error.
  if (!ok) return
  deleteConfirm.value = ''
  close()
  router.push('/')
}

// ── Platform options ──────────────────────────────────────────────────────────

const platformOptions: { value: Platform; label: string; icon: string }[] = [
  { value: 'tiktok',    label: 'TikTok',    icon: 'simple-icons:tiktok' },
  { value: 'instagram', label: 'Instagram', icon: 'simple-icons:instagram' },
  { value: 'twitter',   label: 'X',         icon: 'simple-icons:x' },
  { value: 'youtube',   label: 'YouTube',   icon: 'simple-icons:youtube' },
  { value: 'linkedin',  label: 'LinkedIn',  icon: 'simple-icons:linkedin' },
  { value: 'threads',   label: 'Threads',   icon: 'simple-icons:threads' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  const isOwner = role === 'owner'
  return {
    padding: '2px 10px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: 'var(--r-pill)',
    background: isOwner ? 'var(--brand-tint)' : 'var(--bg-2)',
    color: isOwner ? 'var(--brand)' : 'var(--fg-2)',
    border: `1px solid ${isOwner ? 'color-mix(in srgb, var(--brand) 18%, transparent)' : 'var(--border)'}`,
    whiteSpace: 'nowrap' as const,
  }
}

// Status pill for pending invite rows. Amber-tinted to distinguish from
// the role chip and signal "in-progress / awaiting acceptance".
const pendingChipStyle = {
  padding: '2px 10px',
  fontSize: '11px',
  fontWeight: 700,
  borderRadius: 'var(--r-pill)',
  background: 'var(--cta-tint)',
  color: 'var(--ft-amber-deep)',
  border: '1px solid color-mix(in srgb, var(--ft-amber-deep) 18%, transparent)',
  whiteSpace: 'nowrap' as const,
}

function roleToggleStyle(role: 'editor' | 'viewer') {
  const active = inviteRole.value === role
  return {
    padding: '7px 16px',
    fontSize: '12px',
    fontWeight: 600,
    borderRadius: 'var(--r-md)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
    background: active ? 'var(--brand-tint)' : 'var(--surface)',
    color: active ? 'var(--brand)' : 'var(--fg-2)',
    cursor: 'pointer',
    transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
  }
}

function hoverRemove(e: MouseEvent, enter: boolean) {
  const el = e.currentTarget as HTMLElement
  el.style.background = enter ? 'color-mix(in srgb, var(--ft-red) 12%, transparent)' : 'transparent'
  el.style.color = enter ? 'var(--ft-red)' : 'var(--fg-3)'
}
</script>
