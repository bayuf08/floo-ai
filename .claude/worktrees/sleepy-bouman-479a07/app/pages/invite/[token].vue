<template>
  <div
    class="min-h-screen flex items-center justify-center"
    :style="{ background: 'var(--bg)', color: 'var(--fg)', padding: '24px' }"
  >
    <div
      class="w-full max-w-md"
      :style="{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-lg)',
        padding: '36px 28px 32px',
      }"
    >
      <div class="flex flex-col items-center" :style="{ marginBottom: '20px' }">
        <img
          src="/images/floothink-icon-mark.png"
          alt="Floothink"
          :style="{ width: '40px', height: '40px', objectFit: 'contain', marginBottom: '14px' }"
        />
        <h1
          class="font-display"
          :style="{
            fontWeight: 800,
            fontSize: '20px',
            letterSpacing: '-0.02em',
            color: 'var(--fg)',
            marginBottom: '4px',
          }"
        >
          You've been invited
        </h1>
      </div>

      <!-- Loading -->
      <p v-if="loading" :style="bodyStyle">Looking up your invitation…</p>

      <!-- Error -->
      <div
        v-else-if="error"
        :style="{
          padding: '14px 16px',
          background: 'color-mix(in srgb, var(--ft-red) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--ft-red) 30%, transparent)',
          borderRadius: 'var(--r-md)',
          marginBottom: '14px',
        }"
      >
        <div :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--ft-red)', marginBottom: '4px' }">
          Couldn't open this invitation
        </div>
        <div :style="{ fontSize: '12.5px', color: 'var(--fg-2)', lineHeight: 1.55 }">{{ error }}</div>
      </div>

      <!-- Invite detail -->
      <template v-else-if="invite">
        <p :style="bodyStyle">
          <strong :style="{ color: 'var(--fg)', fontWeight: 600 }">
            {{ invite.inviter?.name ?? 'A collaborator' }}
          </strong>
          invited
          <strong :style="{ color: 'var(--fg)', fontWeight: 600 }">{{ invite.email }}</strong>
          to join the
          {{ invite.target_type }}
          <strong :style="{ color: 'var(--fg)', fontWeight: 600 }">"{{ invite.target?.name ?? 'a workspace' }}"</strong>
          as a
          <strong :style="{ color: 'var(--fg)', fontWeight: 600, textTransform: 'capitalize' }">{{ invite.role }}</strong>.
        </p>

        <!-- Already signed in with the right account -->
        <template v-if="canAccept">
          <button
            type="button"
            @click="onAccept"
            :disabled="accepting"
            :style="{
              width: '100%',
              padding: '12px 16px',
              background: 'var(--cta)',
              color: 'var(--cta-fg)',
              borderRadius: 'var(--r-md)',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: 'var(--shadow-xs)',
              opacity: accepting ? 0.7 : 1,
              cursor: accepting ? 'not-allowed' : 'pointer',
            }"
          >
            {{ accepting ? 'Joining…' : 'Accept invitation' }}
          </button>
        </template>

        <!-- Signed in with the wrong account -->
        <template v-else-if="profile && profile.email.toLowerCase() !== invite.email.toLowerCase()">
          <p
            :style="{
              fontSize: '12.5px',
              color: 'var(--ft-amber-deep)',
              background: 'var(--cta-tint)',
              padding: '10px 12px',
              borderRadius: 'var(--r-sm)',
              marginBottom: '14px',
            }"
          >
            You're signed in as <strong>{{ profile.email }}</strong>, but this invite is for
            <strong>{{ invite.email }}</strong>. Sign out and sign back in with the right account.
          </p>
          <button
            type="button"
            @click="signOutThenLogin"
            :style="{
              width: '100%',
              padding: '12px 16px',
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              color: 'var(--fg)',
              borderRadius: 'var(--r-md)',
              fontWeight: 600,
              fontSize: '14px',
            }"
          >
            Sign out and try again
          </button>
        </template>

        <!-- Not signed in -->
        <template v-else>
          <button
            type="button"
            @click="loginWithGoogle"
            :style="{
              width: '100%',
              padding: '12px 16px',
              background: 'var(--cta)',
              color: 'var(--cta-fg)',
              borderRadius: 'var(--r-md)',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: 'var(--shadow-xs)',
            }"
          >
            Continue with Google to accept
          </button>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  // The invite page itself is publicly viewable so unauthenticated visitors
  // can land here from the email link. The accept POST still requires auth.
  middleware: [],
})

useHead({ title: 'Invitation · Floo·Content' })

interface InviteInfo {
  email: string
  role: string
  target_type: 'workspace' | 'project'
  target: { id: string; name: string } | null
  inviter: { name: string; email: string } | null
  expires_at: string
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { profile, fetchProfile, loginWithGoogle, logout } = useAuth()

const token = String(route.params.token)

const loading = ref(true)
const error = ref<string | null>(null)
const invite = ref<InviteInfo | null>(null)
const accepting = ref(false)

const canAccept = computed(
  () => !!profile.value && !!invite.value &&
    profile.value.email.toLowerCase() === invite.value.email.toLowerCase()
)

const bodyStyle = {
  fontSize: '14px',
  color: 'var(--fg-2)',
  lineHeight: 1.6,
  marginBottom: '18px',
}

onMounted(async () => {
  // Refresh the profile silently so canAccept reflects the current session.
  fetchProfile().catch(() => {/* unauthenticated is fine — handled below */})

  try {
    invite.value = await $fetch<InviteInfo>(`/api/invites/${token}`)
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Could not load invitation.'
  } finally {
    loading.value = false
  }
})

async function onAccept() {
  if (!invite.value) return
  accepting.value = true
  try {
    const res = await $fetch<{ target_type: string; target_id: string }>(
      `/api/invites/${token}/accept`,
      { method: 'POST', credentials: 'include' }
    )
    toast.success('Joined!', { detail: `Welcome to ${invite.value.target?.name ?? 'the team'}.` })
    if (res.target_type === 'project') {
      await router.push(`/projects/${res.target_id}`)
    } else {
      await router.push('/projects')
    }
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Could not accept invitation.'
  } finally {
    accepting.value = false
  }
}

async function signOutThenLogin() {
  await logout()
  await loginWithGoogle()
}
</script>
