/**
 * Copy text to clipboard with a 2s "copied" state for UI feedback.
 * Falls back gracefully if navigator.clipboard isn't available.
 */
export function useClipboard(resetMs = 2000) {
  const copied = ref(false)
  let resetTimer: ReturnType<typeof setTimeout> | null = null

  async function copy(text: string): Promise<boolean> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Legacy fallback
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      copied.value = true
      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => (copied.value = false), resetMs)
      return true
    } catch (err) {
      console.warn('[useClipboard] copy failed', err)
      return false
    }
  }

  return { copied, copy }
}
