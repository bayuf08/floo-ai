import { defineStore } from 'pinia'
import type { User, Workspace } from '~/types/user'

/**
 * UserStore — single source of truth for the current user + workspaces.
 *
 * Mock-first design: starts with hardcoded data so the UI works without
 * a backend. Calling `loadFromBackend()` swaps the mocks for live data
 * fetched from /api/workspaces. The new backend-aware actions also fall
 * back to local mutations if the API call fails (so dev still works
 * without Supabase configured).
 */
export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User>({
    id: 'user-1',
    name: 'Rara Anjani',
    email: 'rara@floothink.com',
    role: 'Senior Content Strategist',
    initials: 'RA',
  })

  const workspaces = ref<Workspace[]>([
    { id: 'ws-1', name: 'Social Media Content', type: 'social', color: '#5B479D' },
    { id: 'ws-2', name: 'Brand Campaign', type: 'campaign', color: '#4B70B6' },
    { id: 'ws-3', name: 'Newsletter', type: 'email', color: '#4DAF4E' },
  ])

  const activeWorkspace = ref<Workspace>(workspaces.value[0]!)

  /** True once the store has hydrated from /api/workspaces. */
  const hydrated = ref(false)
  /** True if backend hydration failed — UI may want to surface this. */
  const usingMocks = ref(true)

  function setActiveWorkspace(ws: Workspace) {
    activeWorkspace.value = ws
  }

  /**
   * Hydrate workspaces from /api/workspaces. Safe to call multiple times.
   * Falls back to the mock array if the API isn't reachable.
   */
  async function loadFromBackend() {
    if (hydrated.value) return
    try {
      const rows = await $fetch<any[]>('/api/workspaces', { credentials: 'include' })
      if (Array.isArray(rows) && rows.length > 0) {
        workspaces.value = rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type ?? 'general',
          color: r.color ?? '#5B479D',
        }))
        // Preserve the active selection if still present, else first.
        const stillThere = workspaces.value.find((w) => w.id === activeWorkspace.value?.id)
        activeWorkspace.value = stillThere ?? workspaces.value[0]!
        usingMocks.value = false
      }
      hydrated.value = true
    } catch (err) {
      console.warn('[userStore] backend not reachable; staying on mock data', err)
      hydrated.value = true
      usingMocks.value = true
    }
  }

  /**
   * Create a new workspace. Tries the backend first; on failure, falls back
   * to a local-only mock entry.
   */
  async function createWorkspace(input: {
    name: string
    type?: string
    color?: string
    activate?: boolean
  }): Promise<string> {
    const palette = ['#5B479D', '#FBB040', '#4B70B6', '#4DAF4E', '#E85D5D', '#E1306C', '#FBE225']
    const fallbackColor = palette[workspaces.value.length % palette.length]!

    if (!usingMocks.value) {
      try {
        const row = await $fetch<any>('/api/workspaces', {
          method: 'POST',
          credentials: 'include',
          body: {
            name: input.name.trim(),
            type: input.type ?? 'general',
            color: input.color ?? fallbackColor,
          },
        })
        const ws: Workspace = {
          id: row.id,
          name: row.name,
          type: row.type ?? 'general',
          color: row.color ?? fallbackColor,
        }
        workspaces.value.push(ws)
        if (input.activate !== false) setActiveWorkspace(ws)
        return ws.id
      } catch (err) {
        console.warn('[userStore] createWorkspace API failed; falling back to mock', err)
      }
    }

    // Mock path
    const id = `ws-${Date.now()}`
    const ws: Workspace = {
      id,
      name: input.name.trim(),
      type: input.type ?? 'general',
      color: input.color ?? fallbackColor,
    }
    workspaces.value.push(ws)
    if (input.activate !== false) setActiveWorkspace(ws)
    return id
  }

  async function deleteWorkspace(id: string) {
    if (workspaces.value.length <= 1) return

    if (!usingMocks.value) {
      try {
        await $fetch(`/api/workspaces/${id}`, { method: 'DELETE', credentials: 'include' })
      } catch (err) {
        console.warn('[userStore] deleteWorkspace API failed; falling back to mock', err)
      }
    }

    workspaces.value = workspaces.value.filter((w) => w.id !== id)
    if (activeWorkspace.value.id === id) {
      activeWorkspace.value = workspaces.value[0]!
    }
  }

  return {
    currentUser,
    workspaces,
    activeWorkspace,
    hydrated,
    usingMocks,
    setActiveWorkspace,
    createWorkspace,
    deleteWorkspace,
    loadFromBackend,
  }
})
