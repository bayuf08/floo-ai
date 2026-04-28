/**
 * POST /api/projects/:id/assets/:assetId/extract
 * Manually re-run text extraction on a brand asset. Editor+ only.
 *
 * Used by the "Retry" button on the asset card when extraction_status='error'.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import { extractAndPersist } from '~/server/utils/asset-content'
import { log } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const assetId = getRouterParam(event, 'assetId')
  if (!projectId || !assetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing params' })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  log.info('[extraction]', 'retry-requested', { projectId, assetId, userId: u.id })

  const result = await extractAndPersist(event, projectId, assetId)

  return {
    extraction_status: result.status,
    extraction_error: result.error ?? null,
    truncated: !!result.truncated,
  }
})
