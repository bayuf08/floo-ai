/**
 * DELETE /api/rules-templates/:id — delete a custom rules template.
 *
 * System templates are protected. Caller must be an editor or owner of
 * the template's workspace.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  const { data: existing, error: fetchErr } = await supabase
    .from('rules_templates')
    .select('id, is_system, workspace_id')
    .eq('id', id)
    .single()
  if (fetchErr || !existing) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }
  if (existing.is_system || !existing.workspace_id) {
    throw createError({ statusCode: 403, statusMessage: 'System templates cannot be deleted' })
  }

  await assertWorkspaceEditor(supabase, existing.workspace_id, u.id)

  const { error } = await supabase.from('rules_templates').delete().eq('id', id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true, id }
})
