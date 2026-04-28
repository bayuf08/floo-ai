<template>
  <section v-if="invites.length || loading" :style="{ marginTop: '20px' }">
    <h3
      class="font-display"
      :style="{
        fontWeight: 700,
        fontSize: '14px',
        color: 'var(--fg)',
        marginBottom: '8px',
      }"
    >
      Pending invites
      <span
        v-if="invites.length"
        :style="{
          marginLeft: '6px',
          fontSize: '11px',
          fontWeight: 700,
          padding: '1px 8px',
          background: 'var(--brand-tint)',
          color: 'var(--brand)',
          borderRadius: 'var(--r-pill)',
        }"
      >{{ invites.length }}</span>
    </h3>

    <p v-if="loading" :style="{ fontSize: '12.5px', color: 'var(--fg-3)' }">Loading invites…</p>

    <div
      v-else
      :style="{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }"
    >
      <div
        v-for="(inv, idx) in invites"
        :key="inv.id"
        class="flex items-center"
        :style="{
          padding: '12px 14px',
          gap: '10px',
          borderBottom: idx === invites.length - 1 ? 'none' : '1px solid var(--border-soft)',
        }"
      >
        <span
          class="flex items-center justify-center"
          :style="{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--r-md)',
            background: 'var(--cta-tint)',
            color: 'var(--ft-amber-deep)',
          }"
        >
          <Icon name="lucide:mail" class="w-4 h-4" />
        </span>
        <div class="flex-1 min-w-0">
          <div :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }">
            {{ inv.email }}
          </div>
          <div :style="{ fontSize: '11.5px', color: 'var(--fg-3)' }">
            Invited by {{ inv.inviter?.name ?? 'someone' }}
            · expires {{ relativeTime(inv.expires_at) }}
          </div>
        </div>
        <span :style="roleChipStyle(inv.role)">{{ inv.role }}</span>
        <button
          type="button"
          :aria-label="`Revoke invite for ${inv.email}`"
          @click="onRevoke(inv.id)"
          :style="{
            padding: '4px 10px',
            fontSize: '11.5px',
            fontWeight: 600,
            color: 'var(--ft-red)',
            background: 'transparent',
            borderRadius: 'var(--r-sm)',
          }"
        >
          Revoke
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  workspaceId?: string
  projectId?: string
}>()

interface InviteRow {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
  accepted_at: string | null
  inviter: { name?: string; email?: string } | null
}

const toast = useToast()
const invites = ref<InviteRow[]>([])
const loading = ref(false)

async function load() {
  if (!props.workspaceId && !props.projectId) {
    invites.value = []
    return
  }
  loading.value = true
  try {
    const params = props.workspaceId
      ? `?workspace=${props.workspaceId}`
      : `?project=${props.projectId}`
    invites.value = await $fetch<InviteRow[]>(`/api/invites${params}`, { credentials: 'include' })
  } catch (err: any) {
    invites.value = []
    console.warn('[PendingInvitesList] load failed', err)
  } finally {
    loading.value = false
  }
}

async function onRevoke(id: string) {
  const previous = invites.value
  invites.value = invites.value.filter((i) => i.id !== id)
  try {
    await $fetch(`/api/invites/by-id/${id}`, { method: 'DELETE', credentials: 'include' })
    toast.success('Invite revoked')
  } catch (err: any) {
    invites.value = previous
    toast.error('Couldn\'t revoke', { detail: err?.statusMessage || err?.message })
  }
}

function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const days = Math.ceil(diff / 86_400_000)
  if (days <= 1) return 'today'
  if (days <= 30) return `in ${days} day${days === 1 ? '' : 's'}`
  return `in ${Math.ceil(days / 7)} weeks`
}

function roleChipStyle(role: string) {
  return {
    padding: '2px 8px',
    fontSize: '10.5px',
    fontWeight: 700,
    textTransform: 'capitalize' as const,
    borderRadius: 'var(--r-pill)',
    background: 'var(--bg-2)',
    color: 'var(--fg-2)',
  }
}

onMounted(load)
watch([() => props.workspaceId, () => props.projectId], load)

defineExpose({ refresh: load })
</script>
