/**
 * GET /api/projects?workspace=:wsId
 * List projects in a workspace. Caller must be a member of that workspace.
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
  await assertWorkspaceMember(supabase, workspaceId, u.id)

  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, workspace_id, name, platform, color, is_pinned,
      created_at, updated_at
    `)
    .eq('workspace_id', workspaceId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
