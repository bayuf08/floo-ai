/**
 * POST /api/workspaces
 * Create a new workspace. The on_workspace_created trigger automatically
 * inserts the owner as a member with role='owner'.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'

const Schema = z.object({
  name: z.string().min(1).max(120),
  type: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(500).optional(),
  default_platform: z.enum(['tiktok', 'instagram', 'twitter', 'youtube', 'linkedin', 'threads']).optional(),
})

export default defineEventHandler(async (event) => {
  const u = requireUser(event)

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const supabase = serviceSupabase(event)
  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      ...parsed.data,
      owner_id: u.id,
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
