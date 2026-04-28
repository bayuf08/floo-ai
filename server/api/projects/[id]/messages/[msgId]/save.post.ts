/**
 * POST /api/projects/:id/messages/:msgId/save
 * Save an output card from a message into the project's saved_outputs.
 * Editor+ only.
 *
 * Body: { card_id: uuid }
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

const Schema = z.object({ card_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const msgId = getRouterParam(event, 'msgId')
  if (!projectId || !msgId) throw createError({ statusCode: 400, statusMessage: 'Missing params' })

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  // Pull the card to copy into saved_outputs
  const { data: card, error: cardErr } = await supabase
    .from('output_cards')
    .select('label, sub, accent, items, message_id, kind, images')
    .eq('id', parsed.data.card_id)
    .eq('message_id', msgId)
    .single()

  if (cardErr || !card) throw createError({ statusCode: 404, statusMessage: 'Card not found' })

  const { data, error } = await supabase
    .from('saved_outputs')
    .insert({
      project_id: projectId,
      label: card.label ?? 'Output',
      sub: card.sub,
      accent: card.accent,
      items: card.items,
      kind: card.kind ?? 'text',
      images: card.images ?? [],
      saved_by: u.id,
    })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
