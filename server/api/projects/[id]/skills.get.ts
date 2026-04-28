/** GET /api/projects/:id/skills — list skills attached to a project. Member-only. */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectMember(supabase, id, u.id)

  const { data, error } = await supabase
    .from('project_skills')
    .select(`
      active,
      skill:skills(id, name, category, description, instructions, examples, is_custom)
    `)
    .eq('project_id', id)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
