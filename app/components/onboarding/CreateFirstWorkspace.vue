<template>
  <div
    class="flex items-center justify-center w-screen h-screen overflow-y-auto"
    :style="{ background: 'var(--bg)', color: 'var(--fg)' }"
  >
    <!-- Sign-out escape hatch in the corner so a user who landed here by mistake
         (e.g. wrong account) can recover without being trapped. -->
    <button
      type="button"
      @click="onSignOut"
      :style="signOutBtnStyle"
    >
      <Icon name="lucide:log-out" class="w-3.5 h-3.5" :style="{ marginRight: '6px' }" />
      Sign out
    </button>

    <div :style="cardStyle">
      <div class="flex justify-center" :style="{ marginBottom: '20px' }">
        <FtComposition :size="96" />
      </div>

      <h1 class="font-display" :style="titleStyle">Create your workspace</h1>
      <p :style="subtitleStyle">
        Workspaces group your projects and brand context. You can create more later
        from the sidebar.
      </p>

      <form @submit.prevent="onSubmit">
        <div :style="fieldGroupStyle">
          <label for="ws-name" :style="labelStyle">Workspace name</label>
          <input
            id="ws-name"
            ref="nameInput"
            v-model="form.name"
            type="text"
            required
            maxlength="120"
            placeholder="e.g. Floothink Marketing"
            :style="inputStyle"
            :disabled="submitting"
          />
        </div>

        <div :style="fieldGroupStyle">
          <label for="ws-desc" :style="labelStyle">
            Description
            <span :style="optionalHintStyle">(optional)</span>
          </label>
          <textarea
            id="ws-desc"
            v-model="form.description"
            rows="3"
            maxlength="500"
            placeholder="A short note on what this workspace is for."
            :style="{ ...inputStyle, resize: 'none', fontFamily: 'var(--font-editorial)', lineHeight: 1.55 }"
            :disabled="submitting"
          />
        </div>

        <button
          type="submit"
          :disabled="!canSubmit"
          :style="primaryBtnStyle(canSubmit)"
        >
          {{ submitting ? 'Creating…' : 'Create workspace' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Full-screen onboarding shown when the authenticated user has zero workspaces.
 * Bypasses the normal sidebar/right-panel shell — this component owns the
 * viewport. Once `userStore.createWorkspace` resolves, the layout's
 * `noWorkspace` gate flips and the rest of the app appears.
 */
const userStore = useUserStore()
const { logout } = useAuth()
const toast = useToast()

const form = reactive({
  name: '',
  description: '',
})

const submitting = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)

const canSubmit = computed(() => form.name.trim().length > 0 && !submitting.value)

onMounted(() => {
  // Autofocus the name field — the only thing the user has to do here.
  nameInput.value?.focus()
})

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    await userStore.createWorkspace({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      activate: true,
    })
  } catch (err: any) {
    toast.error('Couldn\'t create workspace', {
      detail: err?.statusMessage || err?.data?.statusMessage || err?.message,
    })
  } finally {
    submitting.value = false
  }
}

async function onSignOut() {
  await logout()
}

// ── Styles ──────────────────────────────────────────────────────────────────

const cardStyle = {
  width: 'min(100%, 480px)',
  margin: '32px',
  padding: '40px 36px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-lg)',
  boxShadow: 'var(--shadow-md)',
}

const titleStyle = {
  fontWeight: 700,
  fontSize: '24px',
  letterSpacing: '-0.015em',
  color: 'var(--fg)',
  textAlign: 'center' as const,
  marginBottom: '8px',
}

const subtitleStyle = {
  fontSize: '13.5px',
  color: 'var(--fg-2)',
  lineHeight: 1.55,
  textAlign: 'center' as const,
  marginBottom: '28px',
}

const fieldGroupStyle = {
  marginBottom: '16px',
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--fg-2)',
  marginBottom: '6px',
}

const optionalHintStyle = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--fg-3)',
  marginLeft: '4px',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  fontSize: '14px',
  color: 'var(--fg)',
  outline: 'none',
}

function primaryBtnStyle(enabled: boolean) {
  return {
    width: '100%',
    marginTop: '8px',
    padding: '11px 16px',
    fontSize: '13.5px',
    fontWeight: 700,
    background: 'var(--cta)',
    color: 'var(--cta-fg)',
    borderRadius: 'var(--r-md)',
    boxShadow: 'var(--shadow-xs)',
    opacity: enabled ? 1 : 0.5,
    cursor: enabled ? 'pointer' : 'not-allowed',
    transition: 'opacity 120ms var(--ease-out)',
  }
}

const signOutBtnStyle = {
  position: 'fixed' as const,
  top: '20px',
  right: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 12px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--fg-3)',
  background: 'transparent',
  borderRadius: 'var(--r-md)',
  transition: 'color 120ms var(--ease-out)',
}
</script>
