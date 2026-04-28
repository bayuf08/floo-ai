import { defineStore } from 'pinia'
import type { ChatMessage, ContentMode, OutputCard, Citation } from '~/types/chat'
import { AVAILABLE_CONTENT_MODES, CONTENT_MODES } from '~/types/chat'

const LS_KEY_MODE = 'floo:chat:selectedMode'

/**
 * Read a value from localStorage and validate it against an allow-list.
 * Returns the fallback if the value is missing, doesn't parse, or isn't allowed.
 * Client-only — guard at the call site.
 */
function readValidated(key: string, allowed: readonly string[], fallback: string): string {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return allowed.includes(raw) ? raw : fallback
  } catch {
    // Some browsers / privacy modes throw on localStorage access. Treat as miss.
    return fallback
  }
}

/**
 * Chat store — backend-aware.
 *
 * - In backend mode (after `loadHistory()` succeeds), all sends/requests hit
 *   /api/projects/:id/messages and the local state is a mirror of the DB.
 * - In mock mode, falls back to a deterministic 1.8s simulated AI reply so
 *   the UI keeps working without Supabase or an AI provider configured.
 */
export const useChatStore = defineStore('chat', () => {
  // Empty by design — `loadHistory()` populates this from
  // /api/projects/:id/messages once the user opens a project. The
  // previous mock seed (a Bantul ceramics SS26 thread) flashed in for
  // ~200ms on every reload, which was confusing now that the chat is
  // wired to a real provider.
  const messages = ref<ChatMessage[]>([])

  const isThinking = ref(false)
  /** Default to 'research' — only research + copy ship today, others are 'Coming soon'. */
  const selectedMode = ref<ContentMode>(
    import.meta.client
      ? (readValidated(
          LS_KEY_MODE,
          AVAILABLE_CONTENT_MODES.map((m) => m.value),
          'research'
        ) as ContentMode)
      : 'research'
  )
  // The GLM model is no longer user-selectable from the UI — the server
  // reads `GLM_MODEL` from `.env` (via `runtimeConfig.glmModel`) and uses
  // it for every call. If we ever bring per-message overrides back,
  // restore `selectedModel` + a `model` field on each request body.
  /**
   * One-shot bridge for outside surfaces (empty-state suggestion chips, slash
   * commands, etc.) to seed the composer's textarea. ChatComposer.vue watches
   * this and copies it into its local inputText, then clears it back to ''.
   */
  const composerDraft = ref<string>('')

  /** Backend hydration state — set true once a /api/projects/:id/messages call succeeds. */
  const usingMocks = ref(true)
  /** Project ids whose history we've already pulled from the backend. */
  const hydratedProjects = ref<Set<string>>(new Set())

  /**
   * Bumped every time a card is saved or a saved output is mutated. Reactive
   * surfaces that show saved outputs (currently `ContextSavedTab.vue`) watch
   * this and re-fetch when it changes — avoids a stale "Nothing saved yet"
   * panel sitting next to a fresh "Saved ✓" toast.
   */
  const savedOutputsRefreshKey = ref(0)

  const activeMessages = computed(() => {
    const projectStore = useProjectsStore()
    return messages.value.filter((m) => m.projectId === projectStore.activeProjectId)
  })

  /** Convert a backend message row into the frontend ChatMessage shape. */
  function rowToMessage(row: any): ChatMessage {
    const cards: OutputCard[] = (row.output_cards ?? []).map((c: any) => ({
      id: c.id,
      label: c.label ?? undefined,
      sub: c.sub ?? undefined,
      accent: c.accent ?? undefined,
      canCopy: c.can_copy ?? true,
      items: c.items ?? [],
      kind: c.kind ?? 'text',
      images: Array.isArray(c.images) ? c.images : undefined,
    }))
    const meta = (row.metadata ?? {}) as Record<string, any>
    const citations: Citation[] | undefined = Array.isArray(meta.citations) ? meta.citations : undefined
    const model: string | undefined = typeof meta.model === 'string' ? meta.model : undefined
    const provider: string | undefined = typeof meta.provider === 'string' ? meta.provider : undefined
    return {
      id: row.id,
      projectId: row.project_id,
      role: row.role,
      content: row.content ?? '',
      timestamp: new Date(row.created_at ?? Date.now()),
      modeLabel: row.mode_label ?? undefined,
      outputCards: cards.length ? cards : undefined,
      citations,
      model,
      provider,
    }
  }

  /**
   * Load chat history for a project from the backend. Replaces the local
   * mock entries for that project. Idempotent via hydratedProjects.
   *
   * Bails when the user store hasn't hydrated yet or is still in mock mode —
   * firing /api/projects/:id/messages before the session cookie is in place
   * is a guaranteed 401 and would leave the chat stuck on mocks (silently).
   * `loadFromBackend()` in projects.ts re-invokes this once the user store
   * flips out of mocks, so the bail is safe.
   */
  async function loadHistory(projectId: string) {
    if (hydratedProjects.value.has(projectId)) return
    if (projectId.startsWith('proj-pending-')) return  // un-saved local project
    const userStore = useUserStore()
    if (!userStore.hydrated || userStore.usingMocks) return
    try {
      const rows = await $fetch<any[]>(`/api/projects/${projectId}/messages`, {
        credentials: 'include',
      })
      // Drop existing entries for this project, replace with backend rows.
      messages.value = [
        ...messages.value.filter((m) => m.projectId !== projectId),
        ...rows.map(rowToMessage),
      ]
      hydratedProjects.value.add(projectId)
      usingMocks.value = false
    } catch (err: any) {
      console.warn('[chatStore] history fetch failed; staying on mocks for', projectId, err)
      // 401 during the brief auth-hydration window is normal — don't toast
      // the user for it. Anything else is worth surfacing so the canned
      // mock reply doesn't silently confuse them. We include the status
      // code and the upstream message so the failure is diagnosable from
      // the toast itself (vs. requiring DevTools).
      const status = err?.statusCode ?? err?.response?.status
      if (status && status !== 401) {
        const upstream = err?.statusMessage || err?.data?.statusMessage || err?.message || 'Unknown error'
        useToast().error('Couldn\'t load chat history', {
          detail: `${status} — ${upstream}`,
        })
      }
    }
  }

  async function sendMessage(content: string, projectId: string) {
    // Optimistic insert — let the user see their message immediately.
    const tempUserId = `msg-pending-${Date.now()}`
    messages.value.push({
      id: tempUserId,
      projectId,
      role: 'user',
      content,
      timestamp: new Date(),
    })
    isThinking.value = true

    // If the project was just created and the server hasn't returned its real
    // id yet, the chat would otherwise drop straight into the mock path —
    // which means rules / skills the user just configured are ignored. Wait
    // up to 1.5s for the temp id to resolve, then re-target the real id.
    if (!usingMocks.value && projectId.startsWith('proj-pending-')) {
      const projects = useProjectsStore()
      const realId = await Promise.race<string | null>([
        projects.awaitRealProjectId(projectId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ])
      if (realId) {
        // Re-tag the optimistic user message so the persisted thread groups
        // it under the right project once the response arrives.
        const idx = messages.value.findIndex((m) => m.id === tempUserId)
        if (idx >= 0) messages.value[idx]!.projectId = realId
        projectId = realId
      } else {
        useToast().warning('Saving project before sending', {
          detail: 'Try again in a moment.',
        })
        // Drop the optimistic message — let the user retry once the create
        // lands. Otherwise it'd hang as "user said this" with no AI reply.
        messages.value = messages.value.filter((m) => m.id !== tempUserId)
        isThinking.value = false
        return
      }
    }

    if (usingMocks.value || projectId.startsWith('proj-pending-')) {
      // Mock path — simulated reply. Tag with provider:'mock' so the
      // ChatMessageAI badge surfaces a dashed "Mock" pill, making it
      // obvious the canned reply was returned (instead of GLM).
      setTimeout(() => {
        const aiMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          projectId,
          role: 'assistant',
          modeLabel: modeToLabel(selectedMode.value),
          provider: 'mock',
          model: 'mock',
          content:
            'Berikut variasi yang diminta. Saya pertahankan tone yang sama — tenang, berat, tanpa hype.',
          timestamp: new Date(),
          outputCards: [
            {
              id: `card-${Date.now()}`,
              label: 'Hooks',
              sub: '5 variations',
              accent: 'var(--ft-blue)',
              canCopy: true,
              items: [
                'Sekali bakar. Selesai. Tidak ada percobaan kedua.',
                'Single-fire artinya satu kesempatan — dan itu yang kamu bayar.',
                'Bukan glasir yang dipoles, tapi yang lahir dari satu api.',
                'Setiap mangkuk punya satu cerita api. Tidak ada duplikat.',
                'Slow craft bukan tagline. Itu cara satu-satunya yang kami tahu.',
              ],
            },
          ],
        }
        messages.value.push(aiMsg)
        isThinking.value = false
      }, 1800)
      return
    }

    // Image mode → dedicated /messages/image endpoint. The endpoint
    // internally routes to GLM/CogView, OpenAI/gpt-image-1, or (for
    // Anthropic) falls back to text-based concept cards.
    if (selectedMode.value === 'image') {
      try {
        const result = await $fetch<{ user_message: any; assistant_message: any }>(
          `/api/projects/${projectId}/messages/image`,
          {
            method: 'POST',
            credentials: 'include',
            body: { content },
          }
        )
        const idx = messages.value.findIndex((m) => m.id === tempUserId)
        if (idx >= 0) messages.value[idx] = rowToMessage(result.user_message)
        messages.value.push(rowToMessage(result.assistant_message))
      } catch (err: any) {
        const status = err?.statusCode ?? err?.response?.status
        const detail = err?.statusMessage || err?.message
        if (status === 429) {
          useToast().warning('Rate limit hit', { detail: detail || 'Try again in a moment.' })
        } else {
          useToast().error("Image generation failed", { detail })
        }
        messages.value.push({
          id: `msg-error-${Date.now()}`,
          projectId,
          role: 'assistant',
          content: `Image generation failed${detail ? `: ${detail}` : ''}. Try a different prompt or switch provider.`,
          timestamp: new Date(),
        })
      } finally {
        isThinking.value = false
      }
      return
    }

    // Backend path — try SSE streaming first, fall back to non-streaming POST.
    try {
      const ok = await streamSendMessage(content, projectId, tempUserId)
      if (ok) return
      // Fall through to non-streaming if streaming wasn't supported.
      const result = await $fetch<{ user_message: any; assistant_message: any }>(
        `/api/projects/${projectId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          body: { content, mode: selectedMode.value },
        }
      )
      // Replace optimistic placeholder with the real persisted user message
      const idx = messages.value.findIndex((m) => m.id === tempUserId)
      if (idx >= 0) messages.value[idx] = rowToMessage(result.user_message)
      messages.value.push(rowToMessage(result.assistant_message))
    } catch (err: any) {
      console.error('[chatStore] sendMessage failed', err)
      const status = err?.statusCode ?? err?.response?.status
      const detail = err?.statusMessage || err?.message
      if (status === 429) {
        useToast().warning('Rate limit hit', { detail: detail || 'Try again in a moment.' })
      } else {
        useToast().error('Floo couldn\'t reply', { detail })
      }
      messages.value.push({
        id: `msg-error-${Date.now()}`,
        projectId,
        role: 'assistant',
        content: 'Floo couldn\'t reach the AI provider. Check your env config and try again.',
        timestamp: new Date(),
      })
    } finally {
      isThinking.value = false
    }
  }

  function setMode(mode: ContentMode) {
    // Guard against picking a 'coming soon' mode programmatically.
    const opt = (CONTENT_MODES as readonly { value: ContentMode; comingSoon?: boolean }[]).find(
      (m) => m.value === mode
    )
    if (opt?.comingSoon) return
    selectedMode.value = mode
    if (import.meta.client) {
      try { localStorage.setItem(LS_KEY_MODE, mode) } catch { /* ignore */ }
    }
  }

  // setModel removed alongside the model switcher — see the comment near
  // the (now-deleted) `selectedModel` ref above. The server picks the
  // model from `GLM_MODEL` in `.env`.

  /**
   * Stream the assistant response from /messages/stream as it's generated.
   * Returns true on success, false if streaming wasn't possible (caller
   * should fall back to the non-streaming endpoint).
   */
  async function streamSendMessage(
    content: string,
    projectId: string,
    tempUserId: string
  ): Promise<boolean> {
    let response: Response
    try {
      response = await fetch(`/api/projects/${projectId}/messages/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ content, mode: selectedMode.value }),
      })
    } catch (err: any) {
      console.warn('[chatStore] streamSendMessage fetch failed', err)
      return false
    }

    if (!response.ok) {
      // Surface 429 specifically — the rate limiter sets a Retry-After header.
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After')
        useToast().warning('Rate limit hit', {
          detail: retry ? `Try again in ${retry}s.` : 'Try again in a moment.',
        })
        return true // already handled — don't fall back
      }
      console.warn('[chatStore] streaming endpoint returned', response.status)
      return false
    }

    if (!response.body) return false

    // Push an empty assistant placeholder we'll fill as chunks arrive.
    const tempAssistantId = `msg-streaming-${Date.now()}`
    messages.value.push({
      id: tempAssistantId,
      projectId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      modeLabel: modeToLabel(selectedMode.value),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = ''
    let streamingText = ''
    let assistantRow: any = null
    let userRow: any = null
    let errored: string | null = null
    let webSearching = false
    let citations: Citation[] | undefined

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Split on blank lines — SSE frame boundary
        let nl: number
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trimEnd()
          buffer = buffer.slice(nl + 1)
          if (!line) {
            currentEvent = ''
            continue
          }
          if (line.startsWith('event:')) currentEvent = line.slice(6).trim()
          else if (line.startsWith('data:')) {
            const payload = line.slice(5).trim()
            try {
              const json = JSON.parse(payload)
              if (currentEvent === 'meta') {
                userRow = json.user_message
              } else if (currentEvent === 'chunk') {
                streamingText += json.delta ?? ''
                const idx = messages.value.findIndex((m) => m.id === tempAssistantId)
                if (idx >= 0) messages.value[idx]!.content = streamingText
              } else if (currentEvent === 'search') {
                webSearching = !!json.enabled
              } else if (currentEvent === 'citations') {
                citations = Array.isArray(json.citations) ? json.citations : undefined
                const idx = messages.value.findIndex((m) => m.id === tempAssistantId)
                if (idx >= 0 && citations?.length) messages.value[idx]!.citations = citations
              } else if (currentEvent === 'done') {
                assistantRow = json.assistant_message
              } else if (currentEvent === 'error') {
                errored = json.message ?? 'Stream error'
              }
            } catch {
              // ignore malformed payload
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[chatStore] stream reader error', err)
      errored = err?.message ?? 'Stream interrupted'
    }

    // Reconcile placeholders with persisted rows
    if (userRow) {
      const idx = messages.value.findIndex((m) => m.id === tempUserId)
      if (idx >= 0) messages.value[idx] = rowToMessage(userRow)
    }
    const aIdx = messages.value.findIndex((m) => m.id === tempAssistantId)
    if (assistantRow) {
      const real = rowToMessage(assistantRow)
      if (aIdx >= 0) messages.value[aIdx] = real
      else messages.value.push(real)
    } else if (errored) {
      // No persisted row (pre-stream 4xx) OR mid-stream interrupt without final row.
      // If we got nothing streamed at all, drop the placeholder entirely.
      if (aIdx >= 0) {
        if (!streamingText) {
          messages.value.splice(aIdx, 1)
        } else {
          messages.value[aIdx]!.content = `${streamingText}\n\n— stream interrupted: ${errored}`
        }
      }
      // Recognize billing rejections from z.ai so the toast points at the
      // real fix ("recharge your account") instead of the generic
      // "reply was interrupted". The substring match is intentional —
      // z.ai's error string varies slightly across endpoints.
      const lower = errored.toLowerCase()
      const isBilling =
        lower.includes('insufficient balance') ||
        lower.includes('no resource package') ||
        lower.includes('quota')
      if (isBilling) {
        useToast().error('GLM account out of credit', {
          detail: `${errored} — top up at z.ai → API Keys → Billing.`,
        })
      } else {
        useToast().error('Floo\'s reply was interrupted', { detail: errored })
      }
    }

    isThinking.value = false
    return true
  }

  /** Generate additional variations of an existing output card type. */
  async function requestMore(label: string, projectId: string) {
    if (usingMocks.value || projectId.startsWith('proj-pending-')) {
      isThinking.value = true
      setTimeout(() => {
        messages.value.push({
          id: `msg-${Date.now()}`,
          projectId,
          role: 'assistant',
          modeLabel: label,
          content: 'Here are additional variations in the same tone:',
          timestamp: new Date(),
          outputCards: [
            {
              id: `card-${Date.now()}`,
              label,
              sub: '5 more variations',
              accent: 'var(--ft-blue)',
              canCopy: true,
              items: [
                'Tanah ini tidak terburu-buru. Kami juga.',
                'Satu cetakan, satu api. Tidak ada cadangan.',
                'Yang kamu pegang ini, tidak ada duanya.',
                'Bukan koleksi. Bukan reproduksi. Hanya satu.',
                'Kalau tidak terbakar sempurna, tidak keluar dari studio.',
              ],
            },
          ],
        })
        isThinking.value = false
      }, 1800)
      return
    }

    isThinking.value = true
    try {
      const aiRow = await $fetch<any>(`/api/projects/${projectId}/messages/more`, {
        method: 'POST',
        credentials: 'include',
        body: { label },
      })
      messages.value.push(rowToMessage(aiRow))
    } catch (err) {
      console.error('[chatStore] requestMore failed', err)
    } finally {
      isThinking.value = false
    }
  }

  /** Save a card from a chat message into the project's saved_outputs. */
  async function saveCard(projectId: string, messageId: string, cardId: string) {
    if (usingMocks.value || projectId.startsWith('proj-pending-')) {
      // Even in mock mode, bump the key so any local-only saved-output mirror
      // can re-render. (The current ContextSavedTab is API-only and skips
      // pending projects, but this keeps the contract consistent.)
      savedOutputsRefreshKey.value += 1
      return
    }
    try {
      await $fetch(`/api/projects/${projectId}/messages/${messageId}/save`, {
        method: 'POST',
        credentials: 'include',
        body: { card_id: cardId },
      })
      // Tell the Saved tab there's a new row to fetch.
      savedOutputsRefreshKey.value += 1
    } catch (err) {
      console.warn('[chatStore] saveCard failed', err)
    }
  }

  /** Bump the refresh key — used by mutations that happen outside saveCard
   *  (e.g. delete from the Saved tab) so other surfaces stay in sync too. */
  function bumpSavedOutputsRefresh() {
    savedOutputsRefreshKey.value += 1
  }

  function modeToLabel(mode: ContentMode): string {
    const map: Record<ContentMode, string> = {
      research: 'Research',
      competitor: 'Competitor research',
      trend: 'Trend research',
      copy: 'Write copy',
      image: 'Image concept',
      video: 'Video concept',
    }
    return map[mode]
  }

  return {
    messages,
    isThinking,
    selectedMode,
    usingMocks,
    composerDraft,
    activeMessages,
    savedOutputsRefreshKey,
    loadHistory,
    sendMessage,
    setMode,
    requestMore,
    saveCard,
    bumpSavedOutputsRefresh,
  }
})
