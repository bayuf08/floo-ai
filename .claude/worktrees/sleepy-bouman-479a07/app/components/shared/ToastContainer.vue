<template>
  <Teleport to="body">
    <div
      :style="{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: 'min(360px, calc(100vw - 40px))',
        pointerEvents: 'none',
      }"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup name="toast-list">
        <div
          v-for="t in toasts"
          :key="t.id"
          role="status"
          :style="toastStyle(t.kind)"
        >
          <span class="flex items-center justify-center flex-shrink-0" :style="iconBoxStyle(t.kind)">
            <Icon :name="iconName(t.kind)" class="w-3.5 h-3.5" />
          </span>
          <div class="flex-1 min-w-0">
            <div :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4 }">
              {{ t.message }}
            </div>
            <div
              v-if="t.detail"
              :style="{
                fontSize: '12px',
                color: 'var(--fg-2)',
                lineHeight: 1.4,
                marginTop: '2px',
                whiteSpace: 'pre-wrap',
              }"
            >
              {{ t.detail }}
            </div>
          </div>
          <button
            type="button"
            :aria-label="`Dismiss ${t.kind} notification`"
            @click="dismiss(t.id)"
            :style="{
              flexShrink: 0,
              width: '20px',
              height: '20px',
              borderRadius: 'var(--r-sm)',
              color: 'var(--fg-3)',
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }"
          >
            <Icon name="lucide:x" class="w-3 h-3" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ToastKind } from '~/composables/useToast'

const { toasts, dismiss } = useToast()

const ACCENT: Record<ToastKind, { color: string; tint: string; icon: string }> = {
  success: { color: 'var(--ft-green)', tint: 'color-mix(in srgb, var(--ft-green) 14%, transparent)', icon: 'lucide:check' },
  error:   { color: 'var(--ft-red)',   tint: 'color-mix(in srgb, var(--ft-red) 14%, transparent)',   icon: 'lucide:alert-triangle' },
  info:    { color: 'var(--brand)',    tint: 'var(--brand-tint)',                                    icon: 'lucide:info' },
  warning: { color: 'var(--ft-amber-deep)', tint: 'var(--cta-tint)',                                 icon: 'lucide:alert-circle' },
}

function toastStyle(kind: ToastKind) {
  return {
    pointerEvents: 'auto' as const,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderLeft: `3px solid ${ACCENT[kind].color}`,
    borderRadius: 'var(--r-md)',
    boxShadow: 'var(--shadow-lg)',
  }
}

function iconBoxStyle(kind: ToastKind) {
  return {
    width: '22px',
    height: '22px',
    borderRadius: 'var(--r-sm)',
    background: ACCENT[kind].tint,
    color: ACCENT[kind].color,
    marginTop: '1px',
  }
}

function iconName(kind: ToastKind) {
  return ACCENT[kind].icon
}
</script>

<style scoped>
.toast-list-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.toast-list-enter-active,
.toast-list-leave-active {
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}
.toast-list-move {
  transition: transform 200ms var(--ease-out);
}
</style>
