/**
 * PATCH /api/skills/:id
 *
 * Partially updates a custom skill. System skills (is_custom=false) are
 * rejected with 403. Only workspace editors/owners may update.
 *
 * Body (all optional — at least one must be present):
 *   name          string
 *   description   string
 *   instructions  string | null  (null clears the field)
 *   examples      string[] | null
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { buildSkillPatch } from '~/server/utils/skill-library'
import { assertWorkspaceEditor } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
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
    throw createError({ statusCode: 403, statusMessage: 'System skills cannot be edited' })
  }
  if (!skill.workspace_id) {
    throw createError({ statusCode: 403, statusMessage: 'Skill has no workspace' })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  await assertWorkspaceEditor(supabase, skill.workspace_id, user.id)

  // ── Build patch ───────────────────────────────────────────────────────────
  let patch: Record<string, unknown>
  try {
    patch = buildSkillPatch(body)
  } catch (error: any) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Invalid skill patch' })
  }

  // ── Update ────────────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('skills')
    .update(patch)
    .eq('id', id)
    .select('id, name, category, description, instructions, examples, is_custom, workspace_id, created_by, created_at, updated_at')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return data
})
