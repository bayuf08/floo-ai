import { defineStore } from 'pinia'
import type {
  BrandAsset,
  Platform,
  PlatformProfile,
  Project,
  ProjectContext,
  ProjectMember,
  SavedOutput,
} from '~/types/project'
import { getAssetCategory } from '~/types/project'
import {
  canToggleProjectSkills as canToggleProjectSkillsForRole,
  removeSkillFromProjects as removeSkillFromProjectsLocal,
  syncSkillNameAcrossProjects,
  upsertProjectSkillState,
} from '~/utils/skill-library'

/**
 * Pull a useful one-line message out of an $fetch error coming from a
 * Nitro `createError({ statusCode: 400, statusMessage: 'Invalid body',
 * data: parsed.error.flatten() })` rejection. Without this, callers see
 * just "Invalid body" and have no idea which field tripped the validator.
 *
 * Order of preference:
 *   1. `err.data.fieldErrors` — the Zod flatten output: maps each field
 *      to the messages it produced. We collapse to "field: msg, …".
 *   2. `err.data.formErrors` — top-level validation messages.
 *   3. `err.statusMessage` / `err.message` — Nitro's default fallback.
 */
function formatBackendValidationError(err: any): string {
  const data = err?.data
  const fieldErrors = data?.data?.fieldErrors ?? data?.fieldErrors
  if (fieldErrors && typeof fieldErrors === 'object') {
    const parts = Object.entries(fieldErrors)
      .filter(([, msgs]) => Array.isArray(msgs) && msgs.length)
      .map(([field, msgs]) => `${field}: ${(msgs as string[])[0]}`)
    if (parts.length) return parts.join('; ')
  }
  const formErrors = data?.data?.formErrors ?? data?.formErrors
  if (Array.isArray(formErrors) && formErrors.length) return formErrors[0]
  return err?.statusMessage || err?.message || 'Unknown error'
}

/**
 * Mock projects used ONLY when the backend is unreachable. They live in a
 * separate const (not the initial value of `projects`) so we can swap them
 * out atomically on first successful backend hit — even when the backend
 * returns an empty array (a brand-new user with zero projects yet).
 */
const MOCK_PROJECTS: Project[] = [
    {
      id: 'proj-1',
      name: 'Kayu — SS26 Campaign',
      workspaceId: 'ws-1',
      platform: 'tiktok',
      color: '#4B70B6',
      updatedAt: new Date(Date.now() - 2 * 60 * 1000), // 2m ago
      contextRules: {
        brandVoice:
          'Quiet, deliberate, weight-bearing. Speaks in short Indonesian sentences, occasional code-switch to English when it lands harder. No exclamation marks, no hype words ("amazing", "incredible"). Reads like an artisan who knows their craft is enough.',
        doGuidelines: [
          'Reference materials and process — clay, glaze, fire, time.',
          'Mention Bantul, Yogyakarta, single-fire technique.',
          'Show hands and craft over product alone.',
        ],
        dontGuidelines: [
          'Trend slang ("fr", "lowkey").',
          'Generic adjectives ("beautiful", "stunning").',
          'Lifestyle stock photography.',
          'Drop-shadow text on imagery.',
        ],
        skills: [
          { id: 'sk-1', name: 'Tone Mirror', active: true },
          { id: 'sk-2', name: 'Hook Generator', active: true },
          { id: 'sk-3', name: 'Visual Brief', active: true },
        ],
        brandAssets: [
          {
            id: 'asset-1',
            name: 'Kayu_SS26_Moodboard.pdf',
            size: '4.2 MB',
            sizeBytes: 4400000,
            category: 'document',
            extension: 'pdf',
            uploadedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            description: 'Visual direction and mood references for the SS26 drop.',
          },
          {
            id: 'asset-2',
            name: 'Tone_of_Voice_Guide.docx',
            size: '890 KB',
            sizeBytes: 911360,
            category: 'document',
            extension: 'docx',
            uploadedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            description: '',
          },
          {
            id: 'asset-3',
            name: 'Competitor_Analysis_Q1.xlsx',
            size: '1.1 MB',
            sizeBytes: 1153433,
            category: 'spreadsheet',
            extension: 'xlsx',
            uploadedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            description: 'Top 5 competitors, posting cadence, engagement rates.',
          },
        ],
        hashtags: [
          '#KayuStudio',
          '#SS26',
          '#SlowCraft',
          '#CeramicsFromBantul',
          '#SingleFire',
          '#MadeInJogja',
        ],
      },
      members: [
        {
          id: 'user-1',
          name: 'Rara Anjani',
          email: 'rara@floothink.com',
          initials: 'RA',
          avatarColor: '#5B479D',
          role: 'owner',
          joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'member-seed-1',
          name: 'Dito Setiawan',
          email: 'dito@floothink.com',
          initials: 'DS',
          avatarColor: '#4B70B6',
          role: 'editor',
          joinedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
      ],
    },
    {
      id: 'proj-2',
      name: 'Lumen Studio Launch',
      workspaceId: 'ws-1',
      platform: 'instagram',
      color: '#FBB040',
      updatedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    },
    {
      id: 'proj-3',
      name: 'Panen Festival 2026',
      workspaceId: 'ws-1',
      platform: 'twitter',
      color: '#4DAF4E',
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h ago
    },
    {
      id: 'proj-4',
      name: 'Morning Drop Newsletter',
      workspaceId: 'ws-3',
      platform: 'threads',
      color: '#4B70B6',
      updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1d ago
    },
    {
      id: 'proj-5',
      name: 'Q4 Trend Archive',
      workspaceId: 'ws-1',
      platform: 'youtube',
      color: '#E85D5D',
      updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4d ago
    },
    {
      id: 'proj-6',
      name: 'Spark Method Workshop',
      workspaceId: 'ws-1',
      platform: 'linkedin',
      color: '#FBB040',
      updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1w ago
    },
    {
      id: 'proj-7',
      name: 'Senja Capsule Drop',
      workspaceId: 'ws-1',
      platform: 'instagram',
      color: '#E1306C',
      updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2w ago
    },
    {
      id: 'proj-8',
      name: 'Bumi Reset Series',
      workspaceId: 'ws-2',
      platform: 'youtube',
      color: '#4DAF4E',
      updatedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), // 3w ago
    },
    {
      id: 'proj-9',
      name: 'Pelangi Kids Launch',
      workspaceId: 'ws-3',
      platform: 'tiktok',
      color: '#FBE225',
      updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 1mo ago
    },
    {
      id: 'proj-10',
      name: 'Rumah Studio Reopening',
      workspaceId: 'ws-2',
      platform: 'twitter',
      color: '#5B479D',
      updatedAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000), // 1mo ago
    },
]

