-- ============================================================
-- Selective RAG over brand-knowledge files
--
-- Phase 5.4 of CONTEXT-AND-INTENT-PLAN.md.
--
-- Replaces the "inline every asset's extracted_text up to 30k chars"
-- approach with vector retrieval: chunk extracted_text into ~512-token
-- windows, embed each chunk with text-embedding-3-small, store in
-- brand_asset_chunks, and at query time fetch only the top-K most
-- relevant chunks for the user's message.
--
-- Trade-offs / decisions:
--   * Vector dim is fixed at 1536 to match text-embedding-3-small.
--     Switching to a different model means re-embedding all rows; we
--     accept that cost in exchange for using the right index size.
--   * No RLS — chunks are only ever read/written via the service-role
--     client from server routes. Authz is enforced upstream by
--     assertProjectMember() in the API handlers, mirroring how
--     brand_assets is accessed in the rest of the codebase.
--   * IVFFlat index uses vector_cosine_ops because OpenAI's embeddings
--     are unit-normalised, so cosine ≈ inner-product but cosine is
--     more interpretable when we log similarity scores.
--
-- Schema-qualification note:
--   Supabase enables pgvector in the `extensions` schema by default,
--   which is NOT in the session's default search_path. So every
--   reference to the `vector` type, `vector_cosine_ops` operator
--   class, and the `<=>` distance operator must either be qualified
--   (`extensions.vector`) or executed with `extensions` on the
--   search_path. We use `SET LOCAL search_path` for the migration
--   itself, and `SET search_path` on the SQL function so call-time
--   resolution doesn't depend on the caller.
-- ============================================================

-- ─── 1. Enable pgvector extension ───────────────────────────
-- No-op when it's already enabled via the Supabase dashboard. The
-- IF NOT EXISTS keeps re-running the migration safe.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Make `vector`, `vector_cosine_ops`, and the `<=>` operator resolvable
-- without qualification for the rest of this migration. LOCAL scopes
-- this to the current transaction so it doesn't leak into the
-- connection's session afterwards.
SET LOCAL search_path = public, extensions;

-- ─── 2. brand_asset_chunks table ────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_asset_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES public.brand_assets(id) ON DELETE CASCADE,
  -- Denormalised so query-time filter ("chunks for this project") doesn't
  -- need a join. CASCADE on project delete + the FK on asset_id keep this
  -- consistent.
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Ordinal within the asset. Useful for stitching chunks back into
  -- contiguous spans when the same chunk-set wins multiple times.
  chunk_index   INT  NOT NULL,
  -- Original chunk text (post-normalisation, pre-embedding). We keep
  -- this verbatim so the prompt can quote it without round-tripping
  -- through the original file.
  text          TEXT NOT NULL,
  -- Approximate token count (chars / 4). Diagnostic; not used for index.
  tokens        INT,
  -- Fully qualified — the `extensions` schema is on search_path for
  -- the migration thanks to SET LOCAL above, but qualifying makes the
  -- column type unambiguous in pg_dump output and code review.
  embedding     extensions.vector(1536) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Re-embedding an asset replaces its chunks atomically, so this prevents
-- any race where two embed calls leave duplicate (asset_id, chunk_index)
-- rows behind.
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_asset_chunks_asset_chunk
  ON public.brand_asset_chunks (asset_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_brand_asset_chunks_project
  ON public.brand_asset_chunks (project_id);

-- IVFFlat for cosine-distance similarity. `lists = 100` is a sane
-- default for the expected scale (low thousands of chunks per project,
-- low tens of thousands per workspace). pgvector docs recommend
-- sqrt(N) lists; tune later if a workspace pushes 100k+ chunks.
CREATE INDEX IF NOT EXISTS idx_brand_asset_chunks_embedding
  ON public.brand_asset_chunks
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- ─── 3. RPC: top-K similarity for a project ─────────────────
-- Called by server/utils/asset-retrieval.ts at query time. Returns the
-- chunks ordered by cosine distance ascending (most similar first),
-- enriched with the parent asset's name + category so the prompt block
-- can label each excerpt without a second round-trip.
--
-- The function-level SET search_path makes the `<=>` operator and any
-- internal vector references resolvable at call time, even when the
-- caller's session doesn't have `extensions` on its search_path.
CREATE OR REPLACE FUNCTION public.match_project_chunks(
  query_embedding extensions.vector(1536),
  p_project_id    UUID,
  match_count     INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id     UUID,
  asset_id     UUID,
  asset_name   TEXT,
  asset_category TEXT,
  chunk_index  INT,
  text         TEXT,
  similarity   REAL
)
LANGUAGE SQL STABLE
SET search_path = public, extensions
AS $$
  SELECT
    c.id           AS chunk_id,
    c.asset_id     AS asset_id,
    a.name         AS asset_name,
    a.category     AS asset_category,
    c.chunk_index  AS chunk_index,
    c.text         AS text,
    -- Convert cosine distance (0 = identical) into a 0..1 similarity
    -- score so callers reading the row don't need to remember the
    -- inversion. `<=>` is pgvector's cosine-distance operator.
    (1 - (c.embedding <=> query_embedding))::REAL AS similarity
  FROM public.brand_asset_chunks c
  JOIN public.brand_assets a ON a.id = c.asset_id
  WHERE c.project_id = p_project_id
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Allow the service-role client to call the RPC. (RLS isn't enabled on
-- the table; this grant is belt-and-suspenders so the function works
-- even if a future migration turns RLS on.)
GRANT EXECUTE ON FUNCTION public.match_project_chunks(extensions.vector, UUID, INT) TO service_role;
