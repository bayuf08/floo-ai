/**
 * POST /api/projects/:id/messages/upload
 * Multipart variant of the chat send endpoint — accepts text + files. Editor+ only.
 *
 * Form fields:
 *   content   text       — required, the user's message
 *   mode      text       — optional, one of the 6 ContentMode values
 *   file      file(*)    — repeated, attached files (≤ MAX_ATTACHMENT_SIZE_MB each)
 *
 * Files are uploaded to message-attachments/{projectId}/{messageId}/{uuid}.{ext}
 * and their storage paths are stored in chat_messages.metadata.attachments[].
 */
import { readMultipartFormData } from 'h3'
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { generateChat } from '~/server/utils/ai'
import {
  buildChatPrompt,
  parseAssistantResponse,
  WEB_SEARCH_MODES,
} from '~/server/utils/prompt-builder'
import { uploadToStorage, randomId, signedUrl } from '~/server/utils/storage'
import { rateLimitAi } from '~/server/utils/rate-limit'
import { checkAndIncrementMessageQuota } from '~/server/utils/quota'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

const MODE_LABELS: Record<string, string> = {
  research: 'Research',
  competitor: 'Competitor research',
  trend: 'Trend research',
  copy: 'Write copy',
  image: 'Image concept',
  video: 'Video concept',
}

const ModeSchema = z.enum(['research', 'competitor', 'trend', 'copy', 'image', 'video']).optional()

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const perMin = Number(process.env.RATE_LIMIT_AI_REQUESTS_PER_MINUTE) || 20
  rateLimitAi(event, u.id, perMin)

  await checkAndIncrementMessageQuota(event, projectId)

  const config = useRuntimeConfig(event)
  const maxBytes = (config.maxAttachmentSizeMb || 25) * 1024 * 1024
  const bucket = config.storageBucketAttachments

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'Empty body' })

  let content = ''
  let mode: string | undefined
  const files: { filename: string; data: Buffer; type: string }[] = []

  for (const p of parts) {
    if (!p.name) continue
    if (p.name === 'content') content = p.data.toString('utf8')
    else if (p.name === 'mode') mode = p.data.toString('utf8')
    else if (p.name === 'file' && p.filename && p.data) {
      files.push({ filename: p.filename, data: p.data as Buffer, type: p.type || 'application/octet-stream' })
    }
  }

  if (!content.trim()) {
    throw createError({ statusCode: 400, statusMessage: '`content` is required' })
  }
  const modeParsed = ModeSchema.safeParse(mode || undefined)
  if (!modeParsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid mode' })
  }

  // 1. Persist user message (no metadata yet — we'll patch in attachment paths)
  const { data: userMsg, error: userErr } = await supabase
    .from('chat_messages')
    .insert({
      project_id: projectId,
      role: 'user',
      content,
      mode_label: modeParsed.data ? MODE_LABELS[modeParsed.data] : null,
      metadata: {},
    })
    .select()
    .single()

  if (userErr) throw createError({ statusCode: 500, statusMessage: userErr.message })

  // 2. Upload files to message-attachments/{projectId}/{messageId}/{uuid}.{ext}
  const attachments: { name: string; size: number; storage_path: string }[] = []
  const warnings: string[] = []

  for (const f of files) {
    if (f.data.byteLength > maxBytes) {
      warnings.push(
        `"${f.filename}" is ${(f.data.byteLength / 1024 / 1024).toFixed(1)}MB — over the ${config.maxAttachmentSizeMb}MB limit. Skipped.`
      )
      continue
    }
    const ext = (f.filename.split('.').pop() ?? 'bin').toLowerCase()
    const path = `${projectId}/${userMsg.id}/${randomId()}.${ext}`
    try {
      await uploadToStorage(event, bucket, path, f.data, f.type)
      attachments.push({ name: f.filename, size: f.data.byteLength, storage_path: path })
    } catch (e: any) {
      warnings.push(`Upload of "${f.filename}" failed: ${e?.message ?? 'unknown'}`)
    }
  }

  if (attachments.length || warnings.length) {
    await supabase
      .from('chat_messages')
      .update({ metadata: { attachments, upload_warnings: warnings } })
      .eq('id', userMsg.id)
  }

  // 3. Build prompt context — same as messages.post.ts
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
        .select('active, skill:skills(name, description, instructions, examples)')
        .eq('project_id', projectId)
        .eq('active', true),
      supabase
        .from('brand_assets')
        .select('name, description, category, extracted_text')
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

  // Append a brief reference to attached files into the user message visible to the AI.
  let userMessageWithAttachments = content
  const nonImageAttachments = attachments.filter(
    (a) => !IMAGE_EXTS.has((a.name.split('.').pop() ?? '').toLowerCase())
  )
  if (nonImageAttachments.length) {
    const list = nonImageAttachments.map((a) => `- ${a.name}`).join('\n')
    userMessageWithAttachments += `\n\n[Attached files for this message]\n${list}`
  }

  // Build signed URLs for image attachments — fed to vision-capable model.
  const imageAttachments: { url: string; name: string }[] = []
  for (const a of attachments) {
    const ext = (a.name.split('.').pop() ?? '').toLowerCase()
    if (!IMAGE_EXTS.has(ext)) continue
    const url = await signedUrl(event, bucket, a.storage_path, 60 * 60)
    if (url) imageAttachments.push({ url, name: a.name })
  }

  const messages = buildChatPrompt({
    mode: modeParsed.data,
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
    brandAssets: (assets ?? []).map((a: any) => ({
      name: a.name,
      description: a.description,
      category: a.category,
      extracted_text: a.extracted_text,
    })),
    history: (history ?? []).reverse().map((h: any) => ({ role: h.role, content: h.content })),
    userMessage: userMessageWithAttachments,
    attachments: imageAttachments.length ? imageAttachments : undefined,
  })

  // 4. Call the AI — switch to vision model when images are attached;
  //    enable web search for grounded research/competitor/trend modes.
  const useVision = imageAttachments.length > 0
  const useWebSearch = modeParsed.data ? WEB_SEARCH_MODES.has(modeParsed.data) : false
  let assistantText = ''
  let providerInfo: any = { provider: 'mock', model: 'mock' }
  try {
    const ai = await generateChat(
      event,
      { messages, temperature: 0.7, maxTokens: 1500 },
      { vision: useVision, webSearch: useWebSearch && !useVision } // vision + web_search are mutually exclusive on z.ai
    )
    assistantText = ai.content
    providerInfo = {
      provider: ai.provider,
      model: ai.model,
      usage: ai.usage,
      citations: ai.citations,
    }
  } catch (e: any) {
    assistantText = `Floo couldn't reach the AI provider this time. (${e?.message ?? 'unknown error'})`
  }

  // 5. Persist assistant response
  const { body: assistantBody, card } = parseAssistantResponse(assistantText, modeParsed.data)
  const { data: aiMsg, error: aiErr } = await supabase
    .from('chat_messages')
    .insert({
      project_id: projectId,
      role: 'assistant',
      content: assistantBody,
      mode_label: modeParsed.data ? MODE_LABELS[modeParsed.data] : null,
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
    user_message: { ...userMsg, metadata: { attachments, upload_warnings: warnings } },
    assistant_message: { ...aiMsg, output_cards: outputCards },
    warnings,
  }
})
