/**
 * GET /api/skills/:id — single skill detail.
 * System skills (workspace_id NULL) are visible to anyone authenticated.
 * Custom skills require membership in the owning workspace.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  const { data, error } = await supabase
    .from('skills')
    .select('id, name, category, description, instructions, examples, is_custom, workspace_id, created_at')
    .eq('id', id)
    .single()

  if (error) throw createError({ statusCode: 404, statusMessage: error.message })

  if (data.workspace_id) {
    await assertWorkspaceMember(supabase, data.workspace_id, u.id)
  }

  return data
})
