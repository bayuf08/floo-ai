-- ============================================================
-- Storage bucket RLS policies
-- Buckets must be created via the Supabase dashboard first:
--   brand-assets        (private)
--   avatars             (public)
--   message-attachments (private)
--
-- Apply after the buckets exist. If you apply this before bucket
-- creation, the policies still install but won't apply to anything yet.
-- ============================================================

-- ─── brand-assets bucket ─────────────────────────────────────
-- Layout: brand-assets/{projectId}/{uuid}.{ext}
-- The first path segment is the project_id we use for membership check.

CREATE POLICY "brand_assets_select_member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'brand-assets'
    AND public.is_project_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "brand_assets_insert_editor"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND public.is_project_editor((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "brand_assets_delete_editor"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'brand-assets'
    AND public.is_project_editor((storage.foldername(name))[1]::uuid)
  );

-- ─── message-attachments bucket ──────────────────────────────
-- Layout: message-attachments/{projectId}/{messageId}/{uuid}.{ext}
-- First path segment is the project_id.

CREATE POLICY "message_attachments_select_member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'message-attachments'
    AND public.is_project_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "message_attachments_insert_editor"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND public.is_project_editor((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "message_attachments_delete_editor"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'message-attachments'
    AND public.is_project_editor((storage.foldername(name))[1]::uuid)
  );

-- ─── avatars bucket ──────────────────────────────────────────
-- Layout: avatars/{userId}/{uuid}.{ext}
-- Bucket itself should be marked PUBLIC in the dashboard so reads
-- are served via the CDN URL — the SELECT policy below is for the
-- authenticated API surface, not the public CDN path.

CREATE POLICY "avatars_select_anyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_self"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1]::uuid = auth.uid()
  );

CREATE POLICY "avatars_update_self"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1]::uuid = auth.uid()
  );

CREATE POLICY "avatars_delete_self"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1]::uuid = auth.uid()
  );
