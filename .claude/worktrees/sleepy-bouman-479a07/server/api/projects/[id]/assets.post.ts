/**
 * POST /api/projects/:id/assets
 * Upload one or more files to the brand-assets bucket and insert
 * matching rows into the brand_assets table. Editor+ only.
 *
 * Expects multipart/form-data with one or more `file` fields.
 */
import { readMultipartFormData } from 'h3'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectEditor } from '~/server/utils/authz'
import {
  uploadToStorage,
  signedUrl,
  randomId,
  getAssetCategory,
} from '~/server/utils/storage'
import { extractAndPersist } from '~/server/utils/asset-content'
import { log } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectEditor(supabase, projectId, u.id)

  const config = useRuntimeConfig(event)
  const maxBytes = (config.maxBrandAssetSizeMb || 50) * 1024 * 1024
  const bucket = config.storageBucketAssets

  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No files in request' })
  }

  const inserted: any[] = []
  const warnings: string[] = []

  for (const part of parts) {
    if (part.name !== 'file' || !part.filename || !part.data) continue

    if (part.data.byteLength > maxBytes) {
      warnings.push(
        `"${part.filename}" is ${(part.data.byteLength / 1024 / 1024).toFixed(1)}MB — over the ${config.maxBrandAssetSizeMb}MB limit. Skipped.`
      )
      continue
    }

    const ext = (part.filename.split('.').pop() ?? 'bin').toLowerCase()
    const category = getAssetCategory(part.filename)
    const storagePath = `${projectId}/${randomId()}.${ext}`
    const contentType = part.type || 'application/octet-stream'

    try {
      await uploadToStorage(event, bucket, storagePath, part.data, contentType)
    } catch (e: any) {
      warnings.push(`Upload of "${part.filename}" failed: ${e?.message ?? 'unknown'}`)
      continue
    }

    let preview_url: string | null = null
    if (category === 'image') {
      preview_url = await signedUrl(event, bucket, storagePath)
    }

    const { data, error } = await supabase
      .from('brand_assets')
      .insert({
        project_id: projectId,
        name: part.filename,
        size_bytes: part.data.byteLength,
        category,
        extension: ext,
        description: '',
        storage_path: storagePath,
        preview_url: null, // we generate signed URLs on read; only persist if you cache
        uploaded_by: u.id,
      })
      .select(
        'id, name, size_bytes, category, extension, description, storage_path, uploaded_at, extraction_status, extraction_error, extracted_at',
      )
      .single()

    if (error) {
      warnings.push(`DB insert for "${part.filename}" failed: ${error.message}`)
      continue
    }

    // Run text extraction inline. We don't block the upload on its result —
    // any failure is captured into extraction_status='error' and surfaced via
    // the asset card's "COULDN'T READ" pill so the user can hit Retry.
    let extractionStatus = data.extraction_status as string | null
    let extractionError = data.extraction_error as string | null
    let extractedAt = data.extracted_at as string | null
    try {
      const result = await extractAndPersist(event, projectId, data.id)
      extractionStatus = result.status
      extractionError = result.error ?? null
      extractedAt = result.status === 'done' ? new Date().toISOString() : null
    } catch (e: any) {
      log.error('[extraction]', 'inline-extract-threw', {
        assetId: data.id,
        message: e?.message,
        stack: e?.stack,
      })
      extractionStatus = 'error'
      extractionError = `Inline extraction crashed: ${e?.message ?? 'unknown'}`
    }

    inserted.push({
      ...data,
      preview_url,
      extraction_status: extractionStatus,
      extraction_error: extractionError,
      extracted_at: extractedAt,
    })
  }

  return { assets: inserted, warnings }
})
