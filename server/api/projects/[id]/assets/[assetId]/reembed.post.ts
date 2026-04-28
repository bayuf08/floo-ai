/**
 * POST /api/projects/:id/assets/:assetId/reembed
 *
 * Re-runs the chunk + embed pipeline against a single asset's already-
 * extracted text. Doesn't re-download or re-parse the file — only the
 * embedding step. Useful for:
 *   - Backfilling assets uploaded before Phase 5.4 shipped (no chunks
 *     in brand_asset_chunks yet).
 *   - Rebuilding chunks after EMBEDDINGS_MODEL changes (which requires
 *     a migration to a new vector dim too — keep that in mind).
 *
 * Returns { chunkCount, tokensTotal } on success. Editor+ on the
 * project required.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { embedAssetChunks } from '~/server/utils/asset-content'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const assetId = getRouterParam(event, 'assetId')
  if (!projectId || !assetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const { data: asset, error } = await supabase
    .from('brand_assets')
    .select('id, project_id, extracted_text, extraction_status')
    .eq('id', assetId)
    .single()

  if (error || !asset || asset.project_id !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  }
  if (asset.extraction_status !== 'done' || !asset.extracted_text) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Asset has no extracted text yet. POST /extract first, or re-upload the file.',
    })
  }

  // Surface embeddings provider failures to the caller (they're
  // explicitly asking for a re-embed; silent degradation would hide
  // a config issue).
  const result = await embedAssetChunks(event, {
    assetId: asset.id,
    projectId: asset.project_id,
    text: asset.extracted_text,
  })

  return result
})
