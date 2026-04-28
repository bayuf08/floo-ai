/**
 * POST /api/rules-templates
 * Create a custom workspace rules template. Caller must be an editor or
 * owner of the target workspace. System templates are seeded via migration
 * and cannot be created through this endpoint (is_system is forced false).
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'
import { buildRulesTemplateMutation } from '~/server/utils/rules-template'

const Schema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  voice_preview: z.string().max(280).optional(),
  brand_voice: z.string().optional(),
  do_guidelines: z.array(z.string()).optional(),
  dont_guidelines: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceEditor(supabase, parsed.data.workspace_id, u.id)

  const mutation = buildRulesTemplateMutation(parsed.data)

  const { data, error } = await supabase
    .from('rules_templates')
    .insert({
      workspace_id: parsed.data.workspace_id,
      ...mutation,
      is_system: false, // workspace-custom only via this endpoint
    })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
