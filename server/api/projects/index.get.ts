/**
 * GET /api/projects?workspace=:wsId
 * List projects visible to the caller in the given workspace.
 *
 * Visibility rules:
 *   - Workspace owners/editors see ALL projects in the workspace.
 *   - Workspace viewers (typically users who only got an explicit project
 *     invitation) see ONLY projects they have a project_members row for.
 *
 * Caller must be a member of the workspace at any role.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const workspaceId = query.workspace as string | undefined
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing ?workspace=…' })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  const { role } = await assertWorkspaceMember(supabase, workspaceId, u.id)

  const baseSelect = `id, workspace_id, name, platform, color, is_pinned, created_at, updated_at`

  // Owners + editors get the full workspace list.
  if (role === 'owner' || role === 'editor') {
    const { data, error } = await supabase
      .from('projects')
      .select(baseSelect)
      .eq('workspace_id', workspaceId)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return data
  }

  // Viewers see only projects they were explicitly invited to.
  const { data: membershipRows, error: memErr } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', u.id)
  if (memErr) throw createError({ statusCode: 500, statusMessage: memErr.message })

  const projectIds = (membershipRows ?? []).map((r: any) => r.project_id)
  if (!projectIds.length) return []

  const { data, error } = await supabase
    .from('projects')
    .select(baseSelect)
    .eq('workspace_id', workspaceId)
    .in('id', projectIds)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
