/** PATCH /api/workspaces/:id/members/:uid — change role. Owner-only. */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceOwner } from '~/server/utils/authz'

const Schema = z.object({
  role: z.enum(['editor', 'viewer']),
})

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  const userId = getRouterParam(event, 'uid')
  if (!workspaceId || !userId) throw createError({ statusCode: 400, statusMessage: 'Missing params' })

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceOwner(supabase, workspaceId, u.id)

  const { data, error } = await supabase
    .from('workspace_members')
    .update(parsed.data)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
