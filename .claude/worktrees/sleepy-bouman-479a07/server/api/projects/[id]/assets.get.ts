/** GET /api/projects/:id/assets — list brand assets, generate signed URLs for images. Member-only. */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertProjectMember } from '~/server/utils/authz'
import { signedUrl } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertProjectMember(supabase, id, u.id)
  const config = useRuntimeConfig(event)

  const { data, error } = await supabase
    .from('brand_assets')
    .select(
      'id, name, size_bytes, category, extension, description, storage_path, uploaded_at, extraction_status, extraction_error, extracted_at',
    )
    .eq('project_id', id)
    .order('uploaded_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  // Refresh signed preview URLs for image assets (1hr expiry).
  const withPreviews = await Promise.all(
    (data ?? []).map(async (a) => {
      let preview_url: string | null = null
      if (a.category === 'image') {
        preview_url = await signedUrl(event, config.storageBucketAssets, a.storage_path)
      }
      return { ...a, preview_url }
    })
  )

  return withPreviews
})
