/**
 * PATCH /api/rules-templates/:id — edit a custom rules template.
 *
 * System templates (is_system=true) are immutable. Caller must be an editor
 * or owner of the template's workspace.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'
import { buildRulesTemplateMutation } from '~/server/utils/rules-template'

const Schema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    voice_preview: z.string().max(280).optional(),
    brand_voice: z.string().optional(),
    do_guidelines: z.array(z.string()).optional(),
    dont_guidelines: z.array(z.string()).optional(),
    hashtags: z.array(z.string()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Empty patch' })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const mutation = buildRulesTemplateMutation(parsed.data, { requireAtLeastOneField: true })

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
    throw createError({ statusCode: 403, statusMessage: 'System templates cannot be edited' })
  }

  await assertWorkspaceEditor(supabase, existing.workspace_id, u.id)

  const { data, error } = await supabase
    .from('rules_templates')
    .update(mutation)
    .eq('id', id)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
