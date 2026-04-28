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
import { generateChat } from '~/server/utils/ai'
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

  // 2. Pull project context, active skills, brand assets, recent history
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
        .lt('id', userMsg.id)  // exclude the just-inserted user message
        .order('created_at', { ascending: false })
        .limit(20),
    ])

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // 3. Build prompt
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

  // 4. Call the AI
  let assistantText = ''
  let providerInfo: { provider: string; model: string; usage?: any } = { provider: 'mock', model: 'mock' }
  try {
    const ai = await generateChat(event, { messages, temperature: 0.7, maxTokens: 1500 })
    assistantText = ai.content
    providerInfo = { provider: ai.provider, model: ai.model, usage: ai.usage }
  } catch (e: any) {
    // Don't lose the user's message — record an assistant error message instead
    assistantText = `Floo couldn't reach the AI provider this time. (${e?.message ?? 'unknown error'})`
  }

  // 5. Parse + save assistant message (and optional output card)
  const { body: assistantBody, card } = parseAssistantResponse(assistantText)

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
        accent: 'var(--ft-blue)',
        can_copy: true,
        items: card.items,
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
