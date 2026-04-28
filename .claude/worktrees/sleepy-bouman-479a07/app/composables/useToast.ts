/**
 * Lightweight toast notification system.
 *
 * Usage:
 *   const toast = useToast()
 *   toast.success('Saved')
 *   toast.error('Couldn\'t reach the server')
 *   toast.info('Project duplicated')
 *
 * Toasts auto-dismiss after `durationMs` (default 4s). The <ToastContainer />
 * component renders them — mount it once at the app root.
 */
export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  /** Optional secondary line */
  detail?: string
  /** Auto-dismiss after this many ms; 0 means sticky */
  durationMs: number
}

const toastsState = () => useState<Toast[]>('floo-toasts', () => [])

export function useToast() {
  const toasts = toastsState()

  function push(kind: ToastKind, message: string, opts?: { detail?: string; durationMs?: number }) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const durationMs = opts?.durationMs ?? (kind === 'error' ? 6000 : 4000)
    toasts.value.push({ id, kind, message, detail: opts?.detail, durationMs })
    if (durationMs > 0) {
      setTimeout(() => dismiss(id), durationMs)
    }
    return id
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts,
    push,
    dismiss,
    success: (msg: string, opts?: { detail?: string; durationMs?: number }) => push('success', msg, opts),
    error: (msg: string, opts?: { detail?: string; durationMs?: number }) => push('error', msg, opts),
    info: (msg: string, opts?: { detail?: string; durationMs?: number }) => push('info', msg, opts),
    warning: (msg: string, opts?: { detail?: string; durationMs?: number }) => push('warning', msg, opts),
  }
}
