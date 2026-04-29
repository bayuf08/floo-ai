-- ============================================================
-- Prune the dummy Voice/Format/Trend/Workflow system skills and
-- tighten the category CHECK constraint to only allow the rich
-- marketing + creator categories.
--
-- Phase 1 of the skill-library refactor seeded 8 Anthropic-grade
-- skills (7 marketing + 1 creator). The legacy 24 system rows
-- (Voice/Format/Trend/Workflow) were name-only stubs with NULL
-- instructions — they passed almost no useful context to the AI
-- when toggled. Bayu's 2026-04-29 directive: focus the library on
-- Marketing + Creator only, drop the unused categories entirely.
--
-- Effect of this migration:
--   1. DELETE all system rows (workspace_id IS NULL) where
--      category is voice/format/trend/workflow. The FK on
--      project_skills cascades, so any project that had toggled
--      one of these on automatically loses the toggle row.
--   2. Re-tighten skills_category_check to only allow
--      ('marketing', 'creator'). Custom workspace skills will
--      have to use one of the supported categories from now on.
--
-- Custom workspace skills (workspace_id IS NOT NULL) using the
-- legacy categories are NOT deleted — but the CHECK tightening
-- below would fail if any exist. The defensive UPDATE guard
-- below converts any such custom skills into 'marketing' so the
-- migration doesn't crash on a populated DB. If you want a
-- different bucket, change the UPDATE before applying.
-- ============================================================

-- 1. Drop system stubs.
DELETE FROM public.skills
 WHERE workspace_id IS NULL
   AND category IN ('voice', 'format', 'trend', 'workflow');

-- 2. Defensive remap of any surviving custom skills (preserves the
--    user's data instead of failing the constraint tightening).
UPDATE public.skills
   SET category = 'marketing'
 WHERE category IN ('voice', 'format', 'trend', 'workflow');

-- 3. Tighten the CHECK constraint.
ALTER TABLE public.skills
  DROP CONSTRAINT IF EXISTS skills_category_check;

ALTER TABLE public.skills
  ADD CONSTRAINT skills_category_check
  CHECK (category IN ('marketing', 'creator'));