export const useProjectsStore = defineStore('projects', () => {
  const userStore = useUserStore()

  // Start empty — the layout's onMounted hits /api/projects and fills this
  // in within a few hundred ms. Pre-populating with `MOCK_PROJECTS` (the
  // const above, kept for reference) made the sidebar flash fake project
  // names ("Kayu — SS26 Campaign", etc.) before the real ones loaded.
  // The MOCK_PROJECTS constant is intentionally retained as a reference
  // schema / future demo-mode hook, but no longer hydrates initial state.
  const projects = ref<Project[]>([])

  const activeProjectId = ref<string | null>(null)

  /**
   * Backend hydration state.
   *
   * usingMocks  = true when the local mock array is the source of truth.
   *               Flipped to false the first time a /api/projects fetch succeeds.
   * hydratedWs  = set of workspace ids we've already pulled from the backend
   *               so we don't re-fetch on every workspace switch unnecessarily.
   */
  const usingMocks = ref(true)
  const hydratedWs = ref<Set<string>>(new Set())
  /** Last error from a backend call, surfaced for UI signaling. Cleared on next success. */
  const backendError = ref<string | null>(null)
  const canToggleSkills = computed(() =>
    userStore.usingMocks ? true : canToggleProjectSkillsForRole(userStore.activeWorkspaceMembershipRole)
  )

  /** Projects belonging to the currently active workspace — used by the sidebar list. */
  const projectsByWorkspace = computed(() =>
    projects.value.filter((p) => p.workspaceId === userStore.activeWorkspace?.id)
  )

  /**
   * Load projects for a workspace from the backend. Replaces (or merges) the
   * local mock entries for that workspace with live data. Safe to call on
   * every workspace switch; deduped via hydratedWs.
   *
   * Falls back silently if the API isn't reachable — mocks remain visible.
   */
  async function loadFromBackend(workspaceId?: string) {
    const wsId = workspaceId ?? userStore.activeWorkspace?.id
    if (!wsId) return
    if (hydratedWs.value.has(wsId)) return

    try {
      const rows = await $fetch<any[]>(`/api/projects?workspace=${wsId}`, {
        credentials: 'include',
      })
      // First successful response — wipe all mock data globally. After this
      // point `projects.value` is owned by the backend (per workspace).
      if (usingMocks.value) {
        projects.value = []
        usingMocks.value = false
      } else {
        // Already in backend mode — only drop entries for the workspace we're
        // refreshing, leave other-workspace caches alone.
        projects.value = projects.value.filter((p) => p.workspaceId !== wsId)
      }
      projects.value.push(...(rows ?? []).map((r) => rowToProject(r)))
      hydratedWs.value.add(wsId)
      backendError.value = null

      // If the URL pinned us to a specific project before backend hydration
      // finished, the route-param watcher already called setActiveProject()
      // — but its loadProjectDetail/loadHistory side-effects were gated on
      // `usingMocks` being false (it wasn't yet). Now that we're in backend
      // mode, hydrate detail + chat history for whatever project is active
      // so the chat store flips out of mocks. Without this, the chat thread
      // silently keeps using the canned mock reply on page load / refresh.
      const active = activeProjectId.value
      if (active && !active.startsWith('proj-pending-')) {
        loadProjectDetail(active).catch(() => {/* already logged */})
        // Lazy-import to avoid circular dep at module init.
        import('./chat').then(({ useChatStore }) => {
          useChatStore().loadHistory(active).catch(() => {/* already logged */})
        })
      }
    } catch (err: any) {
      // Failed: drop the workspace from hydratedWs so a workspace switch
      // (or manual retry) can re-attempt.
      hydratedWs.value.delete(wsId)
      backendError.value = err?.statusMessage || err?.message || 'Network error'
      console.warn('[projectsStore] backend not reachable for workspace', wsId, err)
    }
  }

  /** Load full project detail (context + skills + members + brand assets) into the local entry. */
  async function loadProjectDetail(projectId: string) {
    if (usingMocks.value) return
    try {
      const [row, assets] = await Promise.all([
        $fetch<any>(`/api/projects/${projectId}`, { credentials: 'include' }),
        $fetch<any[]>(`/api/projects/${projectId}/assets`, { credentials: 'include' }).catch(() => []),
      ])
      const full = rowToProject(row, true)
      // Hydrate brand assets from the dedicated endpoint (signed preview URLs included).
      if (full.contextRules) {
        full.contextRules.brandAssets = (assets ?? []).map((a: any) => ({
          id: a.id,
          name: a.name,
          size: formatBytes(a.size_bytes ?? 0),
          sizeBytes: a.size_bytes ?? 0,
          category: a.category,
          extension: a.extension,
          uploadedAt: new Date(a.uploaded_at ?? Date.now()),
          description: a.description ?? '',
          previewUrl: a.preview_url ?? undefined,
          extractionStatus: a.extraction_status ?? undefined,
        }))
      }
      const idx = projects.value.findIndex((p) => p.id === projectId)
      if (idx >= 0) projects.value[idx] = full
      else projects.value.unshift(full)
    } catch (err) {
      console.warn('[projectsStore] loadProjectDetail failed', projectId, err)
    }
  }

  /**
   * Re-fetch just the brand-assets list for a project — used by the Knowledge
   * tab's pending-extraction poller so we don't refetch the entire project
   * (rules, skills, members, history) every 5s. Updates the in-place asset
   * list rather than replacing the project, so unrelated reactivity (e.g.
   * the rules editor) doesn't churn.
   */
  async function refreshBrandAssets(projectId: string): Promise<void> {
    if (usingMocks.value) return
    if (projectId.startsWith('proj-pending-')) return
    try {
      const rows = await $fetch<any[]>(`/api/projects/${projectId}/assets`, {
        credentials: 'include',
      })
      const project = projects.value.find((p) => p.id === projectId)
      if (!project) return
      const ctx = project.contextRules
      if (!ctx) return
      ctx.brandAssets = (rows ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        size: formatBytes(a.size_bytes ?? 0),
        sizeBytes: a.size_bytes ?? 0,
        category: a.category,
        extension: a.extension,
        uploadedAt: new Date(a.uploaded_at ?? Date.now()),
        description: a.description ?? '',
        previewUrl: a.preview_url ?? undefined,
        extractionStatus: a.extraction_status ?? undefined,
      }))
    } catch (err) {
      console.warn('[projectsStore] refreshBrandAssets failed', projectId, err)
    }
  }

  /**
   * Reconcile an optimistic locally-added BrandAsset with the persisted row
   * returned from POST /api/projects/:id/assets. Matches by file name + size
   * (the optimistic entry has a temp id; the server row carries the real
   * UUID, extraction_status, etc.).
   */
  function reconcileBrandAsset(
    projectId: string,
    optimisticName: string,
    optimisticSizeBytes: number,
    serverRow: any,
  ) {
    const project = projects.value.find((p) => p.id === projectId)
    const assets = project?.contextRules?.brandAssets
    if (!assets) return
    const idx = assets.findIndex(
      (a) =>
        a.id.startsWith('asset-') &&
        a.name === optimisticName &&
        a.sizeBytes === optimisticSizeBytes,
    )
    if (idx < 0) return
    const previousPreview = assets[idx]!.previewUrl
    assets[idx] = {
      ...assets[idx]!,
      id: serverRow.id,
      // The server doesn't return preview_url for non-images; preserve any
      // local objectURL we created so the image card doesn't flash.
      previewUrl: serverRow.preview_url ?? previousPreview,
      description: serverRow.description ?? assets[idx]!.description,
      extractionStatus: serverRow.extraction_status ?? undefined,
    } as BrandAsset
  }

  /**
   * Map a backend row (snake_case) into the frontend Project shape (camelCase).
   * Optionally hydrates contextRules / members / skills if present.
   */
  function rowToProject(row: any, withDetails = false): Project {
    const project: Project = {
      id: row.id,
      name: row.name,
      workspaceId: row.workspace_id,
      platform: row.platform,
      color: row.color ?? '#4B70B6',
      isPinned: !!row.is_pinned,
      updatedAt: new Date(row.updated_at ?? row.created_at ?? Date.now()),
    }
    if (!withDetails) return project

    // Detail row from /api/projects/:id includes nested context, project_skills, project_members
    const ctxRow = Array.isArray(row.context) ? row.context[0] : row.context
    const skillsRows = Array.isArray(row.project_skills) ? row.project_skills : []
    const memberRows = Array.isArray(row.project_members) ? row.project_members : []

    project.contextRules = {
      brandVoice: ctxRow?.brand_voice ?? '',
      doGuidelines: ctxRow?.do_guidelines ?? [],
      dontGuidelines: ctxRow?.dont_guidelines ?? [],
      hashtags: ctxRow?.hashtags ?? [],
      skills: skillsRows
        .filter((s: any) => s.skill)
        .map((s: any) => ({
          id: s.skill.id,
          name: s.skill.name,
          active: !!s.active,
        })),
      brandAssets: [], // Loaded separately via /api/projects/:id/assets
      savedOutputs: [],
      platformProfile: ctxRow?.platform_handle
        ? {
            platform: project.platform,
            handle: ctxRow.platform_handle,
            followers: ctxRow.platform_followers ?? undefined,
            bio: ctxRow.platform_bio ?? undefined,
          }
        : undefined,
    }

    project.members = memberRows.map((m: any) => ({
      id: m.user?.id ?? m.id,
      name: m.user?.name ?? '—',
      email: m.user?.email ?? '',
      initials: m.user?.initials ?? '??',
      avatarColor: '#5B479D',
      role: m.role,
      joinedAt: new Date(m.joined_at ?? Date.now()),
    }))

    return project
  }

  /**
   * The active project, guarded so it only returns a project that actually
   * belongs to the current workspace. Returns null when the workspace is
   * switched away from the project currently open.
   */
  const activeProject = computed(() =>
    projectsByWorkspace.value.find((p) => p.id === activeProjectId.value) ?? null
  )

  /**
   * When the active workspace changes:
   *   1. Hydrate that workspace's projects from the backend (if available)
   *   2. Reset activeProjectId to the first project in the new workspace
   */
  watch(
    () => userStore.activeWorkspace?.id,
    async (newWsId) => {
      if (!newWsId) return
      await loadFromBackend(newWsId)
      const first = projects.value.find((p) => p.workspaceId === newWsId) ?? null
      activeProjectId.value = first?.id ?? null
    },
    { immediate: false }
  )

  function setActiveProject(id: string) {
    activeProjectId.value = id
    // Lazy-hydrate detail (context, skills, members) and chat history for
    // the project the user just opened. Both functions are idempotent and
    // self-guard for mock mode / pending ids — we no longer gate on
    // `usingMocks` here so the call is queued even if backend hydration
    // hasn't completed yet (loadFromBackend will retry once it lands).
    if (!id || id.startsWith('proj-pending-')) return
    loadProjectDetail(id).catch(() => {/* already logged */})
    // Lazy-import the chat store to avoid a circular dep at module init
    import('./chat').then(({ useChatStore }) => {
      useChatStore().loadHistory(id).catch(() => {/* already logged */})
    })
  }

  function getRelativeTime(date: Date): string {
    const now = Date.now()
    const diff = now - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    const weeks = Math.floor(diff / 604800000)
    const months = Math.floor(diff / 2592000000)

    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    if (weeks < 4) return `${weeks}w`
    return `${months}mo`
  }

  /**
   * Tracks in-flight project creates: tempId → Promise<realId | null>.
   * Used by chat.sendMessage so a Send pressed before the create returns can
   * await the real id (with a short timeout) instead of vanishing into the
   * mock path. Resolves to `null` if the create failed.
   */
  const pendingProjectIds = new Map<string, Promise<string | null>>()

  /** Look up the in-flight resolution promise for a 'proj-pending-*' id. */
  function awaitRealProjectId(tempId: string): Promise<string | null> {
    return pendingProjectIds.get(tempId) ?? Promise.resolve(null)
  }

  /**
   * Create a new project. In backend mode, calls POST /api/projects and uses
   * the row returned by the server as the new local entry. In mock mode,
   * generates a local id.
   */
  async function createProject(input: { name: string; platform: Platform; description?: string }): Promise<string> {
    let wsId = userStore.activeWorkspace?.id ?? 'ws-1'
    const palette = ['#5B479D', '#FBB040', '#4B70B6', '#4DAF4E', '#E85D5D', '#E1306C']
    const color = palette[projects.value.length % palette.length]!

    if (!usingMocks.value) {
      // Optimistic: insert a placeholder, then reconcile when the API responds.
      const tempId = `proj-pending-${Date.now()}`
      projects.value.unshift({
        id: tempId,
        name: input.name,
        workspaceId: wsId,
        platform: input.platform,
        color,
        updatedAt: new Date(),
        contextRules: input.description
          ? {
              brandVoice: input.description,
              doGuidelines: [],
              dontGuidelines: [],
              skills: [],
            }
          : undefined,
      })

      // ── Pre-flight: workspace_id must be a UUID ────────────────
      // The POST /api/projects validator requires `workspace_id: z.string().uuid()`.
      // If the active workspace is a local-only mock (id like `ws-1234567890`),
      // first attempt auto-recovery by re-fetching workspaces from the backend.
      // This handles transient cases where the workspace was created during sign-up
      // but hadn't loaded yet, or a brief network blip caused createWorkspace to
      // fall back to a mock ID.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!UUID_RE.test(wsId)) {
        console.warn(
          '[projectsStore] createProject — workspace_id is not a UUID, attempting recovery',
          { wsId, activeWorkspace: userStore.activeWorkspace }
        )
        await userStore.refreshWorkspaces()
        wsId = userStore.activeWorkspace?.id ?? ''

        if (!UUID_RE.test(wsId)) {
          // Still broken after refresh — give up and surface a clear error.
          projects.value = projects.value.filter((p) => p.id !== tempId)
          const resolution = Promise.resolve(null).finally(() => {
            pendingProjectIds.delete(tempId)
          })
          pendingProjectIds.set(tempId, resolution)
          useToast().error("Couldn't save the new project", {
            detail:
              'Your workspace could not be found on the server. ' +
              'Please reload the page or contact support if the issue persists.',
          })
          console.warn(
            '[projectsStore] createProject aborted — workspace_id still not a UUID after refresh',
            { wsId, activeWorkspace: userStore.activeWorkspace }
          )
          return tempId
        }

        // Recovered — update the optimistic placeholder to use the real workspace id.
        const placeholder = projects.value.find((p) => p.id === tempId)
        if (placeholder) placeholder.workspaceId = wsId
      }

      const resolution = $fetch<any>('/api/projects', {
        method: 'POST',
        credentials: 'include',
        body: {
          workspace_id: wsId,
          name: input.name,
          platform: input.platform,
          color,
          // Strip empty strings — keeps `description: ''` from passing
          // through and (in some Zod configs) tripping `.min()` checks.
          // The server's schema uses `.optional()` only, so undefined is
          // fine here.
          ...(input.description ? { description: input.description } : {}),
        },
      })
        .then(async (row) => {
          // Snapshot any context edits the user made on the temp record while
          // the create was in flight. We need them BEFORE swapping the id, so
          // we can replay them against the persisted project.
          const tempProject = projects.value.find((p) => p.id === tempId)
          const localCtx = tempProject?.contextRules
            ? {
                brandVoice: tempProject.contextRules.brandVoice,
                doGuidelines: [...tempProject.contextRules.doGuidelines],
                dontGuidelines: [...tempProject.contextRules.dontGuidelines],
                hashtags: [...(tempProject.contextRules.hashtags ?? [])],
                activeSkillIds: tempProject.contextRules.skills
                  .filter((s) => s.active)
                  .map((s) => s.id),
              }
            : null

          const idx = projects.value.findIndex((p) => p.id === tempId)
          if (idx >= 0) projects.value[idx] = rowToProject(row)
          if (activeProjectId.value === tempId) activeProjectId.value = row.id

          await replayPendingEdits(row.id, localCtx).catch((err) => {
            console.warn('[projectsStore] replay of pending edits failed', err)
          })

          return row.id as string
        })
        .catch((err) => {
          console.warn('[projectsStore] createProject backend failed; keeping local entry', err)
          // Pull the Zod field-level error out of `err.data` (set by
          // the createError({ data: parsed.error.flatten() }) call on
          // the server). Falls back to err.message ("Invalid body") so
          // we never lose context.
          const detail = formatBackendValidationError(err)
          useToast().error("Couldn't save the new project to the server", { detail })
          return null
        })
        .finally(() => {
          pendingProjectIds.delete(tempId)
        })

      pendingProjectIds.set(tempId, resolution)
      return tempId
    }

    // Mock-only path
    const id = `proj-${Date.now()}`
    projects.value.unshift({
      id,
      name: input.name,
      workspaceId: wsId,
      platform: input.platform,
      color,
      updatedAt: new Date(),
      contextRules: input.description
        ? {
            brandVoice: input.description,
            doGuidelines: [],
            dontGuidelines: [],
            skills: [],
          }
        : undefined,
    })
    return id
  }

  /**
   * After a 'proj-pending-*' resolves to a real id, replay any context edits
   * the user made on the optimistic record so they survive the server swap.
   * Skipped if there's nothing to replay.
   */
  async function replayPendingEdits(
    realId: string,
    snapshot: {
      brandVoice: string
      doGuidelines: string[]
      dontGuidelines: string[]
      hashtags: string[]
      activeSkillIds: string[]
    } | null,
  ) {
    if (!snapshot) return

    const ctxPatch: Record<string, unknown> = {}
    if (snapshot.brandVoice) ctxPatch.brand_voice = snapshot.brandVoice
    if (snapshot.doGuidelines.length) ctxPatch.do_guidelines = snapshot.doGuidelines
    if (snapshot.dontGuidelines.length) ctxPatch.dont_guidelines = snapshot.dontGuidelines
    if (snapshot.hashtags.length) ctxPatch.hashtags = snapshot.hashtags

    // Nuxt 4's auto-generated `$fetch` route-key types overflow vue-tsc's
    // recursion limit on templated paths (TS2321). Cast through a plain
    // function signature so the call type-checks without losing runtime
    // behavior — `$fetch` continues to be the Nuxt one.
    const fetcher = $fetch as unknown as (
      url: string,
      init?: { method?: string; credentials?: 'include' | 'omit' | 'same-origin'; body?: unknown },
    ) => Promise<unknown>

    const tasks: Promise<unknown>[] = []
    if (Object.keys(ctxPatch).length) {
      tasks.push(
        fetcher(`/api/projects/${realId}/context`, {
          method: 'PATCH',
          credentials: 'include',
          body: ctxPatch,
        }),
      )
    }
    for (const skillId of snapshot.activeSkillIds) {
      tasks.push(
        fetcher(`/api/projects/${realId}/skills`, {
          method: 'POST',
          credentials: 'include',
          body: { skill_id: skillId, active: true },
        }),
      )
    }

    if (!tasks.length) return
    await Promise.allSettled(tasks)
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter((p) => p.id !== id)
    if (activeProjectId.value === id) {
      activeProjectId.value = projectsByWorkspace.value[0]?.id ?? null
    }
    if (!usingMocks.value && !id.startsWith('proj-pending-')) {
      $fetch(`/api/projects/${id}`, { method: 'DELETE', credentials: 'include' }).catch((err) => {
        console.warn('[projectsStore] deleteProject backend failed', err)
        useToast().error('Project removed locally but the server delete failed', { detail: err?.message })
      })
    }
  }

  function renameProject(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const p = projects.value.find((p) => p.id === id)
    if (p) p.name = trimmed
    if (!usingMocks.value && !id.startsWith('proj-pending-')) {
      $fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        body: { name: trimmed },
      }).catch((err) => console.warn('[projectsStore] renameProject backend failed', err))
    }
  }

  /** Human-readable file size — local helper, also used by ContextAssetUploader. */
  function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }

  /** Push a new BrandAsset onto the project's contextRules.brandAssets array. */
  /**
   * Insert an optimistic local-only BrandAsset and return its temp id.
   * Caller (ContextAssetUploader) holds onto the id so it can either
   * reconcile with the persisted server row or remove the entry if the
   * upload failed (e.g. "Bucket not found"). Returns null when the
   * project doesn't exist locally — no temp row is inserted.
   */
  function addBrandAsset(projectId: string, file: File, previewUrl?: string): string | null {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return null

    if (!project.contextRules) {
      project.contextRules = {
        brandVoice: '',
        doGuidelines: [],
        dontGuidelines: [],
        skills: [],
        brandAssets: [],
      }
    }
    if (!project.contextRules.brandAssets) {
      project.contextRules.brandAssets = []
    }

    const tempId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const asset: BrandAsset = {
      id: tempId,
      name: file.name,
      size: formatBytes(file.size),
      sizeBytes: file.size,
      category: getAssetCategory(file.name),
      extension: file.name.split('.').pop()?.toLowerCase() ?? '',
      uploadedAt: new Date(),
      description: '',
      previewUrl,
    }
    project.contextRules.brandAssets.unshift(asset)
    project.updatedAt = new Date()
    return tempId
  }

  /** Remove an asset and revoke its previewUrl (if any) to free memory. */
  function removeBrandAsset(projectId: string, assetId: string) {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project?.contextRules?.brandAssets) return
    const asset = project.contextRules.brandAssets.find((a) => a.id === assetId)
    if (asset?.previewUrl) {
      try {
        URL.revokeObjectURL(asset.previewUrl)
      } catch {
        // ignore — already revoked or invalid
      }
    }
    project.contextRules.brandAssets = project.contextRules.brandAssets.filter(
      (a) => a.id !== assetId
    )
  }

  /** Update only the description field of an existing asset. */
  function updateAssetDescription(projectId: string, assetId: string, description: string) {
    const project = projects.value.find((p) => p.id === projectId)
    const asset = project?.contextRules?.brandAssets?.find((a) => a.id === assetId)
    if (asset) asset.description = description
  }

  // ─── Pin / bookmark ───────────────────────────────────────────────────
  function togglePin(id: string) {
    const p = projects.value.find((p) => p.id === id)
    if (!p) return
    p.isPinned = !p.isPinned
    if (!usingMocks.value && !id.startsWith('proj-pending-')) {
      $fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        body: { is_pinned: p.isPinned },
      }).catch((err) => console.warn('[projectsStore] togglePin backend failed', err))
    }
  }

  // ─── Duplicate ─────────────────────────────────────────────────────────
  function duplicateProject(id: string): string | undefined {
    const original = projects.value.find((p) => p.id === id)
    if (!original) return undefined
    // Clone — strip Date references and rehydrate
    const cloned: Project = JSON.parse(
      JSON.stringify({ ...original, updatedAt: original.updatedAt.toISOString() })
    )
    cloned.id = `proj-${Date.now()}`
    cloned.name = `${original.name} (copy)`
    cloned.updatedAt = new Date()
    // Rehydrate dates inside contextRules.brandAssets / members
    if (cloned.contextRules?.brandAssets) {
      cloned.contextRules.brandAssets = cloned.contextRules.brandAssets.map((a) => ({
        ...a,
        uploadedAt: new Date(a.uploadedAt),
      }))
    }
    if (cloned.members) {
      cloned.members = cloned.members.map((m) => ({ ...m, joinedAt: new Date(m.joinedAt) }))
    }
    projects.value.unshift(cloned)
    return cloned.id
  }

  // ─── Change platform ──────────────────────────────────────────────────
  function changePlatform(id: string, platform: Platform) {
    const p = projects.value.find((p) => p.id === id)
    if (!p) return
    p.platform = platform
    p.updatedAt = new Date()
    if (!usingMocks.value && !id.startsWith('proj-pending-')) {
      $fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        body: { platform },
      }).catch((err) => console.warn('[projectsStore] changePlatform backend failed', err))
    }
  }

  // ─── Duplicate (override the local-only duplicateProject defined above) ──
  async function duplicateProjectViaApi(id: string): Promise<string | undefined> {
    if (usingMocks.value) return duplicateProject(id)
    try {
      const row = await $fetch<any>(`/api/projects/${id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
      })
      const newProject = rowToProject(row)
      projects.value.unshift(newProject)
      return newProject.id
    } catch (err) {
      console.warn('[projectsStore] duplicateProject backend failed; falling back to local', err)
      return duplicateProject(id)
    }
  }

  // ─── Skill toggle ─────────────────────────────────────────────────────
  async function toggleSkill(projectId: string, skillId: string) {
    const p = projects.value.find((p) => p.id === projectId)
    const skill = p?.contextRules?.skills.find((s) => s.id === skillId)
    if (!skill) return false
    return setProjectSkillActive(projectId, { id: skill.id, name: skill.name }, !skill.active)
  }

  async function setProjectSkillActive(
    projectId: string,
    skill: { id: string; name: string },
    active: boolean,
  ) {
    if (!canToggleSkills.value) return false

    const project = projects.value.find((entry) => entry.id === projectId)
    if (!project) return false

    const originalContext = project.contextRules
      ? {
          ...project.contextRules,
          skills: [...project.contextRules.skills],
        }
      : null

    const nextContext = project.contextRules ?? {
      brandVoice: '',
      doGuidelines: [],
      dontGuidelines: [],
      skills: [],
    }

    project.contextRules = {
      ...nextContext,
      skills: upsertProjectSkillState(nextContext.skills, skill, active),
    }

    // Layer A — short-circuit to local-only when *either* store is on mocks.
    // The skills store and projects store each carry their own `usingMocks`
    // flag, and they can desync (e.g. skills.loadFromBackend failed silently
    // while projects.loadFromBackend succeeded). Without this guard we'd POST
    // a non-UUID skill_id like "sk-v1" and Postgres would throw
    // `invalid input syntax for type uuid`.
    const skillsStore = useSkillsStore()
    if (
      usingMocks.value ||
      projectId.startsWith('proj-pending-') ||
      skillsStore.usingMocks
    ) {
      if (skillsStore.usingMocks && !usingMocks.value) {
        console.warn(
          '[projectsStore] Skill catalog still on mocks while projects are live — ' +
            'skipping API toggle to avoid sending a non-UUID skill_id.',
        )
      }
      return true
    }

    // Layer B — UUID shape guard. Catches any other path that might land here
    // with a non-UUID id (e.g. an in-flight `sk-custom-…` placeholder from
    // skillsStore.createSkill) and surfaces a friendlier message instead of
    // letting Postgres do it.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(skill.id)) {
      project.contextRules = originalContext
        ? {
            ...originalContext,
            skills: [...originalContext.skills],
          }
        : undefined
      useToast().error("Couldn't update project skills", {
        detail: 'Skill catalog is still loading. Try again in a moment.',
      })
      return false
    }

    try {
      await $fetch(`/api/projects/${projectId}/skills`, {
        method: 'POST',
        credentials: 'include',
        body: { skill_id: skill.id, active },
      })
      return true
    } catch (err: any) {
      project.contextRules = originalContext
        ? {
            ...originalContext,
            skills: [...originalContext.skills],
          }
        : undefined
      console.warn('[projectsStore] setProjectSkillActive backend failed', err)
      useToast().error('Couldn\'t update project skills', { detail: err?.statusMessage || err?.message })
      return false
    }
  }

  function syncSkillName(skillId: string, name: string) {
    projects.value = syncSkillNameAcrossProjects(projects.value, skillId, name)
  }

  function removeSkillFromProjects(skillId: string) {
    projects.value = removeSkillFromProjectsLocal(projects.value, skillId)
  }

  // ─── Brand voice / DO / DON'T / hashtag mutations ─────────────────────
  function ensureContextRules(projectId: string): ProjectContext | null {
    const p = projects.value.find((p) => p.id === projectId)
    if (!p) return null
    if (!p.contextRules) {
      p.contextRules = { brandVoice: '', doGuidelines: [], dontGuidelines: [], skills: [] }
    }
    return p.contextRules
  }

  /** Mirror a partial context patch to the backend (fire-and-forget). */
  function pushContextPatch(projectId: string, patch: Record<string, unknown>) {
    if (usingMocks.value || projectId.startsWith('proj-pending-')) return
    $fetch(`/api/projects/${projectId}/context`, {
      method: 'PATCH',
      credentials: 'include',
      body: patch,
    }).catch((err) => console.warn('[projectsStore] context patch failed', err))
  }

  // ─── Platform profile ─────────────────────────────────────────────────
  function updatePlatformProfile(projectId: string, profile: PlatformProfile) {
    const ctx = ensureContextRules(projectId)
    if (!ctx) return
    ctx.platformProfile = { ...profile }
    pushContextPatch(projectId, {
      platform_handle: profile.handle,
      platform_bio: profile.bio ?? null,
      platform_followers: profile.followers ?? null,
    })
  }

  // ─── Saved outputs ────────────────────────────────────────────────────
  function saveOutput(
    projectId: string,
    card: { label?: string; sub?: string; accent?: string; items: string[] }
  ) {
    const ctx = ensureContextRules(projectId)
    if (!ctx) return
    if (!ctx.savedOutputs) ctx.savedOutputs = []
    const saved: SavedOutput = {
      id: `saved-${Date.now()}`,
      label: card.label ?? 'Output',
      sub: card.sub,
      accent: card.accent,
      items: [...card.items],
      savedAt: new Date(),
    }
    ctx.savedOutputs.unshift(saved)
  }

  // ─── Members / collaborators ──────────────────────────────────────────
  function inviteMember(
    projectId: string,
    invite: { name: string; email: string; role: 'editor' | 'viewer' }
  ): { ok: boolean; error?: string } {
    const p = projects.value.find((p) => p.id === projectId)
    if (!p) return { ok: false, error: 'Project not found' }
    if (!p.members) p.members = []
    if (p.members.some((m) => m.email.trim().toLowerCase() === invite.email.trim().toLowerCase())) {
      return { ok: false, error: 'This person is already on this project.' }
    }
    const initials = invite.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??'
    const colors = ['#4B70B6', '#4DAF4E', '#FBB040', '#E85D5D', '#E1306C', '#5B479D']
    p.members.push({
      id: `member-${Date.now()}`,
      name: invite.name.trim(),
      email: invite.email.trim(),
      initials,
      avatarColor: colors[p.members.length % colors.length]!,
      role: invite.role,
      joinedAt: new Date(),
    })
    return { ok: true }
  }

  function removeMember(projectId: string, memberId: string) {
    const p = projects.value.find((p) => p.id === projectId)
    if (!p?.members) return
    p.members = p.members.filter((m) => m.id !== memberId || m.role === 'owner')
  }

  function updateMemberRole(
    projectId: string,
    memberId: string,
    role: 'editor' | 'viewer'
  ) {
    const p = projects.value.find((p) => p.id === projectId)
    const m = p?.members?.find((m) => m.id === memberId)
    if (m && m.role !== 'owner') m.role = role
  }

  return {
    projects,
    projectsByWorkspace,
    activeProjectId,
    activeProject,
    usingMocks,
    backendError,
    setActiveProject,
    getRelativeTime,
    awaitRealProjectId,
    loadFromBackend,
    loadProjectDetail,
    createProject,
    deleteProject,
    renameProject,
    formatBytes,
    addBrandAsset,
    removeBrandAsset,
    updateAssetDescription,
    reconcileBrandAsset,
    refreshBrandAssets,
    togglePin,
    duplicateProject,
    duplicateProjectViaApi,
    changePlatform,
    canToggleSkills,
    toggleSkill,
    setProjectSkillActive,
    syncSkillName,
    removeSkillFromProjects,
    updatePlatformProfile,
    saveOutput,
    inviteMember,
    removeMember,
    updateMemberRole,
  }
})
