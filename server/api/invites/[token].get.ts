/**
 * GET /api/invites/:token
 * Look up an invitation by token. Returns metadata so the /invite/[token]
 * page can show "You've been invited to [workspace] by [name] as [role]".
 *
 * No auth required — the token is the proof of ownership.
 * (Marked as a public route in server/middleware/auth.ts.)
 */
import { serviceSupabase } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const admin = serviceSupabase(event)
  const { data: invite, error } = await admin
    .from('invitations')
    .select('id, email, role, workspace_id, project_id, accepted_at, expires_at, invited_by')
    .eq('token', token)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  if (invite.accepted_at) {
    throw createError({ statusCode: 410, statusMessage: 'This invitation was already accepted.' })
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'This invitation has expired.' })
  }

  // Hydrate the inviter and the target so the page can show meaningful info.
  const [{ data: inviter }, target] = await Promise.all([
    admin.from('profiles').select('name, email').eq('id', invite.invited_by).single(),
    invite.workspace_id
      ? admin.from('workspaces').select('id, name').eq('id', invite.workspace_id).single()
      : admin.from('projects').select('id, name').eq('id', invite.project_id!).single(),
  ])

  return {
    email: invite.email,
    role: invite.role,
    target_type: invite.workspace_id ? 'workspace' : 'project',
    target: (target as any)?.data ?? null,
    inviter: inviter ? { name: inviter.name, email: inviter.email } : null,
    expires_at: invite.expires_at,
  }
})
