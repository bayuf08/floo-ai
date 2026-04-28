/**
 * DELETE /api/workspaces/:id/members/:uid
 * The workspace owner can remove anyone; any member can remove themselves
 * (i.e. leave the workspace).
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  const userId = getRouterParam(event, 'uid')
  if (!workspaceId || !userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing params' })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  const { role } = await assertWorkspaceMember(supabase, workspaceId, u.id)

  // Allow self-removal regardless of role; otherwise require owner.
  if (userId !== u.id && role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Owner role required to remove other members' })
  }

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
