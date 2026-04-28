/**
 * GET /api/billing/:workspaceId
 * Returns the current subscription + usage for a workspace, plus the
 * plan's monthly message quota. Used by the billing tab in /settings.
 *
 * Member-only.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'workspaceId')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Missing workspaceId' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceMember(supabase, workspaceId, u.id)

  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select(
      'plan, status, stripe_customer_id, stripe_price_id, current_period_start, current_period_end, cancel_at_period_end, updated_at'
    )
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (subErr) throw createError({ statusCode: 500, statusMessage: subErr.message })

  const planName = sub?.plan ?? 'free'
  const { data: quotaRow } = await supabase.rpc('plan_message_quota', { plan_name: planName })

  const { data: usageRow } = await supabase
    .from('usage_metering')
    .select('count, period_start')
    .eq('workspace_id', workspaceId)
    .eq('metric', 'ai_messages')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    subscription: sub ?? { plan: 'free', status: 'active' },
    usage: {
      ai_messages_this_month: Number(usageRow?.count ?? 0),
      period_start: usageRow?.period_start ?? null,
      quota: Number(quotaRow ?? 100),
    },
  }
})
