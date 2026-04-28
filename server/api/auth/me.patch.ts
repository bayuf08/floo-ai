/**
 * PATCH /api/auth/me
 *
 * Update the current user's display fields.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'

const Schema = z.object({
  name: z.string().min(1).max(120).optional(),
  initials: z.string().min(1).max(4).optional(),
  avatar_url: z.string().url().nullish(),
})

export default defineEventHandler(async (event) => {
  const u = requireUser(event)

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid body',
      data: parsed.error.flatten(),
    })
  }

  const supabase = serviceSupabase(event)
  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', u.id)
    .select('id, name, email, role, avatar_url, initials, updated_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
