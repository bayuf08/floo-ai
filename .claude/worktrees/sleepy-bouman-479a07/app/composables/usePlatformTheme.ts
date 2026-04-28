import { storeToRefs } from 'pinia'
import { useProjectsStore } from '~/stores/projects'
import { useUiStore } from '~/stores/ui'

/**
 * Reactive platform accent.
 * Resolves to (in order): explicit user override > active project's platform > 'tiktok' default.
 * Sets data-platform on <html>, which lights up --platform / --platform-tint CSS vars.
 */
export function usePlatformTheme() {
  const projectsStore = useProjectsStore()
  const uiStore = useUiStore()
  const { activeProject } = storeToRefs(projectsStore)
  const { platformOverride } = storeToRefs(uiStore)

  const activePlatform = computed(() => {
    if (platformOverride.value) return platformOverride.value
    return activeProject.value?.platform ?? 'tiktok'
  })

  // Apply on the client whenever the active platform changes
  if (import.meta.client) {
    watch(
      activePlatform,
      (p) => {
        document.documentElement.setAttribute('data-platform', p)
      },
      { immediate: true }
    )
  }

  return {
    activePlatform,
    setOverride: uiStore.setPlatformOverride,
  }
}
