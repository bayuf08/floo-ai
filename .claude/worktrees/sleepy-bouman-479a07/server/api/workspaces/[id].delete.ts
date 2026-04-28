/** DELETE /api/workspaces/:id — owner-only delete. */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceOwner } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceOwner(supabase, id, u.id)

  const { error } = await supabase.from('workspaces').delete().eq('id', id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
