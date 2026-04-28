/**
 * GET /api/skills
 *
 * Returns system skills (workspace_id IS NULL) plus any custom skills
 * belonging to the requested workspace.
 *
 * Query params:
 *   workspace  — UUID of the workspace whose custom skills to include.
 *                Omit to get system skills only.
 *
 * Auth: any authenticated user. If `workspace` is provided the caller
 * must be a member of that workspace.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { workspace } = getQuery(event) as { workspace?: string }
  const supabase = serviceSupabase(event)

  // If scoped to a workspace, verify the caller is a member.
  if (workspace) {
    await assertWorkspaceMember(supabase, workspace, user.id)
  }

  let query = supabase
    .from('skills')
    .select('id, name, category, description, instructions, examples, is_custom, workspace_id, created_by, created_at, updated_at')
    .order('created_at', { ascending: true })

  if (workspace) {
    // System skills (no workspace) OR custom skills for this workspace.
    query = query.or(`workspace_id.is.null,workspace_id.eq.${workspace}`)
  } else {
    query = query.is('workspace_id', null)
  }

  const { data, error } = await query

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data ?? []
})
