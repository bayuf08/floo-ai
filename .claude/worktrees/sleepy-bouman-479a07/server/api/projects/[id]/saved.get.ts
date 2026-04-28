/** GET /api/projects/:id/saved — list saved output cards for a project. Member-only. */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectMember(supabase, id, u.id)

  const { data, error } = await supabase
    .from('saved_outputs')
    .select(`
      id, label, sub, accent, items, saved_at,
      saver:profiles(id, name, initials)
    `)
    .eq('project_id', id)
    .order('saved_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
