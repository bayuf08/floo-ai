-- ============================================================
-- Skills: relax category CHECK to add `marketing` + `creator`.
--
-- Rationale: Phase 1 of the skill-library refactor introduces
-- two new system categories alongside the existing four
-- (voice, format, trend, workflow):
--   - `marketing` — Anthropic-grade job skills like brand-review,
--     campaign-plan, draft-content, email-sequence, seo-audit.
--   - `creator`   — meta-skills like skill-creator that help
--     users author their own custom skills.
--
-- This migration only relaxes the CHECK constraint. The actual
-- seed rows arrive in 20260429000001_seed_marketing_creator_skills.
-- ============================================================

ALTER TABLE public.skills
  DROP CONSTRAINT IF EXISTS skills_category_check;

ALTER TABLE public.skills
  ADD CONSTRAINT skills_category_check
  CHECK (category IN ('voice', 'format', 'trend', 'workflow', 'marketing', 'creator'));
