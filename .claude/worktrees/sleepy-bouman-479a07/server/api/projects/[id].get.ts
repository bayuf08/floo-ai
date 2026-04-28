/**
 * GET /api/projects/:id
 * Project + context + active skills + members in one shot.
 * Member-only (workspace membership grants project read access).
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectMember(supabase, id, u.id)

  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, workspace_id, name, platform, color, is_pinned, created_at, updated_at,
      context:project_contexts(
        brand_voice, do_guidelines, dont_guidelines, hashtags,
        platform_handle, platform_bio, platform_followers
      ),
      project_skills(
        active,
        skill:skills(id, name, category, description, instructions, examples, is_custom)
      ),
      project_members(
        id, role, joined_at,
        user:profiles(id, name, email, initials, avatar_url)
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw createError({ statusCode: 404, statusMessage: error.message })
  return data
})
