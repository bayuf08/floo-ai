/** DELETE /api/workspaces/:id — owner-only delete. */
import { assertWorkspaceOwner } from '~/server/utils/authz'
import { log } from '~/server/utils/logger'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { normalizeWorkspaceDeleteFailure } from '~/server/utils/workspace-delete'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceOwner(supabase, id, u.id)

  const { error } = await supabase.from('workspaces').delete().eq('id', id)
  if (error) {
    log.error('[workspaces/delete]', 'workspace delete failed', { workspaceId: id, userId: u.id, error })
    throw createError(normalizeWorkspaceDeleteFailure(error))
  }
  return { ok: true }
})
