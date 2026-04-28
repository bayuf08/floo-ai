import { storeToRefs } from 'pinia'
import { useUiStore } from '~/stores/ui'

/**
 * Reactive theme access. Reads from the UI store and applies
 * data-theme to <html> on every change.
 */
export function useTheme() {
  const ui = useUiStore()
  const { theme } = storeToRefs(ui)

  const isDark = computed(() => theme.value === 'dark')

  return {
    theme,
    isDark,
    setTheme: ui.setTheme,
    toggleTheme: ui.toggleTheme,
    initTheme: ui.initTheme,
  }
}
