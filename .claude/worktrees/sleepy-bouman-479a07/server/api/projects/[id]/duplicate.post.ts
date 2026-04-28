/**
 * POST /api/projects/:id/duplicate
 * Clone a project (and its context) into the same workspace with " (copy)" appended.
 * Editor+ on the source project required.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, id, u.id)

  // 1. Read source project + context
  const { data: source, error: srcErr } = await supabase
    .from('projects')
    .select(`
      workspace_id, name, platform, color,
      context:project_contexts(
        brand_voice, do_guidelines, dont_guidelines, hashtags,
        platform_handle, platform_bio, platform_followers
      )
    `)
    .eq('id', id)
    .single()

  if (srcErr || !source) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // 2. Create the new project
  const { data: newProject, error: insErr } = await supabase
    .from('projects')
    .insert({
      workspace_id: source.workspace_id,
      name: `${source.name} (copy)`,
      platform: source.platform,
      color: source.color,
    })
    .select()
    .single()

  if (insErr) throw createError({ statusCode: 500, statusMessage: insErr.message })

  // 3. Replace the trigger-created empty context with the source's values
  const ctx = Array.isArray(source.context) ? source.context[0] : source.context
  if (ctx) {
    await supabase
      .from('project_contexts')
      .update({
        brand_voice: ctx.brand_voice ?? '',
        do_guidelines: ctx.do_guidelines ?? [],
        dont_guidelines: ctx.dont_guidelines ?? [],
        hashtags: ctx.hashtags ?? [],
        platform_handle: ctx.platform_handle,
        platform_bio: ctx.platform_bio,
        platform_followers: ctx.platform_followers,
      })
      .eq('project_id', newProject.id)
  }

  return newProject
})
