/** GET /api/workspaces/:id — workspace detail with members. Member-only. */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceMember(supabase, id, u.id)

  const { data, error } = await supabase
    .from('workspaces')
    .select(`
      id, name, type, color, description, default_platform,
      owner_id, created_at, updated_at,
      workspace_members(
        id, role, joined_at,
        user:profiles(id, name, email, initials, avatar_url)
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    throw createError({ statusCode: 404, statusMessage: error.message })
  }
  return data
})
