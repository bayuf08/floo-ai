/**
 * POST /api/workspaces/:id/members
 * Invite a user (by email) to a workspace. Owner-only.
 *
 * Frontend-only happy path: if the email matches an existing profile, we add
 * them directly with the requested role. Otherwise we return a 404 — Phase 5
 * replaces this with a real Resend-backed invite flow (see /api/invites).
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceOwner } from '~/server/utils/authz'

const Schema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']).default('editor'),
})

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceOwner(supabase, workspaceId, u.id)

  const { data: target } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', parsed.data.email.toLowerCase())
    .maybeSingle()

  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No account found for that email. Real invite emails arrive in Phase 5.',
    })
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      user_id: target.id,
      role: parsed.data.role,
    })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
