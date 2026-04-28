import { defineStore } from 'pinia'
import type {
  BrandAsset,
  Platform,
  PlatformProfile,
  Project,
  ProjectContext,
  ProjectMember,
  RulesTemplate,
  SavedOutput,
} from '~/types/project'
import { getAssetCategory } from '~/types/project'

export const useProjectsStore = defineStore('projects', () => {
  const userStore = useUserStore()

  const projects = ref<Project[]>([
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
  ])

  const activeProjectId = ref<string | null>('proj-1')

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
      // Drop existing entries for this workspace, replace with backend rows.
      projects.value = [
        ...projects.value.filter((p) => p.workspaceId !== wsId),
        ...rows.map(rowToProject),
      ]
      hydratedWs.value.add(wsId)
      usingMocks.value = false
    } catch (err) {
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
        full.contextRules.brandAssets = (assets ?? []).map(mapAssetRow)
      }
      const idx = projects.value.findIndex((p) => p.id === projectId)
      if (idx >= 0) projects.value[idx] = full
      else projects.value.unshift(full)
    } catch (err) {
      console.warn('[projectsStore] loadProjectDetail failed', projectId, err)
    }
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
    // Lazy-hydrate detail (context, skills, members) and chat history
    // for the project the user just opened. Skipped in mock mode.
    if (!usingMocks.value) {
      loadProjectDetail(id).catch(() => {/* already logged */})
      // Lazy-import the chat store to avoid a circular dep at module init
      import('./chat').then(({ useChatStore }) => {
        useChatStore().loadHistory(id).catch(() => {/* already logged */})
      })
    }
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
   * Create a new project. In backend mode, calls POST /api/projects and uses
   * the row returned by the server as the new local entry. In mock mode,
   * generates a local id.
   */
  function createProject(input: { name: string; platform: Platform; description?: string }): string {
    const wsId = userStore.activeWorkspace?.id ?? 'ws-1'
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

      $fetch<any>('/api/projects', {
        method: 'POST',
        credentials: 'include',
        body: { workspace_id: wsId, name: input.name, platform: input.platform, color, description: input.description },
      })
        .then((row) => {
          const idx = projects.value.findIndex((p) => p.id === tempId)
          if (idx >= 0) projects.value[idx] = rowToProject(row)
          if (activeProjectId.value === tempId) activeProjectId.value = row.id
        })
        .catch((err) => {
          console.warn('[projectsStore] createProject backend failed; keeping local entry', err)
          useToast().error('Couldn\'t save the new project to the server', { detail: err?.message })
        })

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

  /** Snake-case API row → camelCase BrandAsset shape. */
  function mapAssetRow(a: any): BrandAsset {
    return {
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
      extractionError: a.extraction_error ?? undefined,
    }
  }

  /**
   * Re-fetch the asset list from the server and replace the local copy
   * for the given project. Used by the upload reconciler, the Retry button,
   * and the pending-extraction poller.
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
      if (!project.contextRules) {
        project.contextRules = {
          brandVoice: '',
          doGuidelines: [],
          dontGuidelines: [],
          skills: [],
          brandAssets: [],
        }
      }
      project.contextRules.brandAssets = (rows ?? []).map(mapAssetRow)
    } catch (err) {
      console.warn('[projectsStore] refreshBrandAssets failed', projectId, err)
    }
  }

  /** Push a new BrandAsset onto the project's contextRules.brandAssets array. */
  function addBrandAsset(projectId: string, file: File, previewUrl?: string) {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return

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

    const asset: BrandAsset = {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
  function toggleSkill(projectId: string, skillId: string) {
    const p = projects.value.find((p) => p.id === projectId)
    const skill = p?.contextRules?.skills.find((s) => s.id === skillId)
    if (!skill) return
    skill.active = !skill.active
    if (!usingMocks.value && !projectId.startsWith('proj-pending-')) {
      $fetch(`/api/projects/${projectId}/skills`, {
        method: 'POST',
        credentials: 'include',
        body: { skill_id: skillId, active: skill.active },
      }).catch((err) => console.warn('[projectsStore] toggleSkill backend failed', err))
    }
  }

  function addSkillToProject(projectId: string, skill: { id: string; name: string }) {
    const p = projects.value.find((p) => p.id === projectId)
    if (!p) return
    if (!p.contextRules) {
      p.contextRules = { brandVoice: '', doGuidelines: [], dontGuidelines: [], skills: [] }
    }
    const existing = p.contextRules.skills.find((s) => s.id === skill.id)
    if (existing) {
      existing.active = true
    } else {
      p.contextRules.skills.push({ id: skill.id, name: skill.name, active: true })
    }
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

  function updateBrandVoice(projectId: string, value: string) {
    const ctx = ensureContextRules(projectId)
    if (!ctx) return
    ctx.brandVoice = value
    pushContextPatch(projectId, { brand_voice: value })
  }

  function updateDoGuidelines(projectId: string, items: string[]) {
    const ctx = ensureContextRules(projectId)
    if (!ctx) return
    ctx.doGuidelines = items
    pushContextPatch(projectId, { do_guidelines: items })
  }

  function updateDontGuidelines(projectId: string, items: string[]) {
    const ctx = ensureContextRules(projectId)
    if (!ctx) return
    ctx.dontGuidelines = items
    pushContextPatch(projectId, { dont_guidelines: items })
  }

  function updateHashtags(projectId: string, tags: string[]) {
    const ctx = ensureContextRules(projectId)
    if (!ctx) return
    ctx.hashtags = tags
    pushContextPatch(projectId, { hashtags: tags })
  }

  function applyRulesTemplate(projectId: string, template: RulesTemplate) {
    const ctx = ensureContextRules(projectId)
    if (!ctx) return
    ctx.brandVoice = template.brandVoice
    ctx.doGuidelines = [...template.doGuidelines]
    ctx.dontGuidelines = [...template.dontGuidelines]
    ctx.hashtags = template.hashtags ? [...template.hashtags] : []
    // Backend has a dedicated endpoint that accepts the template id —
    // but the frontend RulesTemplate ids are local ('tpl-quiet-artisan' etc.).
    // For now mirror the resolved fields to the context endpoint so the DB
    // matches what the user sees. Future: thread the real DB template id through.
    pushContextPatch(projectId, {
      brand_voice: template.brandVoice,
      do_guidelines: template.doGuidelines,
      dont_guidelines: template.dontGuidelines,
      hashtags: template.hashtags ?? [],
    })
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
    setActiveProject,
    getRelativeTime,
    loadFromBackend,
    loadProjectDetail,
    createProject,
    deleteProject,
    renameProject,
    formatBytes,
    addBrandAsset,
    removeBrandAsset,
    updateAssetDescription,
    refreshBrandAssets,
    togglePin,
    duplicateProject,
    duplicateProjectViaApi,
    changePlatform,
    toggleSkill,
    addSkillToProject,
    updateBrandVoice,
    updateDoGuidelines,
    updateDontGuidelines,
    updateHashtags,
    applyRulesTemplate,
    updatePlatformProfile,
    saveOutput,
    inviteMember,
    removeMember,
    updateMemberRole,
  }
})
