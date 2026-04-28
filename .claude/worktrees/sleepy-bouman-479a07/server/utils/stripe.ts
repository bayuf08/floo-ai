/**
 * Thin Stripe REST client. We avoid the `stripe` SDK dep — it's heavy and
 * we only need three endpoints:
 *
 *   - POST /v1/customers                      create / lookup a customer
 *   - POST /v1/checkout/sessions              start a Checkout Session for upgrade
 *   - POST /v1/billing_portal/sessions        open the Customer Portal
 *
 * Plus webhook signature verification using the raw request body.
 */
import type { H3Event } from 'h3'
import { createHmac, timingSafeEqual } from 'node:crypto'

const STRIPE_API = 'https://api.stripe.com/v1'

function getKey(event: H3Event): string {
  const config = useRuntimeConfig(event)
  if (!config.stripeSecretKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env.',
    })
  }
  return config.stripeSecretKey
}

/**
 * Stripe expects application/x-www-form-urlencoded with `[]`-style nesting.
 * Encode a flat record into the right format.
 */
function encodeForm(payload: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      value.forEach((v, i) => params.append(`${key}[${i}]`, String(v)))
    } else if (typeof value === 'object') {
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) {
        if (v2 !== undefined && v2 !== null) params.append(`${key}[${k2}]`, String(v2))
      }
    } else {
      params.append(key, String(value))
    }
  }
  return params.toString()
}

async function stripeRequest<T = any>(
  event: H3Event,
  path: string,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getKey(event)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm(payload),
  })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* ignore */ }
  if (!res.ok) {
    const message = json?.error?.message || `Stripe ${res.status}`
    throw createError({ statusCode: 502, statusMessage: `Stripe: ${message}` })
  }
  return json as T
}

// ─── Customers ─────────────────────────────────────────────
export async function createCustomer(
  event: H3Event,
  args: { email: string; name?: string; workspace_id: string }
): Promise<{ id: string }> {
  return stripeRequest(event, '/customers', {
    email: args.email,
    name: args.name,
    metadata: { workspace_id: args.workspace_id },
  })
}

// ─── Checkout sessions ─────────────────────────────────────
export interface CheckoutArgs {
  customer: string
  price: string
  successUrl: string
  cancelUrl: string
  workspaceId: string
}

export async function createCheckoutSession(event: H3Event, a: CheckoutArgs) {
  return stripeRequest(event, '/checkout/sessions', {
    mode: 'subscription',
    customer: a.customer,
    'line_items[0][price]': a.price,
    'line_items[0][quantity]': 1,
    success_url: a.successUrl,
    cancel_url: a.cancelUrl,
    'subscription_data[metadata][workspace_id]': a.workspaceId,
    allow_promotion_codes: 'true',
  })
}

// ─── Customer portal ───────────────────────────────────────
export async function createPortalSession(
  event: H3Event,
  args: { customer: string; returnUrl: string }
) {
  return stripeRequest(event, '/billing_portal/sessions', {
    customer: args.customer,
    return_url: args.returnUrl,
  })
}

// ─── Webhook signature verification ────────────────────────
/**
 * Validates the `Stripe-Signature` header against the raw request body.
 * Throws 400 if the signature is missing, malformed, or doesn't match.
 *
 * Stripe sends signatures of the form `t=1234,v1=hex,v1=hex,...` — we
 * compute HMAC-SHA256 of `${t}.${rawBody}` with the webhook secret and
 * compare to any of the v1 signatures.
 */
export function verifyWebhookSignature(
  event: H3Event,
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): void {
  if (!signatureHeader) {
    throw createError({ statusCode: 400, statusMessage: 'Missing Stripe-Signature header' })
  }
  const parts = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, p) => {
    const [k, v] = p.split('=')
    if (!k || !v) return acc
    acc[k] = acc[k] ?? []
    acc[k]!.push(v)
    return acc
  }, {})
  const t = parts.t?.[0]
  const v1s = parts.v1 ?? []
  if (!t || v1s.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Malformed Stripe signature' })
  }
  const payload = `${t}.${rawBody}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const matches = v1s.some((sig) => {
    const buf = Buffer.from(sig, 'utf8')
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf)
  })
  if (!matches) {
    throw createError({ statusCode: 400, statusMessage: 'Stripe signature mismatch' })
  }
}
