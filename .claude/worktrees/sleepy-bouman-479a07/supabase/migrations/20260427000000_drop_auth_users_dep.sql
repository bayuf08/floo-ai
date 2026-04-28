-- ============================================================
-- Drop the auth.users dependency.
--
-- Authentication moves out of Supabase entirely — Nuxt talks to
-- Google directly via nuxt-auth-utils, mints its own session cookie,
-- and the Nuxt server uses the service-role Supabase client to read
-- and write data. Authorization moves to the application layer
-- (see server/utils/authz.ts).
--
-- This migration:
--   1. Adds google_sub + google_refresh_token to profiles.
--   2. Frees profiles.id from the FK to auth.users(id) and gives it
--      its own UUID default.
--   3. Drops the handle_new_user trigger that fired on auth.users
--      inserts (we now insert profiles ourselves from the server).
--   4. Drops every RLS policy + helper function that referenced
--      auth.uid() — they would silently match zero rows under a
--      service-role connection.
--
-- Safe to apply on a database with existing rows: the FK drop and
-- column adds are non-destructive. Existing profiles keep their UUIDs;
-- the next sign-in for each user backfills google_sub via the upsert
-- in server/api/auth/callback.get.ts.
-- ============================================================

-- ─── 1. New identity columns on profiles ─────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_google_sub
  ON public.profiles(google_sub)
  WHERE google_sub IS NOT NULL;

-- ─── 2. Free profiles.id from auth.users ─────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ─── 3. Drop the on-auth-user-created trigger + function ────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ─── 4. Drop every public-schema RLS policy ─────────────────
-- These all reference auth.uid() (directly or via the helper functions
-- below). Under a service-role connection they would no-op, but it's
-- cleaner to remove them so the intent of the schema matches reality.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END $$;

-- ─── 5. Drop the storage policies that referenced auth.uid() ─
-- Service-role uploads bypass storage RLS too, so these policies
-- weren't doing anything useful for our flow. Drop them for hygiene.
DROP POLICY IF EXISTS "brand_assets_select_member"          ON storage.objects;
DROP POLICY IF EXISTS "brand_assets_insert_editor"          ON storage.objects;
DROP POLICY IF EXISTS "brand_assets_delete_editor"          ON storage.objects;
DROP POLICY IF EXISTS "message_attachments_select_member"   ON storage.objects;
DROP POLICY IF EXISTS "message_attachments_insert_editor"   ON storage.objects;
DROP POLICY IF EXISTS "message_attachments_delete_editor"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_select_anyone"               ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_self"                 ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_self"                 ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_self"                 ON storage.objects;

-- ─── 6. Drop the now-orphaned RLS helper functions ──────────
DROP FUNCTION IF EXISTS public.is_workspace_member(UUID);
DROP FUNCTION IF EXISTS public.is_workspace_owner(UUID);
DROP FUNCTION IF EXISTS public.is_project_member(UUID);
DROP FUNCTION IF EXISTS public.is_project_editor(UUID);

-- ─── 7. Disable RLS on every public table ───────────────────
-- With no policies, RLS-enabled tables block ALL non-service-role
-- access. Service role bypasses RLS so our app keeps working, but
-- disabling the flag makes the intent explicit (and lets you query
-- via the Supabase dashboard SQL editor without surprise).
ALTER TABLE public.profiles          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contexts  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_assets      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_skills    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.output_cards      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_outputs     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules_templates   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_metering    DISABLE ROW LEVEL SECURITY;

-- ─── 8. Lock down the anon + authenticated roles ────────────
-- We never use them anymore — the only DB access is via the service
-- role from the Nuxt server. Revoking blocks any accidental
-- direct-from-browser query if anon key leaked.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated;
