/**
 * POST /api/invites
 * Create an invitation row, send the invite email, return the new row.
 *
 * Body: { email, role, workspace_id?, project_id? }   // exactly one of *_id
 *
 * Caller must be an editor or owner on the target workspace/project. The
 * recipient receives an email with a magic link to /invite/[token]
 * which finishes Google OAuth (if needed) and runs the accept endpoint.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor, assertProjectEditor } from '~/server/utils/authz'
import { sendEmail, inviteEmailHtml } from '~/server/utils/email'

const Schema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']).default('editor'),
  workspace_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
}).refine((v) => !!v.workspace_id !== !!v.project_id, {
  message: 'Exactly one of workspace_id or project_id is required',
})

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  if (parsed.data.workspace_id) {
    await assertWorkspaceEditor(supabase, parsed.data.workspace_id, u.id)
  } else {
    await assertProjectEditor(supabase, parsed.data.project_id!, u.id)
  }

  // ── Guard 1: duplicate-pending-invite ────────────────────────────────────
  // Prevent creating a second open invite for the same email + target. Owners
  // should revoke the existing one first to re-send.
  const { data: existing } = await supabase
    .from('invitations')
    .select('id')
    .eq('email', parsed.data.email.toLowerCase())
    .eq(
      parsed.data.workspace_id ? 'workspace_id' : 'project_id',
      parsed.data.workspace_id ?? parsed.data.project_id!,
    )
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: `${parsed.data.email} already has a pending invite. Revoke it first to re-send.`,
    })
  }

  // ── Guard 2: already-a-member (workspace invites only) ───────────────────
  // Inviting an existing workspace member should fail loudly instead of
  // silently creating an unusable invite row.
  if (parsed.data.workspace_id) {
    const { data: inviteeProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', parsed.data.email.toLowerCase())
      .maybeSingle()

    if (inviteeProfile) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', parsed.data.workspace_id)
        .eq('user_id', inviteeProfile.id)
        .maybeSingle()

      if (membership) {
        throw createError({
          statusCode: 409,
          statusMessage: `${parsed.data.email} is already a member of this workspace.`,
        })
      }
    }
  }

  // Pull the inviter's display name + the target name so the email body has context.
  const [{ data: profile }, target] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', u.id).single(),
    parsed.data.workspace_id
      ? supabase.from('workspaces').select('name').eq('id', parsed.data.workspace_id).single()
      : supabase.from('projects').select('name').eq('id', parsed.data.project_id!).single(),
  ])

  const targetName = (target as any)?.data?.name ?? 'the team'

  const token = randomToken()
  const { data: invite, error } = await supabase
    .from('invitations')
    .insert({
      token,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      workspace_id: parsed.data.workspace_id ?? null,
      project_id: parsed.data.project_id ?? null,
      invited_by: u.id,
    })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const config = useRuntimeConfig(event)
  const acceptUrl = `${config.public.appUrl}/invite/${token}`

  const emailResult = await sendEmail(event, {
    to: parsed.data.email,
    subject: `${profile?.name ?? 'Someone'} invited you to ${targetName} on Floo·Content`,
    html: inviteEmailHtml({
      inviterName: profile?.name ?? 'A collaborator',
      targetType: parsed.data.workspace_id ? 'workspace' : 'project',
      targetName,
      acceptUrl,
      role: parsed.data.role,
    }),
  })

  if (!emailResult.ok) {
    // Email delivery failed (e.g. no verified domain). Log the accept URL so
    // you can copy-paste it for manual testing during development.
    console.warn('[invite] Email failed to send. Accept URL for manual sharing:', acceptUrl)
  }

  return {
    invite,
    accept_url: acceptUrl,
    email_sent: emailResult.ok,
    email_mock: emailResult.mock ?? false,
    email_error: emailResult.error,
  }
})
