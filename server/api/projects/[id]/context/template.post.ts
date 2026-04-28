/**
 * POST /api/projects/:id/context/template
 * Apply a rules template (system or workspace-custom) to the project context.
 * Editor+ on the target project; the template must be either is_system=true
 * or scoped to the same workspace as the project.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

const Schema = z.object({
  template_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  const { workspaceId } = await assertProjectEditor(supabase, id, u.id)

  // Pull template — must be system-wide or scoped to the project's workspace.
  const { data: tpl, error: tplErr } = await supabase
    .from('rules_templates')
    .select('brand_voice, do_guidelines, dont_guidelines, hashtags, is_system, workspace_id')
    .eq('id', parsed.data.template_id)
    .single()

  if (tplErr || !tpl) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }
  if (!tpl.is_system && tpl.workspace_id !== workspaceId) {
    throw createError({ statusCode: 403, statusMessage: 'Template belongs to a different workspace' })
  }

  const { data, error } = await supabase
    .from('project_contexts')
    .update({
      brand_voice: tpl.brand_voice ?? '',
      do_guidelines: tpl.do_guidelines ?? [],
      dont_guidelines: tpl.dont_guidelines ?? [],
      hashtags: tpl.hashtags ?? [],
    })
    .eq('project_id', id)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
