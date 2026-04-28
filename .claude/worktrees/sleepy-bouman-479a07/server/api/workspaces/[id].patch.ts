/** PATCH /api/workspaces/:id — owner-only update. */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceOwner } from '~/server/utils/authz'

const Schema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(500).nullish(),
  default_platform: z.enum(['tiktok', 'instagram', 'twitter', 'youtube', 'linkedin', 'threads']).optional(),
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
  await assertWorkspaceOwner(supabase, id, u.id)

  const { data, error } = await supabase
    .from('workspaces')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  return data
})
