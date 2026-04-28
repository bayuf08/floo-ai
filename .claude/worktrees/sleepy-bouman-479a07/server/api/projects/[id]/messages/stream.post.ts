/**
 * POST /api/projects/:id/messages/stream
 * Server-Sent Events variant of the chat send endpoint. Editor+ only.
 *
 * Frame format:
 *   event: meta     — once at the start with the persisted user message id
 *   event: chunk    — repeated, payload = { delta: '...partial text...' }
 *   event: done     — once at the end with the persisted assistant message + cards
 *   event: error    — sent if the AI provider fails; payload = { message }
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { streamChat } from '~/server/utils/ai'
import { buildChatPrompt, parseAssistantResponse } from '~/server/utils/prompt-builder'
import { rateLimitAi } from '~/server/utils/rate-limit'
import { checkAndIncrementMessageQuota } from '~/server/utils/quota'

const Schema = z.object({
  content: z.string().min(1).max(10_000),
  mode: z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional(),
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

  // 2. Build prompt context (same shape as the non-streaming endpoint)
  const [{ data: project }, { data: ctx }, { data: skills }, { data: assets }, { data: history }] =
    await Promise.all([
      supabase.from('projects').select('name, platform').eq('id', projectId).single(),
      supabase
        .from('project_contexts')
        .select('brand_voice, do_guidelines, dont_guidelines, hashtags, platform_handle, platform_bio, platform_followers')
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
        .from('chat_messages')
        .select('role, content')
        .eq('project_id', projectId)
        .lt('id', userMsg.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const messages = buildChatPrompt({
    mode: parsed.data.mode,
    project: { name: project.name, platform: project.platform },
    context: ctx,
    skills: (skills ?? [])
      .map((s: any) => s.skill)
      .filter(Boolean)
      .map((s: any) => ({ name: s.name, instructions: s.instructions })),
    brandAssets: (assets ?? []).map((a: any) => ({
      name: a.name,
      description: a.description,
      category: a.category,
      extracted_text: a.extracted_text,
      extraction_status: a.extraction_status,
    })),
    history: (history ?? []).reverse().map((h: any) => ({ role: h.role, content: h.content })),
    userMessage: parsed.data.content,
  })

  // 3. Open SSE response
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no') // disables nginx buffering

  const writer = event.node.res
  const send = (name: string, data: unknown) =>
    writer.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)

  send('meta', { user_message: userMsg })

  let full = ''
  let providerInfo: any = { provider: 'mock', model: 'mock' }

  try {
    const iter = streamChat(event, { messages, temperature: 0.7, maxTokens: 1500 })
    let result: IteratorResult<string, any> = await iter.next()
    while (!result.done) {
      const delta = result.value as string
      if (delta) {
        full += delta
        send('chunk', { delta })
      }
      result = await iter.next()
    }
    if (result.value && typeof result.value === 'object') {
      providerInfo = {
        provider: result.value.provider,
        model: result.value.model,
        usage: result.value.usage,
      }
    }
  } catch (e: any) {
    send('error', { message: e?.message ?? 'AI provider failed' })
    full = full || `Floo couldn't reach the AI provider. (${e?.message ?? 'unknown error'})`
  }

  // 4. Persist final assistant message + optional output card
  const { body: assistantBody, card } = parseAssistantResponse(full)

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
        accent: 'var(--ft-blue)',
        can_copy: true,
        items: card.items,
      })
      .select()
      .single()
    if (cardRow) outputCards = [cardRow]
  }

  send('done', { assistant_message: aiMsg ? { ...aiMsg, output_cards: outputCards } : null })
  writer.end()
})
