/**
 * GET /api/projects/:id/messages?limit=…&before=…
 * Paginated chat history. Returns oldest → newest within the page. Member-only.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectMember } from '~/server/utils/authz'

const Query = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  before: z.string().optional(),  // ISO timestamp — fetch messages older than this
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const query = getQuery(event)
  const parsed = Query.safeParse(query)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectMember(supabase, id, u.id)

  let q = supabase
    .from('chat_messages')
    .select(`
      id, project_id, role, content, mode_label, metadata, created_at,
      output_cards(id, label, sub, accent, can_copy, items, kind, images)
    `)
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit)

  if (parsed.data.before) q = q.lt('created_at', parsed.data.before)

  const { data, error } = await q
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  // Return chronological (oldest first) for the chat UI.
  return (data ?? []).reverse()
})
