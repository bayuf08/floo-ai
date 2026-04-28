import { defineStore } from 'pinia'
import { canManageSkills as canManageSkillsForRole, canToggleProjectSkills as canToggleProjectSkillsForRole } from '~/utils/skill-library'
import { getRequestErrorDetail } from '~/utils/request-error'
import type { User, Workspace, WorkspaceMember } from '~/types/user'

/**
 * UserStore — single source of truth for the current user + workspaces.
 *
 * Backend-first: initial state is empty. The auth middleware
 * (`app/middleware/auth.global.ts`) hits `/api/auth/me` and fills in
 * `currentUser` before any layout renders. `loadFromBackend()` then
 * fetches `/api/workspaces` from the layout's `onMounted`. We used to
 * pre-populate mock data here so the UI worked offline; now that the
 * backend is mandatory, those seeds just caused a brief flash of fake
 * names ("Rara Anjani", "Social Media Content") on every reload.
 */
export const useUserStore = defineStore('user', () => {
  // Empty placeholder until the auth middleware replaces it with the
  // real profile from /api/auth/me. Components that read .name / .email
  // / .initials see empty strings during the first ~100ms of render —
  // visually a blank user card, no fake identity.
  const currentUser = ref<User>({
    id: '',
    name: '',
    email: '',
    role: '',
    initials: '',
  })

  // Empty list until /api/workspaces resolves. The sidebar's workspace
  // dropdown briefly renders blank, then populates with real entries.
  const workspaces = ref<Workspace[]>([])

  // Nullable: the user may legitimately have zero workspaces if the
  // bootstrap default-workspace insert failed and they haven't created one.
  const activeWorkspace = ref<Workspace | null>(null)

  /** True once the store has hydrated from /api/workspaces. */
  const hydrated = ref(false)
  /** True if backend hydration failed — UI may want to surface this. */
  const usingMocks = ref(true)
  /** Last error from a backend call. Cleared on next success. */
  const backendError = ref<string | null>(null)

  // ── Workspace members ──────────────────────────────────────────────────────
  /** Members of the currently active workspace, loaded lazily on demand. */
  const workspaceMembers = ref<WorkspaceMember[]>([])
  /** True while a members fetch is in-flight. */
  const membersLoading = ref(false)
  const activeWorkspaceMembershipRole = computed(() => activeWorkspace.value?.membershipRole ?? null)
  const canManageSkills = computed(() =>
    usingMocks.value ? true : canManageSkillsForRole(activeWorkspaceMembershipRole.value)
  )
  const canToggleProjectSkills = computed(() =>
    usingMocks.value ? true : canToggleProjectSkillsForRole(activeWorkspaceMembershipRole.value)
  )

  function setActiveWorkspace(ws: Workspace) {
    try { localStorage.setItem('floo:active_workspace_id', ws.id) } catch {}
    // Guard: if the ID is already the same, skip the reactive assignment.
    // Setting activeWorkspace.value to a new object with the same ID (e.g.
    // from a workspaces.find() call in the recovery watcher) still has a
    // different reference, so Vue would fire all watchers on activeWorkspace.
    // That spuriously triggers the projects-store workspace-switch watcher,
    // which resets activeProjectId and can cause unwanted redirects.
    if (activeWorkspace.value?.id === ws.id) return
    activeWorkspace.value = ws
  }

  /**
   * Force-refresh workspaces from /api/workspaces, bypassing the hydrated
   * guard. Useful for recovery flows (e.g. createProject detects a stale
   * mock workspace ID and wants to re-sync before retrying).
   */
  async function refreshWorkspaces(): Promise<void> {
    hydrated.value = false
    await loadFromBackend()
  }

  /**
   * Hydrate workspaces from /api/workspaces. Safe to call multiple times.
   * Falls back to the mock array if the API isn't reachable.
   */
  async function loadFromBackend() {
    if (hydrated.value) return
    try {
      const rows = await $fetch<any[]>('/api/workspaces', { credentials: 'include' })
      // Successful API call (even an empty array) means we're authenticated
      // and the backend is reachable — exit mock mode and trust the response.
      const nextList = Array.isArray(rows)
        ? rows.map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type ?? 'general',
            color: r.color ?? '#5B479D',
            description: r.description ?? '',
            defaultPlatform: r.default_platform ?? 'tiktok',
            membershipRole: r.workspace_members?.[0]?.role ?? 'viewer',
          }))
        : []
      workspaces.value = nextList
      // Preserve the active selection using this priority chain:
      //   1. Current in-memory selection (still valid after workspace switch mid-session)
      //   2. Stored preference from localStorage (survives page reloads)
      //   3. First workspace in the list (safe default for new sessions)
      //   4. null — authenticated user with zero workspaces
      const storedId = (() => { try { return localStorage.getItem('floo:active_workspace_id') } catch { return null } })()
      const stillThere = nextList.find((w) => w.id === activeWorkspace.value?.id)
                      ?? nextList.find((w) => w.id === storedId)
                      ?? nextList[0]
                      ?? null
      activeWorkspace.value = stillThere
      usingMocks.value = false
      backendError.value = null
      hydrated.value = true
    } catch (err: any) {
      // Failed (network, 401, etc.) — keep the mock workspaces visible so
      // the UI doesn't blow up; surface the error for the layout to react.
      backendError.value = err?.statusMessage || err?.message || 'Network error'
      hydrated.value = true
      usingMocks.value = true
      console.warn('[userStore] backend not reachable; staying on mock data', err)
    }
  }

  /**
   * Create a new workspace. Tries the backend first; on failure, falls back
   * to a local-only mock entry.
   *
   * `description` is optional and forwarded to the backend; the local mock
   * also persists it so settings/onboarding hydration works without a refetch.
   */
  async function createWorkspace(input: {
    name: string
    type?: string
    color?: string
    description?: string
    activate?: boolean
  }): Promise<string> {
    const palette = ['#5B479D', '#FBB040', '#4B70B6', '#4DAF4E', '#E85D5D', '#E1306C', '#FBE225']
    const fallbackColor = palette[workspaces.value.length % palette.length]!
    const trimmedDescription = input.description?.trim() || undefined

    if (!usingMocks.value) {
      try {
        const row = await $fetch<any>('/api/workspaces', {
          method: 'POST',
          credentials: 'include',
          body: {
            name: input.name.trim(),
            type: input.type ?? 'general',
            color: input.color ?? fallbackColor,
            // The API schema uses z.string().optional() — undefined is valid,
            // null is not. Never send null here.
            ...(trimmedDescription ? { description: trimmedDescription } : {}),
          },
        })
        const ws: Workspace = {
          id: row.id,
          name: row.name,
          type: row.type ?? 'general',
          color: row.color ?? fallbackColor,
          description: row.description ?? trimmedDescription ?? '',
          defaultPlatform: row.default_platform ?? 'tiktok',
          membershipRole: 'owner',
        }
        workspaces.value.push(ws)
        if (input.activate !== false) setActiveWorkspace(ws)
        return ws.id
      } catch (err: any) {
        // In live mode we must NOT fall back to a local mock ID — doing so
        // creates a corrupted state where usingMocks is false but activeWorkspace
        // has a non-UUID id, which causes createProject to fail with a confusing
        // "workspace not persisted" error. Surface the failure immediately instead.
        const detail = err?.statusMessage || err?.message || 'Network error'
        useToast().error("Couldn't create workspace", { detail })
        throw err
      }
    }

    // Mock path (only reached when usingMocks is true)
    const id = `ws-${Date.now()}`
    const ws: Workspace = {
      id,
      name: input.name.trim(),
      type: input.type ?? 'general',
      color: input.color ?? fallbackColor,
      description: trimmedDescription ?? '',
      defaultPlatform: 'tiktok',
      membershipRole: 'owner',
    }
    workspaces.value.push(ws)
    if (input.activate !== false) setActiveWorkspace(ws)
    return id
  }

  /**
   * Optimistically update workspace fields (name, description, defaultPlatform)
   * and persist to the backend when not in mock mode.
   */
  async function updateWorkspace(
    id: string,
    patch: Partial<Pick<Workspace, 'name' | 'description' | 'defaultPlatform'>>,
  ) {
    // Optimistic local update
    const ws = workspaces.value.find((w) => w.id === id)
    if (ws) Object.assign(ws, patch)
    if (activeWorkspace.value?.id === id) Object.assign(activeWorkspace.value, patch)

    if (!usingMocks.value) {
      try {
        await $fetch(`/api/workspaces/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          body: {
            name: patch.name,
            description: patch.description ?? null,
            default_platform: patch.defaultPlatform,
          },
        })
      } catch (err: any) {
        useToast().error('Couldn\'t save workspace settings', { detail: err?.statusMessage || err?.message })
      }
    }
  }

  /**
   * Load the member list for a workspace from the backend.
   * Clears and replaces `workspaceMembers` in place.
   */
  async function loadWorkspaceMembers(workspaceId: string) {
    membersLoading.value = true
    try {
      const rows = await $fetch<WorkspaceMember[]>(
        `/api/workspaces/${workspaceId}/members`,
        { credentials: 'include' },
      )
      workspaceMembers.value = rows
    } catch (err: any) {
      useToast().error('Couldn\'t load members', { detail: err?.statusMessage || err?.message })
    } finally {
      membersLoading.value = false
    }
  }

  /**
   * Invite a user by email to a workspace.
   *
   * Live mode: hits POST /api/invites — that endpoint creates the
   * invitations row, sends a Resend email with an accept link, and never
   * touches workspace_members directly. The new member only appears once
   * they accept the link, so we don't refresh the members list here;
   * callers should refresh the pending-invites list instead.
   *
   * Returns the email-delivery status so the UI can show contextual
   * feedback (sent / mocked / failed). Returns `void` in mock mode or
   * when the call fails.
   *
   * Mock mode: pushes a placeholder member entry so the dialog still
   * "works" without a backend.
   */
  async function inviteWorkspaceMember(
    workspaceId: string,
    email: string,
    role: 'editor' | 'viewer',
  ): Promise<{ email_sent: boolean; email_mock: boolean; email_error?: string; accept_url?: string } | void> {
    if (!usingMocks.value) {
      try {
        const result = await $fetch<{
          invite: { id: string }
          accept_url: string
          email_sent: boolean
          email_mock: boolean
          email_error?: string
        }>('/api/invites', {
          method: 'POST',
          credentials: 'include',
          body: { email, role, workspace_id: workspaceId },
        })
        return {
          email_sent: result.email_sent,
          email_mock: result.email_mock,
          email_error: result.email_error,
          accept_url: result.accept_url,
        }
      } catch (err: any) {
        useToast().error('Couldn\'t invite member', { detail: err?.statusMessage || err?.message })
        return
      }
    }

    // Mock path: synthesise a placeholder entry
    const namePart = email.split('@')[0]?.replace(/[._-]/g, ' ') ?? 'New member'
    const initials = namePart
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('')
    workspaceMembers.value.push({
      id: `mock-${Date.now()}`,
      name: namePart.replace(/\b\w/g, (c) => c.toUpperCase()),
      email,
      initials: initials || '??',
      role,
      avatarUrl: undefined,
    })
  }

  /**
   * Remove a member from a workspace.
   * Optimistically removes locally, rolls back on API error.
   */
  async function removeWorkspaceMember(workspaceId: string, userId: string) {
    const prev = [...workspaceMembers.value]
    workspaceMembers.value = workspaceMembers.value.filter((m) => m.id !== userId)

    if (!usingMocks.value) {
      try {
        await $fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
      } catch (err: any) {
        workspaceMembers.value = prev // rollback
        useToast().error('Couldn\'t remove member', { detail: err?.statusMessage || err?.message })
      }
    }
  }

  /**
   * Delete a workspace. Returns true on success, false on failure.
   *
   * In live mode, the backend call must succeed before we mutate local state —
   * otherwise the UI and server drift apart and the workspace appears deleted
   * locally but reappears on next refresh. On failure, we surface the error
   * via toast and leave state untouched so the caller can decide what to do
   * (e.g. don't navigate away).
   *
   * In mock mode, we just remove locally and return true.
   *
   * Note: previously this guarded `length <= 1` and silently returned, which
   * masked the real intent — owners couldn't delete their last workspace and
   * had no feedback as to why. We now respect the user's request; the page
   * router decides where to send them when activeWorkspace becomes null.
   */
  async function deleteWorkspace(id: string): Promise<boolean> {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isPersistedOnBackend = !usingMocks.value && UUID_RE.test(id)

    if (isPersistedOnBackend) {
      try {
        await $fetch(`/api/workspaces/${id}`, { method: 'DELETE', credentials: 'include' })
      } catch (err: any) {
        useToast().error('Couldn\'t delete workspace', {
          detail: getRequestErrorDetail(err),
        })
        return false
      }
    }
    // If the workspace has a non-UUID id it was never saved to the backend
    // (local-only mock), so we skip the API call and just remove it locally.

    workspaces.value = workspaces.value.filter((w) => w.id !== id)
    if (activeWorkspace.value?.id === id) {
      activeWorkspace.value = workspaces.value[0] ?? null
    }
    return true
  }

  return {
    currentUser,
    workspaces,
    activeWorkspace,
    hydrated,
    usingMocks,
    backendError,
    activeWorkspaceMembershipRole,
    canManageSkills,
    canToggleProjectSkills,
    setActiveWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    loadFromBackend,
    refreshWorkspaces,
    // Members
    workspaceMembers,
    membersLoading,
    loadWorkspaceMembers,
    inviteWorkspaceMember,
    removeWorkspaceMember,
  }
})
