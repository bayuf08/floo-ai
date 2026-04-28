/**
 * POST /api/billing/webhook
 *
 * Stripe → us. Authenticates via the `Stripe-Signature` header instead of
 * a session cookie (whitelisted in server/middleware/auth.ts).
 *
 * Handles the subscription lifecycle events that change a workspace's
 * plan / status / period dates. We deliberately leave failed-payment
 * dunning to Stripe's emails — `past_due` just blocks AI calls until
 * the customer fixes their payment method via the Customer Portal.
 */
import { readRawBody } from 'h3'
import { serviceSupabase } from '~/server/utils/supabase'
import { verifyWebhookSignature } from '~/server/utils/stripe'

interface StripeSubscription {
  id: string
  customer: string
  status: string
  cancel_at_period_end: boolean
  current_period_start: number
  current_period_end: number
  items: { data: Array<{ price: { id: string } }> }
  metadata?: Record<string, string>
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.stripeWebhookSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'STRIPE_WEBHOOK_SECRET is not configured.',
    })
  }

  const sig = getHeader(event, 'stripe-signature')
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  // Throws 400 if signature is missing/invalid
  verifyWebhookSignature(event, rawBody, sig, config.stripeWebhookSecret)

  const payload = JSON.parse(rawBody)
  const eventType = payload?.type as string
  const obj = payload?.data?.object

  const admin = serviceSupabase(event)

  switch (eventType) {
    case 'checkout.session.completed': {
      // First successful subscription — link customer + sub on the row.
      // The actual plan/status comes through customer.subscription.* events
      // immediately after, so we just log here.
      if (obj?.subscription && obj?.customer && obj?.metadata?.workspace_id) {
        await admin
          .from('subscriptions')
          .update({
            stripe_customer_id: obj.customer,
            stripe_subscription_id: obj.subscription,
          })
          .eq('workspace_id', obj.metadata.workspace_id)
      }
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = obj as StripeSubscription
      const plan = priceToPlan(sub.items?.data?.[0]?.price?.id, config)
      const workspaceId = sub.metadata?.workspace_id
      const update = {
        plan,
        status: sub.status,
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        stripe_price_id: sub.items?.data?.[0]?.price?.id ?? null,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        current_period_start: sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString()
          : null,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
      }
      if (workspaceId) {
        await admin.from('subscriptions').update(update).eq('workspace_id', workspaceId)
      } else {
        await admin.from('subscriptions').update(update).eq('stripe_subscription_id', sub.id)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = obj as StripeSubscription
      await admin
        .from('subscriptions')
        .update({
          plan: 'free',
          status: 'canceled',
          stripe_subscription_id: null,
          stripe_price_id: null,
          cancel_at_period_end: false,
        })
        .eq('stripe_subscription_id', sub.id)
      break
    }

    default:
      // Ignore — Stripe sends a lot of events we don't act on.
      break
  }

  return { received: true }
})

function priceToPlan(priceId: string | undefined, config: any): 'free' | 'pro' | 'team' {
  if (!priceId) return 'free'
  if (priceId === config.stripePriceIdPro) return 'pro'
  if (priceId === config.stripePriceIdTeam) return 'team'
  return 'free'
}
