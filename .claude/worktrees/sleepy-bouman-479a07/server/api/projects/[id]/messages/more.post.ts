/**
 * POST /api/projects/:id/messages/more
 * Generate additional variations of the most recent assistant output.
 * Reuses the existing chat history; no new user message is recorded.
 * Editor+ only.
 *
 * Body: { label?: string }   // hint for what kind of variation to produce
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { generateChat } from '~/server/utils/ai'
import { buildChatPrompt, parseAssistantResponse } from '~/server/utils/prompt-builder'
import { rateLimitAi } from '~/server/utils/rate-limit'
import { checkAndIncrementMessageQuota } from '~/server/utils/quota'

const Schema = z.object({
  label: z.string().max(80).optional(),
})

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
        .order('created_at', { ascending: false })
        .limit(20),
    ])

  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const labelHint = parsed.data.label ?? 'Variations'
  const messages = buildChatPrompt({
    project: { name: project.name, platform: project.platform },
    context: ctx,
    skills: (skills ?? []).map((s: any) => s.skill).filter(Boolean),
    brandAssets: (assets ?? []),
    history: (history ?? []).reverse().map((h: any) => ({ role: h.role, content: h.content })),
    userMessage: `Give me 5 more ${labelHint.toLowerCase()} in the same tone. Numbered list, no preamble.`,
  })

  const ai = await generateChat(event, { messages, temperature: 0.85, maxTokens: 800 })
  const { body: assistantBody, card } = parseAssistantResponse(ai.content)

  const { data: aiMsg, error: aiErr } = await supabase
    .from('chat_messages')
    .insert({
      project_id: projectId,
      role: 'assistant',
      content: assistantBody || 'Here are more variations:',
      mode_label: labelHint,
      metadata: { provider: ai.provider, model: ai.model, usage: ai.usage, kind: 'more' },
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
        label: labelHint,
        sub: card.sub ?? `${card.items.length} more variations`,
        accent: 'var(--ft-blue)',
        can_copy: true,
        items: card.items,
      })
      .select()
      .single()
    if (cardRow) outputCards = [cardRow]
  }

  return { ...aiMsg, output_cards: outputCards }
})
