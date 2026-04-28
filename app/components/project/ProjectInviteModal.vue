<template>
  <AppDialog v-model="open" title="Project members">
    <!-- Tabs -->
    <div class="flex" :style="{ gap: '4px', marginBottom: '14px' }">
      <button
        v-for="t in tabs"
        :key="t.value"
        type="button"
        @click="activeTab = t.value"
        :style="tabStyle(t.value)"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Members tab -->
    <div v-if="activeTab === 'members'">
      <div
        v-for="m in members"
        :key="m.id"
        class="flex items-center"
        :style="{
          padding: '10px 0',
          borderBottom: '1px solid var(--border-soft)',
          gap: '10px',
        }"
      >
        <span
          class="flex items-center justify-center font-bold flex-shrink-0"
          :style="{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: `linear-gradient(135deg, ${m.avatarColor} 0%, color-mix(in srgb, ${m.avatarColor} 60%, var(--ft-amber)) 130%)`,
            color: 'white',
            fontSize: '11.5px',
          }"
        >{{ m.initials }}</span>
        <div class="flex-1 min-w-0">
          <div :style="{ display: 'flex', alignItems: 'center', gap: '6px' }">
            <span :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }">
              {{ m.name }}
            </span>
            <span
              v-if="m.id === currentUserId"
              :style="{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                background: 'var(--brand-tint)',
                color: 'var(--brand)',
                borderRadius: 'var(--r-pill)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }"
            >You</span>
          </div>
          <div :style="{ fontSize: '11.5px', color: 'var(--fg-3)' }">{{ m.email }}</div>
        </div>

        <!-- Role -->
        <select
          v-if="m.role !== 'owner'"
          :value="m.role"
          @change="changeRole(m.id, ($event.target as HTMLSelectElement).value as 'editor' | 'viewer')"
          :aria-label="`Change role for ${m.name}`"
          :style="{
            padding: '4px 8px',
            fontSize: '11.5px',
            fontWeight: 600,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            color: 'var(--fg)',
            outline: 'none',
            cursor: 'pointer',
          }"
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <span
          v-else
          :style="{
            padding: '4px 10px',
            fontSize: '11.5px',
            fontWeight: 700,
            background: 'var(--bg-2)',
            color: 'var(--fg-2)',
            borderRadius: 'var(--r-sm)',
          }"
        >Owner</span>

        <button
          type="button"
          :disabled="m.role === 'owner'"
          :aria-label="`Remove ${m.name}`"
          @click="removeMemberAction(m.id)"
          :style="{
            padding: '4px 8px',
            fontSize: '11.5px',
            fontWeight: 600,
            color: m.role === 'owner' ? 'var(--fg-3)' : 'var(--ft-red)',
            background: 'transparent',
            borderRadius: 'var(--r-sm)',
            cursor: m.role === 'owner' ? 'not-allowed' : 'pointer',
            opacity: m.role === 'owner' ? 0.5 : 1,
          }"
        >
          Remove
        </button>
      </div>
    </div>

    <!-- Invite tab -->
    <div v-else>
      <div :style="{ marginBottom: '12px' }">
        <label :style="labelStyle" for="invite-name">Name</label>
        <input
          id="invite-name"
          v-model="form.name"
          type="text"
          placeholder="e.g. Senja Larasati"
          :style="inputStyle"
        />
      </div>
      <div :style="{ marginBottom: '12px' }">
        <label :style="labelStyle" for="invite-email">Email</label>
        <input
          id="invite-email"
          v-model="form.email"
          type="email"
          placeholder="name@example.com"
          :style="inputStyle"
        />
        <p
          v-if="emailError"
          :style="{ fontSize: '11px', color: 'var(--ft-red)', marginTop: '4px' }"
        >{{ emailError }}</p>
      </div>
      <div :style="{ marginBottom: '12px' }">
        <span :style="labelStyle">Role</span>
        <div :style="{ display: 'flex', gap: '6px' }">
          <button
            v-for="r in ['editor', 'viewer'] as const"
            :key="r"
            type="button"
            @click="form.role = r"
            :style="roleBtnStyle(r)"
          >
            {{ r === 'editor' ? 'Editor' : 'Viewer' }}
            <span :style="{ display: 'block', fontSize: '10.5px', fontWeight: 500, color: 'var(--fg-3)', marginTop: '2px' }">
              {{ r === 'editor' ? 'Can chat and edit rules' : 'Read-only' }}
            </span>
          </button>
        </div>
      </div>

      <div
        v-if="successMessage"
        :style="{
          padding: '10px 12px',
          background: 'color-mix(in srgb, var(--ft-green) 12%, transparent)',
          color: 'var(--ft-green)',
          borderRadius: 'var(--r-sm)',
          fontSize: '12.5px',
          fontWeight: 600,
          marginBottom: '8px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }"
      >
        <Icon name="lucide:check" class="w-3.5 h-3.5" />
        {{ successMessage }}
      </div>
    </div>

    <template #footer="{ close }">
      <button
        type="button"
        @click="close"
        :style="{
          padding: '8px 16px',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--fg-2)',
          borderRadius: 'var(--r-md)',
        }"
      >
        Done
      </button>
      <button
        v-if="activeTab === 'invite'"
        type="button"
        @click="submitInvite"
        :disabled="!canSubmit"
        :style="{
          padding: '8px 16px',
          fontSize: '13px',
          fontWeight: 700,
          background: 'var(--cta)',
          color: 'var(--cta-fg)',
          borderRadius: 'var(--r-md)',
          opacity: canSubmit ? 1 : 0.5,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }"
      >
        Send invite
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  projectId: string
  initialTab?: 'members' | 'invite'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const projectsStore = useProjectsStore()
