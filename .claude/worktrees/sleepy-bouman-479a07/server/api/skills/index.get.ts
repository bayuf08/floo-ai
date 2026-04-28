/**
 * GET /api/skills?workspace=:wsId
 * List all skills visible to the current user — system rows + custom rows
 * for the queried workspace. Without `workspace`, returns system skills only.
 *
 * Caller must be a member of the queried workspace.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const workspaceId = query.workspace as string | undefined

  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  if (workspaceId) {
    await assertWorkspaceMember(supabase, workspaceId, u.id)
  }

  let qb = supabase
    .from('skills')
    .select('id, name, category, description, instructions, examples, is_custom, workspace_id, created_at')
    .order('is_custom', { ascending: true })
    .order('category')
    .order('name')

  if (workspaceId) {
    qb = qb.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
  } else {
    qb = qb.is('workspace_id', null)
  }

  const { data, error } = await qb
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
