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

  return {
    invite,
    accept_url: acceptUrl,
    email_sent: emailResult.ok,
    email_mock: emailResult.mock ?? false,
    email_error: emailResult.error,
  }
})
