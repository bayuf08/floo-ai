/**
 * POST /api/projects/:id/assets/:assetId/extract
 * Manually (re)run text extraction on a brand asset. Useful for assets
 * uploaded before the extraction feature shipped, or to retry after a
 * transient parsing error. Editor+ only.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { extractAndPersist, isExtractable } from '~/server/utils/asset-content'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const assetId = getRouterParam(event, 'assetId')
  if (!projectId || !assetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const { data: asset } = await supabase
    .from('brand_assets')
    .select('id, name, extension, storage_path, project_id')
    .eq('id', assetId)
    .single()

  if (!asset || asset.project_id !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  }

  if (!isExtractable(asset.extension)) {
    return { status: 'skipped', reason: `${asset.extension} is not a supported text format` }
  }

  const result = await extractAndPersist(event, asset)
  return result
})
