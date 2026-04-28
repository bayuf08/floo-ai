/** PATCH /api/projects/:id/assets/:assetId — update description only. Editor+ only. */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

const Schema = z.object({
  description: z.string().max(500),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const assetId = getRouterParam(event, 'assetId')
  if (!projectId || !assetId) {
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
    .from('brand_assets')
    .update({ description: parsed.data.description })
    .eq('id', assetId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
