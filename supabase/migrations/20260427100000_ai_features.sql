-- ============================================================
-- AI feature additions
-- 1. brand_assets: cache extracted plaintext so the AI prompt
--    can include the actual content of uploaded PDFs/DOCX/TXT,
--    not just the filename.
-- 2. output_cards: support image-generation outputs alongside
--    the existing text-list cards.
-- ============================================================

-- ─── 1. Brand asset content extraction ───────────────────────
ALTER TABLE public.brand_assets
  ADD COLUMN IF NOT EXISTS extracted_text     TEXT,
  ADD COLUMN IF NOT EXISTS extraction_status  TEXT
       DEFAULT 'pending'
       CHECK (extraction_status IN ('pending','done','skipped','error')),
  ADD COLUMN IF NOT EXISTS extraction_error   TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at       TIMESTAMPTZ;

-- Mark all pre-existing rows as 'pending' so the worker picks them up.
UPDATE public.brand_assets
   SET extraction_status = 'pending'
 WHERE extraction_status IS NULL;

-- ─── 2. Output card variants (text vs image) ────────────────
ALTER TABLE public.output_cards
  ADD COLUMN IF NOT EXISTS kind   TEXT
       DEFAULT 'text'
       CHECK (kind IN ('text','image')),
  -- For image cards: an array of { url, prompt, width, height } JSON objects.
  -- We keep `items` (text[]) populated with the prompts so the existing
  -- card UI keeps rendering something on older clients.
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_output_cards_kind
  ON public.output_cards(kind);

-- ─── 3. Saved outputs — mirror the new card variants ────────
ALTER TABLE public.saved_outputs
  ADD COLUMN IF NOT EXISTS kind   TEXT
       DEFAULT 'text'
       CHECK (kind IN ('text','image')),
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
