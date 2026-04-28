/**
 * GET /api/workspaces
 * List all workspaces the current user is a member of.
 *
 * RLS used to scope this for free; we now filter explicitly via the
 * inner-join on workspace_members.user_id.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  const { data, error } = await supabase
    .from('workspaces')
    .select(`
      id, name, type, color, description, default_platform,
      owner_id, created_at, updated_at,
      workspace_members!inner(role)
    `)
    .eq('workspace_members.user_id', u.id)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
