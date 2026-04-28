/**
 * PATCH /api/projects/:id/context
 * Update brand voice, DO/DON'T, hashtags, and platform profile fields.
 * Editor+ only.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

const Schema = z.object({
  brand_voice: z.string().optional(),
  do_guidelines: z.array(z.string()).optional(),
  dont_guidelines: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  platform_handle: z.string().nullish(),
  platform_bio: z.string().max(150).nullish(),
  platform_followers: z.number().int().nullish(),
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
  await assertProjectEditor(supabase, id, u.id)

  const { data, error } = await supabase
    .from('project_contexts')
    .update(parsed.data)
    .eq('project_id', id)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
