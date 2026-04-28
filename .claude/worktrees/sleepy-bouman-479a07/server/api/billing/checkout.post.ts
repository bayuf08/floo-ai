/**
 * POST /api/billing/checkout
 * Start a Stripe Checkout Session to upgrade a workspace to a paid plan.
 *
 * Body: { workspace_id: uuid, plan: 'pro' | 'team' }
 * Returns: { url } — frontend redirects the browser there.
 *
 * Caller must be an editor or owner of the workspace.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'
import { createCustomer, createCheckoutSession } from '~/server/utils/stripe'

const Schema = z.object({
  workspace_id: z.string().uuid(),
  plan: z.enum(['pro', 'team']),
})

export default defineEventHandler(async (event) => {
  const u = requireUser(event)

  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const config = useRuntimeConfig(event)
  const priceId = parsed.data.plan === 'pro' ? config.stripePriceIdPro : config.stripePriceIdTeam
  if (!priceId) {
    throw createError({
      statusCode: 500,
      statusMessage: `STRIPE_PRICE_ID_${parsed.data.plan.toUpperCase()} is not configured.`,
    })
  }

  const supabase = serviceSupabase(event)
  await assertWorkspaceEditor(supabase, parsed.data.workspace_id, u.id)

  const { data: ws } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', parsed.data.workspace_id)
    .single()
  if (!ws) throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })

  // Get / create Stripe customer
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, stripe_customer_id')
    .eq('workspace_id', parsed.data.workspace_id)
    .maybeSingle()

  let customerId = existing?.stripe_customer_id
  if (!customerId) {
    const customer = await createCustomer(event, {
      email: u.email,
      name: ws.name,
      workspace_id: parsed.data.workspace_id,
    })
    customerId = customer.id
    if (existing) {
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('subscriptions')
        .insert({ workspace_id: parsed.data.workspace_id, stripe_customer_id: customerId })
    }
  }

  const session = await createCheckoutSession(event, {
    customer: customerId!,
    price: priceId,
    successUrl: `${config.public.appUrl}/settings?billing=success`,
    cancelUrl: `${config.public.appUrl}/settings?billing=cancel`,
    workspaceId: parsed.data.workspace_id,
  })

  return { url: session.url, id: session.id }
})
