/**
 * DELETE /api/skills/:id
 *
 * Deletes a custom skill. System skills (is_custom=false) are rejected with
 * 403. Only workspace editors/owners may delete.
 *
 * Also cascades: project_skills rows referencing this skill are removed
 * automatically by the ON DELETE CASCADE FK in the schema.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getRouterParam(event, 'id')
  const supabase = serviceSupabase(event)

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  // ── Fetch skill ───────────────────────────────────────────────────────────
  const { data: skill, error: fetchErr } = await supabase
    .from('skills')
    .select('id, is_custom, workspace_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) throw createError({ statusCode: 500, statusMessage: fetchErr.message })
  if (!skill)   throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  if (!skill.is_custom) {
    throw createError({ statusCode: 403, statusMessage: 'System skills cannot be deleted' })
  }
  if (!skill.workspace_id) {
    throw createError({ statusCode: 403, statusMessage: 'Skill has no workspace' })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  await assertWorkspaceEditor(supabase, skill.workspace_id, user.id)

  // ── Delete ────────────────────────────────────────────────────────────────
  const { error } = await supabase
    .from('skills')
    .delete()
    .eq('id', id)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { success: true }
})
