/**
 * POST /api/projects/:id/messages/stream
 * Server-Sent Events variant of the chat send endpoint. Editor+ only.
 *
 * Frame format:
 *   event: meta     — once at the start with the persisted user message id
 *   event: chunk    — repeated, payload = { delta: '...partial text...' }
 *   event: done     — once at the end with the persisted assistant message + cards
 *   event: error    — sent if the AI provider fails; payload = { message }
 *
 * Implementation note — the response body is a `ReadableStream` returned
 * via `sendStream()`. This shape is friendlier to streaming-aware
 * deployment adapters: Nitro routes Web `ReadableStream` chunks straight
 * through, and any future move to Vercel Edge / `Response`-style transport
 * is a one-line swap (just return the stream as a `Response`'s body).
 * Local `bun run dev` and the `node-server` preset accept either the old
 * direct-write shape or this one, so the refactor is a strict improvement
 * for code clarity even if you never deploy to a serverless platform.
 *
 * If/when you deploy to Vercel and observe buffered (non-streamed) replies,
 * the fix is in `nitro.preset` config — not here.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { AIProviderError, streamChat } from '~/server/utils/ai'
import { log } from '~/server/utils/logger'
import {
  buildChatPrompt,
  logChatPrompt,
  parseAssistantResponse,
  WEB_SEARCH_MODES,
} from '~/server/utils/prompt-builder'
import { rateLimitAi } from '~/server/utils/rate-limit'
import { checkAndIncrementMessageQuota } from '~/server/utils/quota'
import { awaitPendingExtractions } from '~/server/utils/asset-content'
import { retrieveRelevantChunks } from '~/server/utils/asset-retrieval'

const Schema = z.object({
  content: z.string().min(1).max(10_000),
  mode: z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional(),
  /** UUIDs of brand_assets the user explicitly @-tagged. When non-empty,
   *  the AI's knowledge view is restricted to these assets only; tagless
   *  requests get the default "all assets" behavior. */
  referenced_asset_ids: z.array(z.string().uuid()).optional(),
  /** Optional per-request override. Today the UI never sends this (the
   *  picker was removed in favor of `GLM_MODEL` in .env). Kept loose
   *  so a stale client can't 400 on an ad-hoc id. */
  model: z.string().min(1).max(64).optional(),
})

