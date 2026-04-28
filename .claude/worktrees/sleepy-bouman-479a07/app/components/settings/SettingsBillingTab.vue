<template>
  <section :style="{ maxWidth: '720px' }">
    <h2 :style="headingStyle">Billing</h2>

    <!-- Loading -->
    <p v-if="loading" :style="{ fontSize: '13px', color: 'var(--fg-3)' }">
      Loading subscription…
    </p>

    <template v-else-if="data">
      <!-- Current plan card -->
      <article :style="planCardStyle">
        <header class="flex items-center justify-between" :style="{ marginBottom: '14px' }">
          <div>
            <div
              :style="{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--fg-3)',
                marginBottom: '4px',
              }"
            >
              Current plan
            </div>
            <div class="font-display capitalize" :style="{ fontSize: '20px', fontWeight: 700, color: 'var(--fg)' }">
              {{ data.subscription.plan }}
            </div>
          </div>
          <span :style="statusChipStyle(data.subscription.status)">{{ data.subscription.status }}</span>
        </header>

        <!-- Usage bar -->
        <div :style="{ marginBottom: '14px' }">
          <div class="flex items-center justify-between" :style="{ marginBottom: '6px' }">
            <span :style="{ fontSize: '12.5px', color: 'var(--fg-2)', fontWeight: 500 }">
              AI messages this month
            </span>
            <span :style="{ fontSize: '12.5px', color: 'var(--fg)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }">
              {{ data.usage.ai_messages_this_month.toLocaleString() }}
              <span :style="{ color: 'var(--fg-3)', fontWeight: 500 }">
                / {{ data.usage.quota.toLocaleString() }}
              </span>
            </span>
          </div>
          <div :style="{ height: '6px', background: 'var(--bg-2)', borderRadius: '999px', overflow: 'hidden' }">
            <div
              :style="{
                width: `${usagePct}%`,
                height: '100%',
                background: usagePct > 90 ? 'var(--ft-red)' : usagePct > 70 ? 'var(--cta)' : 'var(--brand)',
                transition: 'width 200ms var(--ease-out)',
              }"
            />
          </div>
        </div>

        <!-- Renewal info -->
        <p
          v-if="data.subscription.current_period_end"
          :style="{ fontSize: '11.5px', color: 'var(--fg-3)', margin: 0 }"
        >
          {{ data.subscription.cancel_at_period_end ? 'Cancels' : 'Renews' }}
          on {{ formatDate(data.subscription.current_period_end) }}
        </p>

        <!-- Manage button -->
        <div class="flex items-center gap-2" :style="{ marginTop: '14px' }">
          <button
            v-if="data.subscription.plan !== 'free'"
            type="button"
            @click="onPortal"
            :disabled="busy"
            :style="primaryBtnStyle"
          >
            Manage subscription
          </button>
        </div>
      </article>

      <!-- Plan comparison -->
      <h3 :style="subHeadingStyle">Switch plan</h3>
      <div :style="{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }">
        <article
          v-for="p in plans"
          :key="p.value"
          :style="planTileStyle(p.value)"
        >
          <div
            class="font-display capitalize"
            :style="{ fontSize: '15px', fontWeight: 700, color: 'var(--fg)', marginBottom: '4px' }"
          >
            {{ p.label }}
          </div>
          <div :style="{ fontSize: '13px', color: 'var(--fg-2)', marginBottom: '8px' }">{{ p.price }}</div>
          <ul
            :style="{
              listStyle: 'none',
              padding: 0,
              margin: '0 0 14px',
              fontSize: '12.5px',
              color: 'var(--fg-2)',
              lineHeight: 1.55,
            }"
          >
            <li v-for="f in p.features" :key="f" :style="{ display: 'flex', gap: '6px', marginBottom: '3px' }">
              <Icon name="lucide:check" class="w-3 h-3" :style="{ color: 'var(--ft-green)', flexShrink: 0, marginTop: '4px' }" />
              <span>{{ f }}</span>
            </li>
          </ul>
          <button
            v-if="p.value !== 'free' && data.subscription.plan !== p.value"
            type="button"
            @click="onUpgrade(p.value)"
            :disabled="busy"
            :style="upgradeBtnStyle(p.value)"
          >
            {{ data.subscription.plan === 'free' ? 'Upgrade' : 'Switch' }} to {{ p.label }}
          </button>
          <span
            v-else-if="p.value === data.subscription.plan"
            :style="currentPillStyle"
          >
            Current plan
          </span>
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  workspaceId: string
}>()

const toast = useToast()
const route = useRoute()

interface BillingData {
  subscription: {
    plan: string
    status: string
    stripe_customer_id?: string | null
    current_period_end?: string | null
    cancel_at_period_end?: boolean
  }
  usage: { ai_messages_this_month: number; quota: number; period_start: string | null }
}

const data = ref<BillingData | null>(null)
const loading = ref(true)
const busy = ref(false)

