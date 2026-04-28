-- Add text-extraction columns to brand_assets so Floo can read uploaded
-- documents (PDF/DOCX/TXT/MD) instead of only seeing the file name.
ALTER TABLE public.brand_assets
  ADD COLUMN IF NOT EXISTS extracted_text    TEXT,
  ADD COLUMN IF NOT EXISTS extraction_status TEXT
    DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','done','skipped','error')),
  ADD COLUMN IF NOT EXISTS extraction_error  TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_brand_assets_extraction_status
  ON public.brand_assets(project_id, extraction_status);