const userStore = useUserStore()

const tabs = [
  { value: 'members' as const, label: 'Members' },
  { value: 'invite' as const, label: 'Invite' },
]
const activeTab = ref<'members' | 'invite'>(props.initialTab ?? 'members')

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      activeTab.value = props.initialTab ?? 'members'
      successMessage.value = ''
    }
  }
)

const project = computed(() => projectsStore.projects.find((p) => p.id === props.projectId) ?? null)
const members = computed(() => project.value?.members ?? [])
const currentUserId = computed(() => userStore.currentUser.id)

const form = reactive<{ name: string; email: string; role: 'editor' | 'viewer' }>({
  name: '',
  email: '',
  role: 'editor',
})

const successMessage = ref('')

const emailError = computed(() => {
  const e = form.email.trim()
  if (!e) return ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'That email looks off — check the @ and the domain.'
  return ''
})

const canSubmit = computed(
  () => !!form.name.trim() && !!form.email.trim() && !emailError.value
)

async function submitInvite() {
  if (!canSubmit.value) return

  // Always update the local mock list for instant feedback / mock mode.
  const local = projectsStore.inviteMember(props.projectId, {
    name: form.name.trim(),
    email: form.email.trim(),
    role: form.role,
  })
  if (!local.ok && local.error) {
    useToast().warning(local.error)
    return
  }

  // Send the real invite email in backend mode (skipped in mock mode).
  if (!projectsStore.usingMocks && !props.projectId.startsWith('proj-pending-')) {
    try {
      const res = await $fetch<{ email_sent: boolean; email_mock?: boolean; accept_url: string }>(
        '/api/invites',
        {
          method: 'POST',
          credentials: 'include',
          body: {
            email: form.email.trim(),
            role: form.role,
            project_id: props.projectId,
          },
        }
      )
      if (res.email_mock) {
        useToast().info('Invite created (email mock — RESEND_API_KEY not set)', {
          detail: res.accept_url,
          durationMs: 8000,
        })
      } else if (res.email_sent) {
        useToast().success(`Invite email sent to ${form.email.trim()}`)
      } else {
        useToast().warning('Invite created but the email failed to send', {
          detail: res.accept_url
            ? `Share this link manually:\n${res.accept_url}`
            : 'Share the invite link manually if needed.',
          durationMs: 12000,
        })
      }
    } catch (err: any) {
      useToast().error('Couldn\'t create the invite', { detail: err?.statusMessage || err?.message })
      return
    }
  }

  successMessage.value = `${form.name.trim()} has been invited to this project.`
  form.name = ''
  form.email = ''
  form.role = 'editor'
  setTimeout(() => (successMessage.value = ''), 3000)
}

function changeRole(id: string, role: 'editor' | 'viewer') {
  projectsStore.updateMemberRole(props.projectId, id, role)
}

function removeMemberAction(id: string) {
  projectsStore.removeMember(props.projectId, id)
}

function tabStyle(value: 'members' | 'invite') {
  const active = value === activeTab.value
  return {
    padding: '8px 14px',
    fontSize: '12.5px',
    fontWeight: 600,
    color: active ? 'var(--brand)' : 'var(--fg-2)',
    background: active ? 'var(--brand-tint)' : 'transparent',
    borderRadius: 'var(--r-md)',
    transition: 'background 120ms var(--ease-out), color 120ms var(--ease-out)',
  }
}

function roleBtnStyle(value: 'editor' | 'viewer') {
  const active = form.role === value
  return {
    flex: 1,
    padding: '10px 12px',
    fontSize: '12.5px',
    fontWeight: 600,
    color: active ? 'var(--brand)' : 'var(--fg-2)',
    background: active ? 'var(--brand-tint)' : 'var(--surface)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
    borderRadius: 'var(--r-md)',
    textAlign: 'left' as const,
    transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
  }
}

const labelStyle = {
  display: 'block',
  fontSize: '11.5px',
  fontWeight: 600,
  color: 'var(--fg-2)',
  marginBottom: '4px',
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '13px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--fg)',
  outline: 'none',
}
</script>
