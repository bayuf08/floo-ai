/**
 * GET /api/invites?workspace=:wsId&project=:projId
 * List pending (un-accepted, non-expired) invitations for a workspace or project.
 * Caller must be a member of the workspace or project.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember, assertProjectMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const workspaceId = query.workspace as string | undefined
  const projectId = query.project as string | undefined

  if (!workspaceId && !projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Pass ?workspace= or ?project=' })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  if (workspaceId) await assertWorkspaceMember(supabase, workspaceId, u.id)
  else if (projectId) await assertProjectMember(supabase, projectId, u.id)

  let q = supabase
    .from('invitations')
    .select(`
      id, email, role, expires_at, created_at, accepted_at,
      inviter:profiles!invitations_invited_by_fkey(name, email)
    `)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  else if (projectId) q = q.eq('project_id', projectId)

  const { data, error } = await q
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
