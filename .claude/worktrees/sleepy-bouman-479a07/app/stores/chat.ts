import { defineStore } from 'pinia'
import type { ChatMessage, ContentMode, OutputCard } from '~/types/chat'

/**
 * Chat store — backend-aware.
 *
 * - In backend mode (after `loadHistory()` succeeds), all sends/requests hit
 *   /api/projects/:id/messages and the local state is a mirror of the DB.
 * - In mock mode, falls back to a deterministic 1.8s simulated AI reply so
 *   the UI keeps working without Supabase or an AI provider configured.
 */
export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([
    // Mock seed — visible only until loadHistory() replaces with backend rows.
    {
      id: 'msg-1',
      projectId: 'proj-1',
      role: 'user',
      content:
        'Brief untuk SS26 Kayu attached. Tone harus tenang tapi punya weight — bukan corporate. Brand value: slow craft, single-fire glaze, Bantul roots. Drop date 14 Mei, 6 bentuk. Saya butuh image concepts dulu untuk shoot hari Sabtu.',
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
    },
    {
      id: 'msg-2',
      projectId: 'proj-1',
      role: 'assistant',
      modeLabel: 'Image Concept',
      content:
        'Read the moodboard and tone-of-voice doc. The recurring thread is restraint — natural light, hands-in-frame, no maximalist styling. I worked from that. Here are 5 hook variations that lead with the single-fire mechanic without leaning on hype words.',
      timestamp: new Date(Date.now() - 25 * 60 * 1000),
      outputCards: [
        {
          id: 'card-1',
          label: 'Hooks',
          sub: '5 opening lines',
          accent: 'var(--ft-blue)',
          canCopy: true,
          items: [
            'Tanah ini sudah menunggu 800 tahun. Kami cuma membentuknya.',
            'Sebuah mangkuk tidak bisa diburu — dan itu sebabnya layak ditunggu.',
            'Kalau kamu pernah pegang gerabah Bantul, kamu tahu yang ini berbeda.',
            'Drop pertama: 6 bentuk. Tidak ada restock.',
            'Studio kecil. Tangan satu. Api satu kali.',
          ],
        },
      ],
    },
    {
      id: 'msg-3',
      projectId: 'proj-1',
      role: 'user',
      content:
        'Concept 2 paling kuat. Bisa kasih saya 5 hook variations yang menonjolkan "single-fire" sebagai unique mechanic? Tetap dalam tone yang sama.',
      timestamp: new Date(Date.now() - 10 * 60 * 1000),
    },
  ])

  const isThinking = ref(false)
  const selectedMode = ref<ContentMode>('image')

  /** Backend hydration state — set true once a /api/projects/:id/messages call succeeds. */
  const usingMocks = ref(true)
  /** Project ids whose history we've already pulled from the backend. */
  const hydratedProjects = ref<Set<string>>(new Set())

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
    }))
    return {
      id: row.id,
      projectId: row.project_id,
      role: row.role,
      content: row.content ?? '',
      timestamp: new Date(row.created_at ?? Date.now()),
      modeLabel: row.mode_label ?? undefined,
      outputCards: cards.length ? cards : undefined,
    }
  }

  /**
   * Load chat history for a project from the backend. Replaces the local
   * mock entries for that project. Idempotent via hydratedProjects.
   */
  async function loadHistory(projectId: string) {
    if (hydratedProjects.value.has(projectId)) return
    if (projectId.startsWith('proj-pending-')) return  // un-saved local project
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
    } catch (err) {
      console.warn('[chatStore] history fetch failed; staying on mocks for', projectId, err)
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

    if (usingMocks.value || projectId.startsWith('proj-pending-')) {
      // Mock path — simulated reply
      setTimeout(() => {
        const aiMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          projectId,
          role: 'assistant',
          modeLabel: modeToLabel(selectedMode.value),
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
    selectedMode.value = mode
  }

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
      // Keep what we streamed so the user doesn't lose context, just append a hint.
      if (aIdx >= 0) {
        messages.value[aIdx]!.content = streamingText
          ? `${streamingText}\n\n— stream interrupted: ${errored}`
          : `Floo couldn't reply (${errored}).`
      }
      useToast().error('Floo\'s reply was interrupted', { detail: errored })
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
    if (usingMocks.value || projectId.startsWith('proj-pending-')) return
    try {
      await $fetch(`/api/projects/${projectId}/messages/${messageId}/save`, {
        method: 'POST',
        credentials: 'include',
        body: { card_id: cardId },
      })
    } catch (err) {
      console.warn('[chatStore] saveCard failed', err)
    }
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
    activeMessages,
    loadHistory,
    sendMessage,
    setMode,
    requestMore,
    saveCard,
  }
})
