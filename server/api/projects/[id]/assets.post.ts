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
import { extractAndPersist, isExtractable } from '~/server/utils/asset-content'

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
      .select('id, name, size_bytes, category, extension, description, storage_path, uploaded_at')
      .single()

    if (error) {
      warnings.push(`DB insert for "${part.filename}" failed: ${error.message}`)
      continue
    }

    // Kick off content extraction for parseable docs (PDF/DOCX/TXT/MD).
    // Run inline so the AI prompt can use the text on the very next message.
    // Errors are stored as `error` status — they never break the upload.
    // The project_id threads through to embedAssetChunks so the chunks
    // can be inserted in the same flow.
    if (isExtractable(ext)) {
      try {
        await extractAndPersist(event, {
          id: data.id,
          storage_path: storagePath,
          extension: ext,
          name: part.filename,
          project_id: projectId,
        })
      } catch (e: any) {
        warnings.push(`Content extraction for "${part.filename}" failed: ${e?.message ?? 'unknown'}`)
      }
    }

    inserted.push({ ...data, preview_url })
  }

  return { assets: inserted, warnings }
})
