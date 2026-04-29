/**
 * POST /api/projects/:id/messages
 * Send a user message → triggers AI generation → persists assistant response.
 * Editor+ on the project required.
 *
 * Returns { user_message, assistant_message } so the frontend can render
 * both atomically without re-fetching the thread.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { AIProviderError, generateChat } from '~/server/utils/ai'
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

  // Rate-limit AI calls per user (20/min default, overridable via env)
  const perMin = Number(process.env.RATE_LIMIT_AI_REQUESTS_PER_MINUTE) || 20
  rateLimitAi(event, u.id, perMin)

  // Plan-based monthly quota check (throws 402 if over)
  await checkAndIncrementMessageQuota(event, projectId)

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  // 1. Save user message
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
  // is still pending. Bounded to 3s so a wedged extraction can't hang the
  // chat. Most calls return immediately because extraction is synchronous on
  // upload — this only kicks in for the upload-then-immediately-send race.
  await awaitPendingExtractions(event, projectId).catch(() => undefined)

  // 2. Pull project context, active skills, brand assets, saved exemplars, recent history
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
      .select('active, skill:skills(name, instructions)')
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
      .lt('id', userMsg.id) // exclude the just-inserted user message
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // 2a. Strict-scope @-mention — when the user @-tagged specific files,
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

  // 2b. Selective RAG — embed the user message and pull the top-K most
  //     relevant chunks from this project's brand-knowledge files.
  //     Returns [] (and the prompt-builder falls back to inlining
  //     extracted_text) when:
  //       - the migration hasn't run / pgvector is off
  //       - no chunks exist for this project (pre-RAG uploads)
  //       - embeddings aren't configured / the call failed
  const selectedChunks = await retrieveRelevantChunks(event, {
    projectId,
    query: parsed.data.content,
    matchCount: 5,
    assetIds: ragScopeIds,
  })

  // 3. Build prompt
  const messages = buildChatPrompt({
    mode: parsed.data.mode,
    project: { name: project.name, platform: project.platform },
    context: ctx,
    skills: (skills ?? [])
      .map((s: any) => s.skill)
      .filter(Boolean)
      .map((s: any) => ({ name: s.name, instructions: s.instructions })),
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
  logChatPrompt('messages.post', { projectId, mode: parsed.data.mode, messages })

  // 4. Call the AI — enable web search for grounded research/competitor/trend modes
  const useWebSearch = parsed.data.mode ? WEB_SEARCH_MODES.has(parsed.data.mode) : false
  let assistantText = ''
  let providerInfo: { provider: string; model: string; usage?: any; citations?: any } = {
    provider: 'mock',
    model: 'mock',
  }
  let providerError4xx: AIProviderError | null = null
  try {
    const ai = await generateChat(
      event,
      { messages, temperature: 0.7, maxTokens: 1500 },
      { webSearch: useWebSearch, modelOverride: parsed.data.model }
    )
    assistantText = ai.content
    providerInfo = {
      provider: ai.provider,
      model: ai.model,
      usage: ai.usage,
      citations: ai.citations,
    }
  } catch (e: any) {
    if (e instanceof AIProviderError && e.status >= 400 && e.status < 500) {
      // Bad request to provider (e.g. unknown model, malformed prompt,
      // billing rejection). Don't persist an error placeholder — surface
      // the upstream message via the 502 below.
      providerError4xx = e
      log.warn('[messages.post]', 'provider 4xx', {
        projectId,
        userId: u.id,
        status: e.status,
        provider: e.provider,
        model: e.model,
        providerMessage: e.providerMessage,
      })
    } else {
      // Network blip or 5xx — record an error assistant message so the
      // user sees something happened and can retry without losing the
      // thread. Logged with stack for triage.
      log.error('[messages.post]', 'AI provider failed (5xx / network)', {
        projectId,
        userId: u.id,
        provider: e instanceof AIProviderError ? e.provider : 'unknown',
        model: e instanceof AIProviderError ? e.model : undefined,
        status: e instanceof AIProviderError ? e.status : undefined,
        error: e?.message ?? 'unknown error',
        stack: e?.stack,
      })
      assistantText = `Floo couldn't reach the AI provider this time. (${e?.message ?? 'unknown error'})`
    }
  }

  if (providerError4xx) {
    throw createError({
      statusCode: 502,
      statusMessage: `GLM rejected the request: ${providerError4xx.providerMessage}`,
    })
  }

  // 5. Parse + save assistant message (and optional output card)
  const { body: assistantBody, card } = parseAssistantResponse(assistantText, parsed.data.mode)

  const { data: aiMsg, error: aiErr } = await supabase
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

  if (aiErr) throw createError({ statusCode: 500, statusMessage: aiErr.message })

  let outputCards: any[] = []
  if (card) {
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

  return {
    user_message: userMsg,
    assistant_message: { ...aiMsg, output_cards: outputCards },
  }
})
