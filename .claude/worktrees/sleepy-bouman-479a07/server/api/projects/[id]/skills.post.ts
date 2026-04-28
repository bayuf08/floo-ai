/**
 * POST /api/projects/:id/skills
 *
 * Toggle (or set) a skill on a project. Upserts so the same call works
 * for "add skill" and "flip active" without two endpoints. Editor+ only.
 *
 * Body: { skill_id: uuid, active?: boolean }   // active defaults to true
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

const Schema = z.object({
  skill_id: z.string().uuid(),
  active: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  // If `active` was omitted, flip the existing value (default true on first insert).
  let nextActive = parsed.data.active
  if (nextActive === undefined) {
    const { data: existing } = await supabase
      .from('project_skills')
      .select('active')
      .eq('project_id', projectId)
      .eq('skill_id', parsed.data.skill_id)
      .maybeSingle()
    nextActive = existing ? !existing.active : true
  }

  const { data, error } = await supabase
    .from('project_skills')
    .upsert(
      { project_id: projectId, skill_id: parsed.data.skill_id, active: nextActive },
      { onConflict: 'project_id,skill_id' }
    )
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
