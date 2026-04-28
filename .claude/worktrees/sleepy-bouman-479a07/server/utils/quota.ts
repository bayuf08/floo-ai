/**
 * Plan-based monthly quota enforcement.
 *
 * Looks up the workspace owning a project, reads its subscription, increments
 * the `ai_messages` counter atomically (via the SQL increment_usage helper),
 * and throws 402 (Payment Required) if the new count would exceed the plan's
 * quota. Uses 402 instead of 429 to distinguish "you're rate-limited" from
 * "you're over your monthly plan cap".
 */
import type { H3Event } from 'h3'
import { serviceSupabase } from './supabase'

export interface QuotaResult {
  plan: string
  status: string
  count: number
  quota: number
}

/**
 * Throws 402 if the workspace is over its monthly AI message quota.
 * Otherwise increments the counter and returns the new totals.
 *
 * Free tier always works in mock-AI mode (no real provider call) so we
 * still meter for visibility but don't block.
 */
export async function checkAndIncrementMessageQuota(
  event: H3Event,
  projectId: string
): Promise<QuotaResult | null> {
  const admin = serviceSupabase(event)

  // 1. Resolve workspace from project
  const { data: project } = await admin
    .from('projects')
    .select('workspace_id')
    .eq('id', projectId)
    .single()
  if (!project?.workspace_id) return null

  // 2. Pull subscription + quota
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan, status')
    .eq('workspace_id', project.workspace_id)
    .maybeSingle()

  const plan = sub?.plan ?? 'free'
  const status = sub?.status ?? 'active'

  // Past-due / canceled subscriptions are blocked from new AI generations.
  if (status === 'past_due' || status === 'canceled' || status === 'incomplete') {
    throw createError({
      statusCode: 402,
      statusMessage: `Subscription is ${status} — open the billing portal to fix payment.`,
    })
  }

  const { data: quotaRow } = await admin.rpc('plan_message_quota', { plan_name: plan })
  const quota = Number(quotaRow ?? 100)

  // 3. Atomically increment + read the new count
  const { data: newCountRow, error: incErr } = await admin.rpc('increment_usage', {
    p_workspace_id: project.workspace_id,
    p_metric: 'ai_messages',
    p_amount: 1,
  })
  if (incErr) {
    console.warn('[quota] increment_usage failed', incErr)
    return null
  }
  const count = Number(newCountRow ?? 0)

  if (count > quota) {
    throw createError({
      statusCode: 402,
      statusMessage: `You've used all ${quota} AI messages this month on the ${plan} plan. Upgrade to keep generating.`,
    })
  }

  return { plan, status, count, quota }
}
