/**
 * POST /api/invites/:token/accept
 * Consume an invitation. Requires the caller to be authenticated; if their
 * email matches the invite's recipient email, they're added to the target
 * workspace or project with the invite's role and the invite is marked accepted.
 *
 * If the emails don't match (e.g. the user signed in with a different Google
 * account), we return 403 — the user needs to sign out and sign in with the
 * email the invite was sent to.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const u = requireUser(event)

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const supabase = serviceSupabase(event)

  const { data: invite, error: invErr } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (invErr) throw createError({ statusCode: 500, statusMessage: invErr.message })
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  if (invite.accepted_at) {
    throw createError({ statusCode: 410, statusMessage: 'This invitation was already accepted.' })
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'This invitation has expired.' })
  }

  // Confirm the signed-in user's email matches the invite recipient.
  const userEmail = u.email?.toLowerCase()
  if (!userEmail || userEmail !== invite.email.toLowerCase()) {
    throw createError({
      statusCode: 403,
      statusMessage: `This invite is for ${invite.email}. Sign in with that Google account to accept.`,
    })
  }

  if (invite.workspace_id) {
    const { error } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: invite.workspace_id,
        user_id: u.id,
        role: invite.role,
      })
      .select()
      .maybeSingle()
    // ignore unique-violation if the user is already a member
    if (error && !String(error.message).includes('duplicate key')) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  } else if (invite.project_id) {
    // Make sure the inviter's workspace also includes this user — without the
    // workspace membership, app-level authz on /api/projects/:id would block them.
    const { data: project } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', invite.project_id)
      .single()
    if (project?.workspace_id) {
      await supabase
        .from('workspace_members')
        .insert({ workspace_id: project.workspace_id, user_id: u.id, role: 'viewer' })
        .select()
        .maybeSingle()
        .then(() => {/* ignore duplicate */})
    }
    const { error } = await supabase
      .from('project_members')
      .insert({
        project_id: invite.project_id,
        user_id: u.id,
        role: invite.role,
      })
      .select()
      .maybeSingle()
    if (error && !String(error.message).includes('duplicate key')) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  await supabase.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)

  return {
    ok: true,
    target_type: invite.workspace_id ? 'workspace' : 'project',
    target_id: invite.workspace_id ?? invite.project_id,
  }
})
