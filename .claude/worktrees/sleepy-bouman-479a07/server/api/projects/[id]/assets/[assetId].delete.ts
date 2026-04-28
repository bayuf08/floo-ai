/**
 * DELETE /api/projects/:id/assets/:assetId
 * Removes both the brand_assets row and the underlying storage object. Editor+ only.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { deleteFromStorage } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const assetId = getRouterParam(event, 'assetId')
  if (!projectId || !assetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing params' })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)
  const config = useRuntimeConfig(event)

  // Fetch storage_path first so we can clean up the file after the row is gone.
  const { data: row, error: fetchErr } = await supabase
    .from('brand_assets')
    .select('storage_path')
    .eq('id', assetId)
    .eq('project_id', projectId)
    .single()

  if (fetchErr || !row) {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  }

  const { error: delErr } = await supabase
    .from('brand_assets')
    .delete()
    .eq('id', assetId)
    .eq('project_id', projectId)

  if (delErr) throw createError({ statusCode: 500, statusMessage: delErr.message })

  await deleteFromStorage(event, config.storageBucketAssets, row.storage_path)
  return { ok: true }
})
