-- ============================================================
-- Storage buckets — provision via SQL so dev / staging / prod all
-- end up with the same configuration. The original Phase 1 plan
-- left bucket creation as a manual dashboard click (see the
-- header comment of 20240101000003_storage_policies.sql), but
-- that's bitten us in fresh environments — the upload handler
-- in `assets.post.ts` returns "Bucket not found" until someone
-- remembers to create it.
--
-- This migration creates the three buckets the app needs:
--
--   * brand-assets         — private. Per-project knowledge files
--                            (PDFs, DOCX, images, etc). Reads gated
--                            via signed URLs from the API.
--   * avatars              — public. Per-user profile images.
--                            Served directly via the public CDN URL.
--   * message-attachments  — private. Per-message file uploads
--                            (drag-drop into the composer, etc).
--
-- Idempotent — re-runs cleanly because of ON CONFLICT DO NOTHING.
-- The RLS policies in 20240101000003_storage_policies.sql attach
-- to these buckets by id, so the order of those two migrations
-- relative to each other doesn't matter for correctness.
--
-- Size limits track the env-var defaults in nuxt.config.ts:
--   maxBrandAssetSizeMb=50, maxAvatarSizeMb=5, maxAttachmentSizeMb=25
-- Bumping those env vars later is fine — Storage compares against
-- this DB value, but the API route's `maxBytes` check fires first.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  -- brand-assets: 50 MB. No MIME allow-list; the API route
  -- whitelists by extension on the way in instead, which is more
  -- forgiving when browsers send weird content-types.
  ('brand-assets', 'brand-assets', false, 52428800, NULL),

  -- avatars: 5 MB, image-only. Public so the frontend can <img src>
  -- direct from the CDN URL without round-tripping through a signed-
  -- URL endpoint.
  ('avatars', 'avatars', true, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),

  -- message-attachments: 25 MB. Private; signed URLs for download.
  ('message-attachments', 'message-attachments', false, 26214400, NULL)
ON CONFLICT (id) DO NOTHING;