const MODE_LABELS: Record<string, string> = {
  research: 'Research',
  competitor: 'Competitor research',
  trend: 'Trend research',
  copy: 'Write copy',
  image: 'Image concept',
  video: 'Video concept',
}

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const perMin = Number(process.env.RATE_LIMIT_AI_REQUESTS_PER_MINUTE) || 20
  rateLimitAi(event, u.id, perMin)

  await checkAndIncrementMessageQuota(event, projectId)

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  // 1. Persist user message before opening the stream
  const { data: userMsg, error: userErr } = await supabase
    .from('chat_messages')
    .insert({
      project_id: projectId,
      role: 'user',
      content: parsed.data.content,
      mode_label: parsed.data.mode ? MODE_LABELS[parsed.data.mode] : null,
    })
    .select()
    .single()

  if (userErr) throw createError({ statusCode: 500, statusMessage: userErr.message })

  // 1b. Defensive wait for any recently-uploaded brand assets whose extraction
  // is still pending. Bounded to 3s so a wedged extractor can't hang the chat.
  await awaitPendingExtractions(event, projectId).catch(() => undefined)

  // 2. Build prompt context (same shape as the non-streaming endpoint)
  const [
    { data: project },
    { data: ctx },
    { data: skills },
    { data: assets },
    { data: savedRows },
    { data: history },
  ] = await Promise.all([
    supabase.from('projects').select('name, platform').eq('id', projectId).single(),
    supabase
      .from('project_contexts')
      .select(
        'brand_voice, do_guidelines, dont_guidelines, hashtags, platform_handle, platform_bio, platform_followers',
      )
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase
      .from('project_skills')
      .select('active, skill:skills(name, description, instructions, examples)')
      .eq('project_id', projectId)
      .eq('active', true),
    supabase
      .from('brand_assets')
      .select('name, description, category, extracted_text, extraction_status')
      .eq('project_id', projectId),
    supabase
      .from('saved_outputs')
      .select('label, sub, items')
      .eq('project_id', projectId)
      .order('saved_at', { ascending: false })
      .limit(5),
    supabase
      .from('chat_messages')
      .select('role, content')
      .eq('project_id', projectId)
      .lt('id', userMsg.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // Strict-scope @-mention — when the user @-tagged specific files,
  // restrict the AI's knowledge view to those files. Falls back to all
  // assets when none of the requested ids resolve (file deleted, RLS
  // rejected, stale client) so the answer isn't context-stripped.
  const requestedIds = parsed.data.referenced_asset_ids ?? []
  const filteredAssets = requestedIds.length > 0
    ? (assets ?? []).filter((a: any) => requestedIds.includes(a.id))
    : (assets ?? [])
  const effectiveAssets = (requestedIds.length > 0 && filteredAssets.length === 0)
    ? (assets ?? [])
    : filteredAssets
  const ragScopeIds = (requestedIds.length > 0 && filteredAssets.length > 0)
    ? requestedIds
    : undefined

  // Selective RAG — see messages.post.ts for the full reasoning. Empty
  // array means the prompt-builder falls back to inlining extracted_text,
  // which is the legacy behaviour pre-RAG.
  const selectedChunks = await retrieveRelevantChunks(event, {
    projectId,
    query: parsed.data.content,
    matchCount: 5,
    assetIds: ragScopeIds,
  })

  const messages = buildChatPrompt({
    mode: parsed.data.mode,
    project: { name: project.name, platform: project.platform },
    context: ctx,
    skills: (skills ?? [])
      .map((s: any) => s.skill)
      .filter(Boolean)
      .map((s: any) => ({
        name: s.name,
        description: s.description,
        instructions: s.instructions,
        examples: s.examples,
      })),
    brandAssets: effectiveAssets.map((a: any) => ({
      name: a.name,
      description: a.description,
      category: a.category,
      extracted_text: a.extracted_text,
      extraction_status: a.extraction_status,
    })),
    selectedChunks,
    savedOutputs: (savedRows ?? [])
      .filter((s: any) => Array.isArray(s.items) && s.items.length)
      .map((s: any) => ({ label: s.label, sub: s.sub, items: s.items as string[] })),
    history: (history ?? []).reverse().map((h: any) => ({ role: h.role, content: h.content })),
    userMessage: parsed.data.content,
  })

  // Dev-only: log the assembled prompt when FLOO_LOG_PROMPTS=1 so we can verify
  // that brand voice / DO / DON'T / hashtags / skills / knowledge / saved are all
  // making it into the system prompt.
  logChatPrompt('messages.stream', { projectId, mode: parsed.data.mode, messages })

  // 3. Open SSE response — set headers up front, then build a
  //    ReadableStream that owns the rest of the work. Each enqueue()
  //    is flushed to the client immediately on Vercel + node-server.
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no') // disables nginx buffering

  const useWebSearch = parsed.data.mode ? WEB_SEARCH_MODES.has(parsed.data.mode) : false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (name: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`),
          )
        } catch (err) {
          // Client disconnected mid-stream — controller throws on enqueue.
          // Swallow so we still run the persistence below.
          log.warn('[messages/stream]', 'enqueue after client disconnect', {
            projectId, userId: u.id, frame: name, error: (err as Error)?.message,
          })
        }
      }

      // Outer try/finally guarantees controller.close() runs even if
      // Supabase persistence below throws — without this, an unexpected
      // DB error would leave the SSE response hanging open and the
      // serverless function timing out.
      try {
      send('meta', { user_message: userMsg })
      if (useWebSearch) send('search', { enabled: true })

      let full = ''
      let providerInfo: any = { provider: 'mock', model: 'mock' }
      let receivedAnyChunk = false
      let providerError4xx: AIProviderError | null = null

      try {
        const iter = streamChat(
          event,
          { messages, temperature: 0.7, maxTokens: 1500 },
          { webSearch: useWebSearch, modelOverride: parsed.data.model },
        )
        let result: IteratorResult<string, any> = await iter.next()
        while (!result.done) {
          const delta = result.value as string
          if (delta) {
            full += delta
            receivedAnyChunk = true
            send('chunk', { delta })
          }
          result = await iter.next()
        }
        if (result.value && typeof result.value === 'object') {
          providerInfo = {
            provider: result.value.provider,
            model: result.value.model,
            usage: result.value.usage,
            citations: result.value.citations,
          }
          if (result.value.citations?.length) {
            send('citations', { citations: result.value.citations })
          }
        }
      } catch (e: any) {
        // Tag every AI failure with the project + user context so logs/app.log
        // is enough to diagnose "what happened on send X". Two paths:
        //   pre-stream 4xx  — recoverable, don't persist a row
        //   mid-stream / 5xx — unexpected, keep what streamed + warn
        if (e instanceof AIProviderError && e.status >= 400 && e.status < 500 && !receivedAnyChunk) {
          providerError4xx = e
          log.warn('[messages/stream]', 'pre-stream provider 4xx', {
            projectId, userId: u.id, status: e.status,
            provider: e.provider, model: e.model,
            providerMessage: e.providerMessage,
          })
          send('error', {
            status: e.status,
            message: `${e.provider.toUpperCase()} rejected the request: ${e.providerMessage}`,
          })
        } else {
          const message = e instanceof AIProviderError
            ? `${e.providerMessage} (HTTP ${e.status})`
            : (e?.message ?? 'AI provider failed')
          log.error('[messages/stream]', 'mid-stream or non-4xx AI failure', {
            projectId, userId: u.id,
            provider: e instanceof AIProviderError ? e.provider : 'unknown',
            model: e instanceof AIProviderError ? e.model : undefined,
            status: e instanceof AIProviderError ? e.status : undefined,
            receivedAnyChunk,
            error: message,
            stack: e?.stack,
          })
          send('error', { message })
          full = full || `Floo couldn't reach the AI provider. (${message})`
        }
      }

      // 4. Persist final assistant message (skipped on pre-stream 4xx)
      if (!providerError4xx) {
        const { body: assistantBody, card } = parseAssistantResponse(full, parsed.data.mode)

        const { data: aiMsg } = await supabase
          .from('chat_messages')
          .insert({
            project_id: projectId,
            role: 'assistant',
            content: assistantBody,
            mode_label: parsed.data.mode ? MODE_LABELS[parsed.data.mode] : null,
            metadata: providerInfo,
          })
          .select()
          .single()

        let outputCards: any[] = []
        if (aiMsg && card) {
          const { data: cardRow } = await supabase
            .from('output_cards')
            .insert({
              message_id: aiMsg.id,
              label: card.label,
              sub: card.sub ?? null,
              accent: card.accent ?? 'var(--ft-blue)',
              can_copy: true,
              items: card.items,
              kind: 'text',
            })
            .select()
            .single()
          if (cardRow) outputCards = [cardRow]
        }

        send('done', {
          assistant_message: aiMsg ? { ...aiMsg, output_cards: outputCards } : null,
        })
      } else {
        // Tell the client the stream is over even though no assistant row exists.
        send('done', { assistant_message: null })
      }
      } catch (e: any) {
        // Last-ditch handler for the persistence path. The client gets
        // a `done` frame with no assistant_message; the failure is
        // captured in logs/app.log for triage.
        log.error('[messages/stream]', 'persistence failure after stream completed', {
          projectId, userId: u.id, error: e?.message ?? String(e), stack: e?.stack,
        })
        send('done', { assistant_message: null })
      } finally {
        controller.close()
      }
    },
  })

  return sendStream(event, stream)
})
