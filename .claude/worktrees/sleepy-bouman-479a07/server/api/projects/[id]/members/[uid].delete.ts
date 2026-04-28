/**
 * DELETE /api/projects/:id/members/:uid
 * Editor+ on the project can remove anyone; any project member can remove
 * themselves.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const userId = getRouterParam(event, 'uid')
  if (!projectId || !userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing params' })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  const { role } = await assertProjectMember(supabase, projectId, u.id)

  if (userId !== u.id && role !== 'owner' && role !== 'editor') {
    throw createError({ statusCode: 403, statusMessage: 'Editor role required to remove other members' })
  }

  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
