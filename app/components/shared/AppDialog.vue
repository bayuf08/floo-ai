<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="close"
        @keydown.esc.stop="close"
        @keydown.tab="onTab"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0" :style="{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }" />

        <!-- Dialog -->
        <div
          ref="dialogRef"
          class="relative w-full max-w-lg overflow-hidden"
          :style="{
            background: 'var(--surface)',
            borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--border)',
          }"
        >
          <!-- Header -->
          <div
            v-if="title"
            class="flex items-center justify-between"
            :style="{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }"
          >
            <h2
              :id="titleId"
              class="font-display"
              :style="{ fontWeight: 700, fontSize: '17px', color: 'var(--fg)' }"
            >
              {{ title }}
            </h2>
            <button
              type="button"
              aria-label="Close dialog"
              class="p-1 rounded-md transition-colors"
              :style="{ color: 'var(--fg-3)' }"
              @click="close"
              @mouseenter="hoverClose($event, true)"
              @mouseleave="hoverClose($event, false)"
            >
              <Icon name="lucide:x" class="w-5 h-5" />
            </button>
          </div>

          <!-- Body -->
          <div :style="{ padding: '20px 24px' }">
            <slot />
          </div>

          <!-- Footer -->
          <div
            v-if="$slots.footer"
            class="flex items-center justify-end"
            :style="{
              padding: '14px 24px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-2)',
              gap: '8px',
            }"
          >
            <slot name="footer" :close="close" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  title?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const titleId = useId()
const dialogRef = ref<HTMLElement | null>(null)
const previouslyFocused = ref<HTMLElement | null>(null)
const ui = useUiStore()

function close() {
  emit('update:modelValue', false)
}

function getFocusable(): HTMLElement[] {
  if (!dialogRef.value) return []
  const selector =
    'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  return Array.from(dialogRef.value.querySelectorAll<HTMLElement>(selector))
    .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
}

function onTab(e: KeyboardEvent) {
  const focusable = getFocusable()
  if (focusable.length === 0) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const active = document.activeElement as HTMLElement | null

  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      previouslyFocused.value = (document.activeElement as HTMLElement) ?? null
      ui.openDialog('app-dialog')
      await nextTick()
      // Focus first focusable element (input preferred over button)
      const focusable = getFocusable()
      const preferred = focusable.find((el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      ;(preferred ?? focusable[0])?.focus()
    } else {
      if (ui.activeDialog === 'app-dialog') ui.closeDialog()
      // Return focus to whoever opened the dialog
      previouslyFocused.value?.focus?.()
      previouslyFocused.value = null
    }
  }
)

function hoverClose(e: MouseEvent, enter: boolean) {
  const el = e.currentTarget as HTMLElement
  el.style.background = enter ? 'var(--bg-2)' : 'transparent'
  el.style.color = enter ? 'var(--fg)' : 'var(--fg-3)'
}
</script>
