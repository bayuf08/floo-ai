/**
 * PATCH /api/projects/:id/saved/:savedId
 * Rename a saved output's label / sub. Editor+ on the project required.
 *
 * Body (all optional): { label?, sub? }
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

const Schema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    sub: z.string().max(280).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Empty patch' })

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const savedId = getRouterParam(event, 'savedId')
  if (!projectId || !savedId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing params' })
  }

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const { data, error } = await supabase
    .from('saved_outputs')
    .update(parsed.data)
    .eq('id', savedId)
    .eq('project_id', projectId) // belt-and-braces — prevents cross-project edits
    .select()
    .single()

  if (error) throw createError({ statusCode: error.code === 'PGRST116' ? 404 : 500, statusMessage: error.message })
  return data
})
