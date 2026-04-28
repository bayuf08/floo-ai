import type { Ref } from 'vue'

/**
 * Call `cb` whenever the user mouses-down outside the element bound to `el`.
 * Mounts a single document listener and tears it down on unmount.
 *
 * Usage:
 *   const root = ref<HTMLElement | null>(null)
 *   const open = ref(false)
 *   useClickOutside(root, () => (open.value = false))
 */
export function useClickOutside(
  el: Ref<HTMLElement | null>,
  cb: (event: MouseEvent) => void
) {
  if (!import.meta.client) return

  const handler = (e: MouseEvent) => {
    const target = e.target as Node | null
    if (!target) return
    if (el.value && !el.value.contains(target)) cb(e)
  }

  onMounted(() => document.addEventListener('mousedown', handler))
  onBeforeUnmount(() => document.removeEventListener('mousedown', handler))
}
