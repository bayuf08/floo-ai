/**
 * POST /api/projects/:id/skills
 *
 * Upserts a skill's active state on a project (project_skills join table).
 * Used by the skill toggle on the Skill Library page and the Context panel.
 *
 * Body:
 *   skill_id  string   (required) — UUID of the skill
 *   active    boolean  (required) — true = activate, false = deactivate
 *
 * Auth: workspace editor or owner.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { isSkillAssignableToWorkspace } from '~/server/utils/skill-library'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const projectId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const supabase = serviceSupabase(event)

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'project id is required' })
  }
  if (!body?.skill_id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'skill_id is required' })
  }
  if (typeof body.active !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'active must be a boolean' })
  }

  // ── Auth: must be a workspace editor or owner ────────────────────────────
  const { workspaceId } = await assertProjectEditor(supabase, projectId, user.id)

  // ── Validate the skill is visible to this workspace ──────────────────────
  const { data: skill, error: skillErr } = await supabase
    .from('skills')
    .select('id, workspace_id')
    .eq('id', body.skill_id)
    .maybeSingle()

  if (skillErr) {
    throw createError({ statusCode: 500, statusMessage: skillErr.message })
  }
  if (!skill) {
    throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  }
  if (!isSkillAssignableToWorkspace(workspaceId, skill.workspace_id)) {
    throw createError({ statusCode: 403, statusMessage: 'Skill is not assignable to this project' })
  }

  // ── Upsert project_skills row ─────────────────────────────────────────────
  const { error } = await supabase
    .from('project_skills')
    .upsert(
      { project_id: projectId, skill_id: body.skill_id, active: body.active },
      { onConflict: 'project_id,skill_id' }
    )

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { success: true, skill_id: body.skill_id, active: body.active }
})
