-- ============================================================
-- Floo·Content — Wipe app data (keep auth + system seed data)
-- ============================================================
--
-- Run this in Supabase Dashboard → SQL Editor for project
-- xxumxffdukpshebypzur (uses postgres superuser context, so it
-- bypasses RLS automatically).
--
-- WHAT THIS DROPS
--   • all workspaces (cascades to projects, members, contexts,
--     brand_assets, project_skills, chat_messages, output_cards,
--     saved_outputs, invitations, subscriptions, usage_metering,
--     custom skills, custom rules_templates)
--
-- WHAT THIS KEEPS
--   • profiles  → your user row stays, so you stay signed in
--   • skills    → the 24 system skills (is_custom = false)
--   • rules_templates → system templates (is_system = true)
--
-- AFTER RUNNING
--   1. The verification SELECT at the bottom will print row counts.
--      You should see: workspaces=0, projects=0, chat_messages=0,
--      profiles=1, skills_total=24, skills_system=24.
--   2. Reload https://floo-ai.vercel.app/projects in your browser.
--      You'll be logged in but with no workspace — the app should
--      show empty state / onboarding to create your first workspace.
--   3. If the UI still shows old data, hard-refresh (Cmd+Shift+R)
--      to dump client-side Pinia state.
--
-- STORAGE NOTE
--   This wipes Postgres rows. Files already uploaded to the three
--   Storage buckets (brand-assets, avatars, message-attachments)
--   are still on disk but are now orphaned (no DB row points at
--   them). To remove them too, run the optional storage cleanup at
--   the bottom of this file, or delete via the Storage UI.
--
-- This script is idempotent — safe to re-run any time you want
-- a fresh demo state.
-- ============================================================

BEGIN;

-- 1. The big sweep — TRUNCATE workspaces with CASCADE deletes
--    every dependent row in 13 tables in one shot.
TRUNCATE TABLE public.workspaces RESTART IDENTITY CASCADE;

-- 2. Defensive cleanup — any custom skill or custom rules_template
--    that wasn't tied to a workspace (shouldn't exist, but covers
--    seed-script bugs and manual inserts).
DELETE FROM public.skills          WHERE is_custom = true;
DELETE FROM public.rules_templates WHERE is_system = false;

-- 3. Verification — should print: profiles=1, workspaces=0,
--    projects=0, chat_messages=0, skills_total=24,
--    skills_system=24.
SELECT
  (SELECT count(*) FROM public.profiles)                                   AS profiles,
  (SELECT count(*) FROM public.workspaces)                                 AS workspaces,
  (SELECT count(*) FROM public.workspace_members)                          AS workspace_members,
  (SELECT count(*) FROM public.projects)                                   AS projects,
  (SELECT count(*) FROM public.project_contexts)                           AS project_contexts,
  (SELECT count(*) FROM public.project_members)                            AS project_members,
  (SELECT count(*) FROM public.brand_assets)                               AS brand_assets,
  (SELECT count(*) FROM public.chat_messages)                              AS chat_messages,
  (SELECT count(*) FROM public.output_cards)                               AS output_cards,
  (SELECT count(*) FROM public.saved_outputs)                              AS saved_outputs,
  (SELECT count(*) FROM public.invitations)                                AS invitations,
  (SELECT count(*) FROM public.subscriptions)                              AS subscriptions,
  (SELECT count(*) FROM public.usage_metering)                             AS usage_metering,
  (SELECT count(*) FROM public.skills)                                     AS skills_total,
  (SELECT count(*) FROM public.skills WHERE is_custom = false)             AS skills_system,
  (SELECT count(*) FROM public.skills WHERE is_custom = true)              AS skills_custom,
  (SELECT count(*) FROM public.rules_templates WHERE is_system = true)     AS rules_system,
  (SELECT count(*) FROM public.rules_templates WHERE is_system = false)    AS rules_custom;

COMMIT;

-- ============================================================
-- OPTIONAL — also wipe Storage objects (orphaned files)
-- ============================================================
-- Uncomment to remove every file from the three buckets.
-- This deletes Storage metadata; the underlying S3 objects are
-- garbage-collected by Supabase shortly after.
--
-- DELETE FROM storage.objects
--  WHERE bucket_id IN ('brand-assets', 'avatars', 'message-attachments');
--
-- (Skipping avatar deletion is fine — Google profile pictures are
-- linked by external URL in profiles.avatar_url, not stored in the
-- avatars bucket unless the user manually uploaded a custom one.)
