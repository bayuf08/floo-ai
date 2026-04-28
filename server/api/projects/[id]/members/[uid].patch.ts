/** PATCH /api/projects/:id/members/:uid — change member role. Editor+ only. */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

const Schema = z.object({
  role: z.enum(['editor', 'viewer']),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const userId = getRouterParam(event, 'uid')
  if (!projectId || !userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing params' })
  }

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const { data, error } = await supabase
    .from('project_members')
    .update(parsed.data)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