const plans = [
  {
    value: 'free' as const,
    label: 'Free',
    price: '$0 / month',
    features: ['100 AI messages / month', '3 projects', 'Brand assets up to 50 MB / file'],
  },
  {
    value: 'pro' as const,
    label: 'Pro',
    price: '$19 / month',
    features: ['2,000 AI messages / month', 'Unlimited projects', 'All brand asset types', 'Priority support'],
  },
  {
    value: 'team' as const,
    label: 'Team',
    price: '$49 / month',
    features: ['10,000 AI messages / month', 'Up to 10 collaborators', 'Custom skills', 'Workspace analytics'],
  },
]

const usagePct = computed(() => {
  if (!data.value) return 0
  const { ai_messages_this_month, quota } = data.value.usage
  if (!quota) return 0
  return Math.min(100, Math.round((ai_messages_this_month / quota) * 100))
})

async function load() {
  loading.value = true
  try {
    data.value = await $fetch<BillingData>(`/api/billing/${props.workspaceId}`, {
      credentials: 'include',
    })
  } catch (err: any) {
    toast.error('Couldn\'t load billing info', { detail: err?.statusMessage || err?.message })
  } finally {
    loading.value = false
  }
}

async function onUpgrade(plan: 'pro' | 'team') {
  if (busy.value) return
  busy.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      credentials: 'include',
      body: { workspace_id: props.workspaceId, plan },
    })
    if (res.url && typeof window !== 'undefined') window.location.href = res.url
  } catch (err: any) {
    busy.value = false
    toast.error('Couldn\'t start checkout', { detail: err?.statusMessage || err?.message })
  }
}

async function onPortal() {
  if (busy.value) return
  busy.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/billing/portal', {
      method: 'POST',
      credentials: 'include',
      body: { workspace_id: props.workspaceId },
    })
    if (res.url && typeof window !== 'undefined') window.location.href = res.url
  } catch (err: any) {
    busy.value = false
    toast.error('Couldn\'t open billing portal', { detail: err?.statusMessage || err?.message })
  }
}

onMounted(() => {
  load()
  // Show post-checkout flash if Stripe redirected back with ?billing=…
  if (route.query.billing === 'success') {
    toast.success('Subscription updated', { detail: 'Your new plan is active.' })
  } else if (route.query.billing === 'cancel') {
    toast.info('Checkout cancelled', { detail: 'Your plan didn\'t change.' })
  }
})

watch(() => props.workspaceId, () => load())

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const headingStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '18px',
  letterSpacing: '-0.01em',
  color: 'var(--fg)',
  marginBottom: '16px',
}

const subHeadingStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '14px',
  color: 'var(--fg)',
  margin: '20px 0 10px',
}

const planCardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  padding: '18px 20px',
  marginBottom: '14px',
}

const primaryBtnStyle = {
  padding: '8px 14px',
  fontSize: '12.5px',
  fontWeight: 700,
  background: 'var(--cta)',
  color: 'var(--cta-fg)',
  borderRadius: 'var(--r-md)',
  boxShadow: 'var(--shadow-xs)',
}

function statusChipStyle(status: string) {
  const colors: Record<string, { bg: string; fg: string }> = {
    active:     { bg: 'color-mix(in srgb, var(--ft-green) 14%, transparent)', fg: 'var(--ft-green)' },
    trialing:   { bg: 'var(--brand-tint)',                                    fg: 'var(--brand)' },
    past_due:   { bg: 'var(--cta-tint)',                                      fg: 'var(--ft-amber-deep)' },
    canceled:   { bg: 'color-mix(in srgb, var(--ft-red) 14%, transparent)',   fg: 'var(--ft-red)' },
    incomplete: { bg: 'var(--bg-2)',                                          fg: 'var(--fg-3)' },
  }
  const c = colors[status] ?? { bg: 'var(--bg-2)', fg: 'var(--fg-3)' }
  return {
    padding: '3px 10px',
    fontSize: '11px',
    fontWeight: 700,
    borderRadius: 'var(--r-pill)',
    background: c.bg,
    color: c.fg,
    textTransform: 'capitalize' as const,
  }
}

function planTileStyle(plan: string) {
  const isCurrent = plan === data.value?.subscription.plan
  return {
    background: 'var(--surface)',
    border: `1px solid ${isCurrent ? 'var(--brand)' : 'var(--border)'}`,
    borderRadius: 'var(--r-md)',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
  }
}

function upgradeBtnStyle(plan: string) {
  return {
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 700,
    background: plan === 'team' ? 'var(--brand)' : 'var(--cta)',
    color: plan === 'team' ? 'var(--brand-fg)' : 'var(--cta-fg)',
    borderRadius: 'var(--r-md)',
    marginTop: 'auto',
  }
}

const currentPillStyle = {
  marginTop: 'auto',
  padding: '6px 10px',
  fontSize: '11px',
  fontWeight: 700,
  textAlign: 'center' as const,
  background: 'var(--brand-tint)',
  color: 'var(--brand)',
  borderRadius: 'var(--r-md)',
}
</script>
