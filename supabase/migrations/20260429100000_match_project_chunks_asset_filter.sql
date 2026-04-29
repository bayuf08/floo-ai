-- ============================================================
-- match_project_chunks: add optional asset-id filter
--
-- Strict-scope @-mention work (D2). When the user explicitly tags one
-- or more knowledge files in their message, the message API needs to
-- restrict RAG retrieval to those files only — otherwise the prompt's
-- "Brand knowledge files" block (which we filter to the same ids in
-- TS) and the RAG chunks block would reference different files.
--
-- Postgres CREATE OR REPLACE FUNCTION cannot change a function's
-- parameter list, so we drop the existing function before recreating
-- it with the new optional parameter at the end.
--
-- p_asset_ids = NULL  → no filter (today's behavior)
-- p_asset_ids non-empty → c.asset_id = ANY(p_asset_ids)
--
-- An empty array is treated like NULL because `ANY('{}')` matches
-- nothing — the explicit IS NULL check makes that branch readable.
-- ============================================================

SET LOCAL search_path = public, extensions;

DROP FUNCTION IF EXISTS public.match_project_chunks(extensions.vector, UUID, INT);

CREATE OR REPLACE FUNCTION public.match_project_chunks(
  query_embedding extensions.vector(1536),
  p_project_id    UUID,
  match_count     INT      DEFAULT 5,
  p_asset_ids     UUID[]   DEFAULT NULL
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
    (1 - (c.embedding <=> query_embedding))::REAL AS similarity
  FROM public.brand_asset_chunks c
  JOIN public.brand_assets a ON a.id = c.asset_id
  WHERE c.project_id = p_project_id
    AND (p_asset_ids IS NULL OR c.asset_id = ANY(p_asset_ids))
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_project_chunks(extensions.vector, UUID, INT, UUID[]) TO service_role;
