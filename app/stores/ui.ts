import { defineStore } from 'pinia'

export type Theme = 'light' | 'dark'
export type PlatformOverride = 'tiktok' | 'instagram' | 'youtube' | 'x' | 'twitter' | 'linkedin' | 'threads' | null

/**
 * Global UI state — theme, platform accent override, sidebar collapse, right panel open.
 * Replaces the inject/provide pattern in layouts/default.vue so other surfaces
 * (Projects list, Skill library) can read the same state.
 */
export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: 'light' as Theme,
    /** When set, overrides the platform accent derived from active project. */
    platformOverride: null as PlatformOverride,
    sidebarCollapsed: false,
    /** Whether the sidebar is open as a drawer on mobile (<md breakpoint). */
    sidebarMobileOpen: false,
    rightPanelOpen: true,
    /** Whether any modal/dialog is currently open — used by useKeyboard for Esc handling. */
    activeDialog: null as string | null,
    /**
     * Pending tab switch for the right panel. Cross-component request — set this from a
     * popover or menu, and AppRightPanel.vue will read + clear it.
     */
    activeContextTab: null as 'rules' | 'skills' | 'platform' | 'knowledge' | 'saved' | null,
  }),

  actions: {
    setTheme(theme: Theme) {
      this.theme = theme
      if (import.meta.client) {
        localStorage.setItem('floo-theme', theme)
        document.documentElement.setAttribute('data-theme', theme)
        // Update theme-color meta for browser chrome
        const meta = document.querySelector('meta[name="theme-color"]')
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#14111B' : '#5B479D')
      }
    },

    toggleTheme() {
      this.setTheme(this.theme === 'light' ? 'dark' : 'light')
    },

    /** Read theme from localStorage, fall back to prefers-color-scheme. Call once on app mount. */
    initTheme() {
      if (!import.meta.client) return
      const stored = localStorage.getItem('floo-theme') as Theme | null
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      const theme = stored ?? (prefersDark ? 'dark' : 'light')
      this.setTheme(theme)
    },

    setPlatformOverride(p: PlatformOverride) {
      this.platformOverride = p
    },

    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
      if (import.meta.client) {
        localStorage.setItem('floo-sidebar-collapsed', String(this.sidebarCollapsed))
      }
    },

    /** Read sidebar collapse state from localStorage. Call once on app mount. */
    initSidebar() {
      if (!import.meta.client) return
      const stored = localStorage.getItem('floo-sidebar-collapsed')
      if (stored !== null) this.sidebarCollapsed = stored === 'true'
    },

    toggleRightPanel() {
      this.rightPanelOpen = !this.rightPanelOpen
    },

    openDialog(name: string) {
      this.activeDialog = name
    },

    closeDialog() {
      this.activeDialog = null
    },
  },
})
