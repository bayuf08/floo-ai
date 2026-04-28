-- ============================================================
-- Skills table enhancements
-- 1. Add updated_at column + auto-update trigger.
-- 2. Change examples from TEXT to TEXT[] so the frontend
--    string[] type maps cleanly without JSON serialization.
--    Safe: all existing values are NULL.
-- ============================================================

-- ─── 1. updated_at ───────────────────────────────────────────
ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill existing rows (uses created_at as baseline).
UPDATE public.skills
   SET updated_at = created_at
 WHERE updated_at = now() AND created_at < now();

CREATE TRIGGER trg_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. examples TEXT → TEXT[] ───────────────────────────────
ALTER TABLE public.skills
  ALTER COLUMN examples TYPE TEXT[]
  USING CASE
    WHEN examples IS NULL THEN NULL::TEXT[]
    ELSE ARRAY[examples]
  END;
