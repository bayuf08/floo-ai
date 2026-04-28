/**
 * POST /api/projects/:id/messages/image
 * Image-mode entry point. Editor+ only.
 *
 * Provider routing:
 *  - GLM    → CogView-3 (real images via /images/generations)
 *  - OpenAI → gpt-image-1 (real images via /images/generations)
 *  - Anthropic / no-key → text-based concept cards via the regular chat
 *    flow. The model returns 3 numbered visual directions and the UI
 *    renders them as a text card with a subtle "Image generation requires
 *    GLM or OpenAI — showing concept cards instead" note.
 *
 * Behavior (image-supporting providers):
 *  1. Persist the user's prompt as a normal user message.
 *  2. Build a focused image-gen prompt from request + brand context.
 *  3. Call generateImage() N times (default 3 — three visual directions).
 *  4. Persist assistant message + output card with kind='image'.
 *
 * Behavior (text-fallback providers):
 *  1. Persist the user's prompt.
 *  2. Build the regular chat prompt with mode='image'.
 *  3. Generate text concept cards via generateChat().
 *  4. Persist assistant message + output card with kind='text'.
 *
 * Body: { content: string, n?: number(1..4), size?: '1024x1024' | '768x1024' | '1024x768' }
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { generateChat, generateImage, pickProvider, providerSupportsImageGen } from '~/server/utils/ai'
import { buildChatPrompt, buildImagePrompt, parseAssistantResponse } from '~/server/utils/prompt-builder'
import { rateLimitAi } from '~/server/utils/rate-limit'
import { checkAndIncrementMessageQuota } from '~/server/utils/quota'

const Schema = z.object({
  content: z.string().min(1).max(2_000),
  n: z.number().int().min(1).max(4).optional().default(3),
  size: z.enum(['1024x1024', '768x1024', '1024x768']).optional().default('1024x1024'),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  // Image generation costs more than text — share the same per-minute bucket.
  const perMin = Number(process.env.RATE_LIMIT_AI_REQUESTS_PER_MINUTE) || 20
  rateLimitAi(event, u.id, perMin)
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
      mode_label: 'Image generation',
    })
    .select()
    .single()
  if (userErr) throw createError({ statusCode: 500, statusMessage: userErr.message })

  // Decide routing up front. If the active provider has no image API,
  // fall through to the text-concept-card path so Anthropic users still
  // get something useful from image mode.
  const config = useRuntimeConfig(event)
  const provider = pickProvider(config)
  const canGenerateImages = providerSupportsImageGen(provider)

  // 2. Pull project context + brand assets — both paths need this.
  const [{ data: project }, { data: ctx }, { data: assets }] = await Promise.all([
    supabase.from('projects').select('name, platform').eq('id', projectId).maybeSingle(),
    supabase
      .from('project_contexts')
      .select('brand_voice, do_guidelines, dont_guidelines, hashtags, platform_handle, platform_bio, platform_followers')
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase
      .from('brand_assets')
      .select('name, description, category, extracted_text, extraction_status')
      .eq('project_id', projectId),
  ])

  // ─── Path A — provider supports real image generation ───
  if (canGenerateImages) {
    const imagePrompt = buildImagePrompt({
      userMessage: parsed.data.content,
      context: ctx,
      brandAssets: (assets ?? []).map((a: any) => ({
        name: a.name,
        description: a.description,
        category: a.category,
        extracted_text: a.extracted_text,
      })),
    })

    let images: { url: string; prompt: string; size: string }[] = []
    let providerInfo: any = { provider: 'mock', model: 'mock' }
    try {
      const calls = await Promise.all(
        Array.from({ length: parsed.data.n }, () =>
          generateImage(event, { prompt: imagePrompt, size: parsed.data.size, n: 1 })
        )
      )
      images = calls.flatMap((c: any) => c.images)
      if (calls[0]) providerInfo = { provider: calls[0].provider, model: calls[0].model }
    } catch (e: any) {
      throw createError({
        statusCode: 502,
        statusMessage: `Image generation failed: ${e?.message ?? 'unknown'}`,
      })
    }

    const summary = `${images.length} image direction${images.length === 1 ? '' : 's'} based on your brief.`
    const { data: aiMsg, error: aiErr } = await supabase
      .from('chat_messages')
      .insert({
        project_id: projectId,
        role: 'assistant',
        content: summary,
        mode_label: 'Image generation',
        metadata: { ...providerInfo, image_prompt: imagePrompt },
      })
      .select()
      .single()
    if (aiErr) throw createError({ statusCode: 500, statusMessage: aiErr.message })

    const sourceLabel =
      providerInfo.provider === 'openai'
        ? `${images.length} from gpt-image-1`
        : providerInfo.provider === 'glm'
          ? `${images.length} from CogView`
          : `${images.length} concepts`

    const { data: cardRow } = await supabase
      .from('output_cards')
      .insert({
        message_id: aiMsg.id,
        label: 'Image directions',
        sub: sourceLabel,
        accent: 'var(--ft-amber)',
        can_copy: false,
        items: images.map((_, i) => `Direction ${i + 1}`),
        kind: 'image',
        images,
      })
      .select()
      .single()

    return {
      user_message: userMsg,
      assistant_message: { ...aiMsg, output_cards: cardRow ? [cardRow] : [] },
    }
  }

  // ─── Path B — provider can't make pixels (Anthropic) ────
  // Route through the regular chat flow with mode='image' so the model
  // returns 3 numbered visual concept cards. Prepend a one-line note so
  // the user understands why they got text instead of pixels.
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('project_id', projectId)
    .lt('id', userMsg.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const messages = buildChatPrompt({
    mode: 'image',
    project: { name: project.name, platform: project.platform },
    context: ctx,
    skills: [],
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

  let assistantText = ''
  let providerInfo: any = { provider, model: 'mock' }
  try {
    const ai = await generateChat(
      event,
      { messages, temperature: 0.7, maxTokens: 1500 },
      { webSearch: false }
    )
    assistantText = ai.content
    providerInfo = { provider: ai.provider, model: ai.model, usage: ai.usage }
  } catch (e: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Image-concept generation failed: ${e?.message ?? 'unknown'}`,
    })
  }

  const note =
    'Image generation requires GLM or OpenAI — showing concept cards instead.\n\n'
  const { body: assistantBody, card } = parseAssistantResponse(assistantText, 'image')

  const { data: aiMsg, error: aiErr } = await supabase
    .from('chat_messages')
    .insert({
      project_id: projectId,
      role: 'assistant',
      content: note + assistantBody,
      mode_label: 'Image concept',
      metadata: { ...providerInfo, fallback: 'text_concept_cards' },
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
        accent: card.accent ?? 'var(--ft-amber)',
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
