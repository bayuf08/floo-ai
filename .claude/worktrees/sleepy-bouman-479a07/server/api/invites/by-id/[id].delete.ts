/**
 * DELETE /api/invites/by-id/:id
 * Revoke a pending invitation by its row id. Used by the workspace settings UI
 * which lists pending invites without exposing the magic-link token.
 *
 * Only the original inviter can revoke.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  const { data: invite } = await supabase
    .from('invitations')
    .select('id, invited_by')
    .eq('id', id)
    .maybeSingle()

  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  if (invite.invited_by !== u.id) {
    throw createError({ statusCode: 403, statusMessage: 'Only the inviter can revoke this invitation' })
  }

  const { error } = await supabase.from('invitations').delete().eq('id', id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
