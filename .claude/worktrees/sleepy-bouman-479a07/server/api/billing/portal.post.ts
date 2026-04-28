/**
 * POST /api/billing/portal
 * Open Stripe's hosted Customer Portal so the user can update payment
 * methods, switch plans, or cancel.
 *
 * Body: { workspace_id: uuid }
 * Returns: { url } — frontend redirects there.
 *
 * Caller must be an editor or owner of the workspace.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'
import { createPortalSession } from '~/server/utils/stripe'

const Schema = z.object({ workspace_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const u = requireUser(event)

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const supabase = serviceSupabase(event)
  await assertWorkspaceEditor(supabase, parsed.data.workspace_id, u.id)

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('workspace_id', parsed.data.workspace_id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No Stripe customer for this workspace yet — upgrade to a paid plan first.',
    })
  }

  const config = useRuntimeConfig(event)
  const session = await createPortalSession(event, {
    customer: sub.stripe_customer_id,
    returnUrl: `${config.public.appUrl}/settings`,
  })
  return { url: session.url }
})
