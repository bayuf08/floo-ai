/**
 * POST /api/auth/avatar
 * Upload a new avatar image. The previous custom upload (if any) is deleted.
 *
 * Body: multipart/form-data with one `file` field (image/* only, ≤ MAX_AVATAR_SIZE_MB)
 *
 * Returns the updated profile row with the fresh public CDN URL.
 */
import { readMultipartFormData } from 'h3'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { uploadToStorage, deleteFromStorage, randomId, publicAvatarUrl } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const u = requireUser(event)

  const config = useRuntimeConfig(event)
  const maxBytes = (config.maxAvatarSizeMb || 5) * 1024 * 1024
  const bucket = config.storageBucketAvatars

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find((p) => p.name === 'file' && p.filename && p.data)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing `file` field' })

  if (!filePart.type?.startsWith('image/')) {
    throw createError({ statusCode: 400, statusMessage: 'Avatar must be an image (image/*)' })
  }
  if (filePart.data.byteLength > maxBytes) {
    throw createError({
      statusCode: 413,
      statusMessage: `Image is over the ${config.maxAvatarSizeMb}MB limit.`,
    })
  }

  const ext = (filePart.filename!.split('.').pop() ?? 'png').toLowerCase()
  const newPath = `${u.id}/${randomId()}.${ext}`

  // Pull the current avatar URL so we can delete the previous custom upload (if any).
  const supabase = serviceSupabase(event)
  const { data: prev } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', u.id)
    .single()

  await uploadToStorage(event, bucket, newPath, filePart.data, filePart.type)

  const cdnUrl = publicAvatarUrl(event, newPath)
  const { data: updated, error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: cdnUrl })
    .eq('id', u.id)
    .select('id, name, email, role, avatar_url, initials, updated_at')
    .single()

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  // Best-effort cleanup of the previous custom upload (Google profile URLs
  // start with https://lh3.googleusercontent.com — those aren't in our bucket).
  if (prev?.avatar_url && prev.avatar_url.includes(`/${bucket}/`)) {
    const idx = prev.avatar_url.indexOf(`/${bucket}/`)
    if (idx >= 0) {
      const oldPath = prev.avatar_url.slice(idx + bucket.length + 2) // +2 for the slashes
      await deleteFromStorage(event, bucket, oldPath)
    }
  }

  return updated
})
