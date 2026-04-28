/** DELETE /api/projects/:id/saved/:savedId — un-save an output. Editor+ only. */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const savedId = getRouterParam(event, 'savedId')
  if (!projectId || !savedId) throw createError({ statusCode: 400, statusMessage: 'Missing params' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const { error } = await supabase
    .from('saved_outputs')
    .delete()
    .eq('id', savedId)
    .eq('project_id', projectId)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
