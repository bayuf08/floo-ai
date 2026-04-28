/**
 * POST /api/skills
 * Create a custom workspace skill. Caller must be an editor or owner of
 * the target workspace.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'

const Schema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  category: z.enum(['voice', 'format', 'trend', 'workflow']),
  description: z.string().max(500).optional(),
  instructions: z.string().optional(),
  examples: z.string().optional(),
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

  const { data, error } = await supabase
    .from('skills')
    .insert({
      ...parsed.data,
      is_custom: true,
      created_by: u.id,
    })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
