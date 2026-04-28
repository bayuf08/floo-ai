-- ============================================================
-- Billing schema — workspace-scoped subscriptions + monthly usage caps.
--
-- One subscription per workspace. Plan tiers: free | pro | team
-- (free plan rows are inserted lazily when the workspace makes its first
-- AI call so we always have somewhere to record usage).
-- ============================================================

CREATE TABLE public.subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID UNIQUE NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan                     TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  /** Stripe identifiers — populated once the workspace has paid for a plan. */
  stripe_customer_id       TEXT UNIQUE,
  stripe_subscription_id   TEXT UNIQUE,
  stripe_price_id          TEXT,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subscriptions_workspace ON public.subscriptions(workspace_id);
CREATE INDEX idx_subscriptions_stripe_sub ON public.subscriptions(stripe_subscription_id);

CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Usage metering ─────────────────────────────────────────
-- One row per (workspace, calendar month, metric).
-- We only track ai_messages for now; tokens can be added later by
-- inserting a different `metric` value.

CREATE TABLE public.usage_metering (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric        TEXT NOT NULL DEFAULT 'ai_messages',
  /** First day of the month in UTC, e.g. 2026-04-01. */
  period_start  DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  count         BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, metric, period_start)
);

CREATE INDEX idx_usage_workspace_period ON public.usage_metering(workspace_id, period_start);

CREATE TRIGGER trg_usage_metering_updated_at BEFORE UPDATE ON public.usage_metering
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Plan limits — read by the API layer ────────────────────
-- Keeping these as a SQL function lets ops tune limits without a deploy.
CREATE OR REPLACE FUNCTION public.plan_message_quota(plan_name TEXT)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE plan_name
    WHEN 'free' THEN 100        -- 100 AI messages / month
    WHEN 'pro'  THEN 2000
    WHEN 'team' THEN 10000
    ELSE 100
  END;
$$;

-- Helper used by the AI endpoints — atomically increments usage and
-- returns the new count. Called via supabase.rpc from server code.
CREATE OR REPLACE FUNCTION public.increment_usage(p_workspace_id UUID, p_metric TEXT, p_amount BIGINT DEFAULT 1)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count BIGINT;
  this_month DATE := date_trunc('month', now())::date;
BEGIN
  INSERT INTO public.usage_metering (workspace_id, metric, period_start, count)
  VALUES (p_workspace_id, p_metric, this_month, p_amount)
  ON CONFLICT (workspace_id, metric, period_start)
  DO UPDATE SET count = usage_metering.count + p_amount, updated_at = now()
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

-- Auto-create a free subscription row whenever a workspace is created so
-- the workspace always has somewhere to record usage.
CREATE OR REPLACE FUNCTION public.handle_new_workspace_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (workspace_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created_billing ON public.workspaces;
CREATE TRIGGER on_workspace_created_billing
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_billing();

-- Backfill: free subscriptions for any workspaces that exist already.
INSERT INTO public.subscriptions (workspace_id, plan, status)
SELECT id, 'free', 'active'
FROM public.workspaces
WHERE id NOT IN (SELECT workspace_id FROM public.subscriptions)
ON CONFLICT DO NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_metering  ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select_member
  ON public.subscriptions FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- Mutations happen via the service-role client only (Stripe webhook).
-- No INSERT/UPDATE/DELETE policies for end-users.

CREATE POLICY usage_select_member
  ON public.usage_metering FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- Inserts/updates go through increment_usage() with SECURITY DEFINER
-- so end-users never touch this table directly.
