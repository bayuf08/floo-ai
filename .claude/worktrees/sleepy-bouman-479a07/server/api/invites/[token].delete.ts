/**
 * DELETE /api/invites/:token
 * Revoke a pending invitation. Caller must be the original inviter.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  const { data: invite } = await supabase
    .from('invitations')
    .select('id, invited_by')
    .eq('token', token)
    .maybeSingle()

  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  if (invite.invited_by !== u.id) {
    throw createError({ statusCode: 403, statusMessage: 'Only the inviter can revoke this invitation' })
  }

  const { error } = await supabase.from('invitations').delete().eq('id', invite.id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
