-- Backfill stuck brand_assets rows produced by the upload-route bug
-- where non-extractable files (PNG/JPG/MP4/PPTX/etc.) were inserted
-- with the DB-default extraction_status='pending' and never updated,
-- because server/api/projects/[id]/assets.post.ts gated the call to
-- extractAndPersist() behind isExtractable() with no else branch.
--
-- The code fix lives in the same release as this migration; this
-- migration clears the in-flight rows so the Knowledge tab stops
-- showing "Extracting text…" for files that were uploaded before the
-- code fix shipped.
--
-- Splits stuck rows into two buckets:
--   1. Non-extractable extensions  →  status = 'skipped'
--      These are images/videos/etc. The intended terminal state is
--      'skipped' ("Visual asset" pill), which is what extractAndPersist()
--      writes for them today. We mirror that here for already-inserted
--      rows.
--   2. Extractable extensions, uploaded > 5 minutes ago  →  status = 'error'
--      A document that's been pending for that long means the parser
--      crashed mid-run (or the request died before updateExtractionResult
--      fired). Surfacing as 'error' lets the user click Retry, which
--      reruns extractAndPersist via /extract.post.ts.

UPDATE public.brand_assets
SET extraction_status = 'skipped',
    extracted_at = COALESCE(extracted_at, now())
WHERE extraction_status = 'pending'
  AND lower(extension) NOT IN ('txt','md','csv','tsv','pdf','docx');

UPDATE public.brand_assets
SET extraction_status = 'error',
    extraction_error = COALESCE(
      extraction_error,
      'Extraction did not complete; please retry.'
    ),
    extracted_at = COALESCE(extracted_at, now())
WHERE extraction_status = 'pending'
  AND lower(extension) IN ('txt','md','csv','tsv','pdf','docx')
  AND uploaded_at < now() - interval '5 minutes';
