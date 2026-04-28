/**
 * POST /api/projects/:id/members
 * Invite a user (by email) to a project. Editor+ on the project required.
 * Same constraint as workspace invites: Phase 5 will swap this for a real
 * Resend invite flow; for now, the email must already correspond to an
 * existing profile.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'

const Schema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']).default('editor'),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email.toLowerCase())
    .maybeSingle()

  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No account found for that email. Real invite emails arrive in Phase 5.',
    })
  }

  const { data, error } = await supabase
    .from('project_members')
    .insert({
      project_id: projectId,
      user_id: target.id,
      role: parsed.data.role,
    })
    .select(`
      id, role, joined_at,
      user:profiles(id, name, email, initials, avatar_url)
    `)
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
