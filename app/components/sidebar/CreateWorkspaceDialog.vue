<template>
  <AppDialog v-model="open" title="Create new workspace">
    <p :style="{ fontSize: '13px', color: 'var(--fg-2)', lineHeight: 1.55, marginBottom: '14px' }">
      Workspaces group projects by team or product line. You can switch between them anytime
      from the sidebar.
    </p>

    <form @submit.prevent="onSubmit">
      <!-- Name -->
      <div :style="{ marginBottom: '14px' }">
        <label :style="labelStyle" for="ws-name">Workspace name</label>
        <input
          id="ws-name"
          v-model="form.name"
          type="text"
          required
          placeholder="e.g. Q3 Launch Campaign"
          :style="inputStyle"
        />
      </div>

      <!-- Color -->
      <div>
        <span :style="labelStyle">Color</span>
        <div :style="{ display: 'flex', gap: '8px', flexWrap: 'wrap' }">
          <button
            v-for="c in palette"
            :key="c"
            type="button"
            :aria-label="`Pick color ${c}`"
            @click="form.color = c"
            :style="colorBtnStyle(c)"
          >
            <Icon
              v-if="form.color === c"
              name="lucide:check"
              class="w-3.5 h-3.5"
              :style="{ color: 'white' }"
            />
          </button>
        </div>
      </div>
    </form>

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
        Cancel
      </button>
      <button
        type="button"
        @click="onSubmit"
        :disabled="!form.name.trim()"
        :style="{
          padding: '8px 16px',
          fontSize: '13px',
          fontWeight: 700,
          background: 'var(--cta)',
          color: 'var(--cta-fg)',
          borderRadius: 'var(--r-md)',
          opacity: form.name.trim() ? 1 : 0.5,
          cursor: form.name.trim() ? 'pointer' : 'not-allowed',
        }"
      >
        Create workspace
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const userStore = useUserStore()

const palette = ['#5B479D', '#FBB040', '#4B70B6', '#4DAF4E', '#E85D5D', '#E1306C', '#FBE225']

const form = reactive({
  name: '',
  color: palette[0]!,
})

watch(open, (v) => {
  if (v) {
    // Reset form on open
    form.name = ''
    form.color = palette[Math.floor(Math.random() * palette.length)]!
  }
})

function onSubmit() {
  if (!form.name.trim()) return
  userStore.createWorkspace({
    name: form.name.trim(),
    type: 'general',
    color: form.color,
    activate: true,
  })
  open.value = false
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
  fontSize: '14px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  color: 'var(--fg)',
  outline: 'none',
}

function colorBtnStyle(c: string) {
  const active = form.color === c
  return {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    background: c,
    border: active ? '2px solid var(--fg)' : '2px solid transparent',
    boxShadow: active ? 'var(--shadow-sm)' : 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 120ms var(--ease-out)',
    cursor: 'pointer',
  }
}
</script>
