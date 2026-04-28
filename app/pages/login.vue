<template>
  <div
    class="min-h-screen flex items-center justify-center"
    :style="{ background: 'var(--bg)', color: 'var(--fg)', padding: '24px' }"
  >
    <div
      class="w-full max-w-sm"
      :style="{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-lg)',
        padding: '36px 28px 32px',
      }"
    >
      <!-- Brand -->
      <div class="flex flex-col items-center" :style="{ marginBottom: '28px' }">
        <img
          src="/images/floothink-icon-mark.png"
          alt="Floothink"
          :style="{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '14px' }"
        />
        <h1
          class="font-display"
          :style="{
            fontWeight: 800,
            fontSize: '24px',
            letterSpacing: '-0.02em',
            color: 'var(--fg)',
            marginBottom: '6px',
          }"
        >
          Floo<span :style="{ color: 'var(--brand)' }">·</span>Content
        </h1>
        <p
          :style="{
            fontFamily: 'var(--font-editorial)',
            fontSize: '13.5px',
            color: 'var(--fg-2)',
            textAlign: 'center',
            lineHeight: 1.5,
          }"
        >
          AI-powered social media content<br />by Floothink
        </p>
      </div>

      <!-- Google CTA -->
      <button
        type="button"
        @click="onLogin"
        :disabled="busy"
        class="w-full inline-flex items-center justify-center"
        :style="{
          gap: '10px',
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-md)',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--fg)',
          boxShadow: 'var(--shadow-xs)',
          transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out)',
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }"
        @mouseenter="hoverBtn($event, true)"
        @mouseleave="hoverBtn($event, false)"
      >
        <!-- Google G logo -->
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        <span>{{ busy ? 'Redirecting…' : 'Continue with Google' }}</span>
      </button>


      <!-- Footer note -->
      <p
        :style="{
          marginTop: '24px',
          fontSize: '11.5px',
          color: 'var(--fg-3)',
          textAlign: 'center',
          lineHeight: 1.5,
        }"
      >
        Floo·Content uses your Google account to sign in.<br />
        We never post on your behalf.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false, // Use bare layout — no sidebar / right panel on /login
})

useHead({ title: 'Sign in · Floo·Content' })

const { loginWithGoogle } = useAuth()
const route = useRoute()
const toast = useToast()
const clog = useClientLog()

const busy = ref(false)

// Show a toast if we were bounced back with an error query param
onMounted(() => {
  const e = route.query.error
  if (!e) return
  const code = typeof e === 'string' ? e : String(e)
  const messages: Record<string, string> = {
    auth_failed:  'Sign-in failed. Please try again.',
    auth_timeout: 'Sign-in timed out. Please try again.',
  }
  const msg = messages[code] ?? `Sign-in error: ${decodeURIComponent(code)}`
  toast.error(msg)
  clog.warn('[client/login]', 'Landed with ?error=', { code, displayed: msg })
  // Clean the error param from the URL without a page reload
  const url = new URL(window.location.href)
  url.searchParams.delete('error')
  window.history.replaceState({}, '', url.toString())
})

async function onLogin() {
  if (busy.value) return
  busy.value = true
  try {
    await loginWithGoogle()
  } catch (err: any) {
    busy.value = false
    clog.error('[client/login]', 'loginWithGoogle threw', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    })
    toast.error('Could not start Google sign-in. Please try again.')
  }
}

function hoverBtn(e: MouseEvent, enter: boolean) {
  const el = e.currentTarget as HTMLElement
  el.style.background = enter ? 'var(--bg-2)' : 'var(--surface)'
  el.style.borderColor = enter ? 'var(--brand)' : 'var(--border-strong)'
}
</script>
