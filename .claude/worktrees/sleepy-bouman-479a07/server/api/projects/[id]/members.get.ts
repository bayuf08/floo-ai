/** GET /api/projects/:id/members — list members with user info. Member-only. */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectMember(supabase, id, u.id)

  const { data, error } = await supabase
    .from('project_members')
    .select(`
      id, role, joined_at,
      user:profiles(id, name, email, initials, avatar_url)
    `)
    .eq('project_id', id)
    .order('joined_at', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
