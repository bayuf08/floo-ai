/**
 * Global keyboard shortcuts for Floo·Content.
 * Mounts a single listener at app root; components register handlers as needed.
 *
 * Default shortcuts (when not in an editable element):
 *   ⌘/Ctrl + B  → toggle sidebar
 *   ⌘/Ctrl + .  → toggle right panel
 *   Escape      → close active dialog or right panel
 *
 * Composer-local shortcuts (handled inside ChatComposer):
 *   ⌘/Ctrl + Enter → submit message
 */
import { useUiStore } from '~/stores/ui'

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useKeyboard() {
  if (!import.meta.client) return

  const ui = useUiStore()

  function onKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey

    // Esc — close dialog / right panel
    if (e.key === 'Escape') {
      if (ui.activeDialog) {
        ui.closeDialog()
        return
      }
      if (ui.rightPanelOpen) {
        ui.rightPanelOpen = false
        return
      }
    }

    // Ignore other shortcuts while typing
    if (isEditable(e.target)) return

    // ⌘/Ctrl + B — toggle sidebar
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      ui.toggleSidebar()
      return
    }

    // ⌘/Ctrl + . — toggle right panel
    if (mod && e.key === '.') {
      e.preventDefault()
      ui.toggleRightPanel()
      return
    }
  }

  onMounted(() => document.addEventListener('keydown', onKey))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
}
