/**
 * Storage helpers — wraps Supabase Storage client. Service-role uploads,
 * signed-URL generation, and category derivation.
 */
import type { H3Event } from 'h3'
import { serviceSupabase } from './supabase'

export type AssetCategory = 'image' | 'video' | 'document' | 'presentation' | 'spreadsheet' | 'other'

const EXT_BY_CATEGORY: Record<AssetCategory, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'],
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv'],
  document: ['pdf', 'doc', 'docx', 'txt', 'md'],
  presentation: ['ppt', 'pptx', 'key'],
  spreadsheet: ['xls', 'xlsx', 'csv', 'numbers'],
  other: [],
}

export function getAssetCategory(filename: string): AssetCategory {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  for (const [cat, exts] of Object.entries(EXT_BY_CATEGORY) as [AssetCategory, string[]][]) {
    if (exts.includes(ext)) return cat
  }
  return 'other'
}

/** Random 16-hex string for unique filenames. */
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Upload a file buffer to Supabase Storage.
 * Returns the storage path.
 */
export async function uploadToStorage(
  event: H3Event,
  bucket: string,
  path: string,
  body: Uint8Array | Buffer,
  contentType: string
): Promise<string> {
  const admin = serviceSupabase(event)
  const { error } = await admin.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,
  })
  if (error) throw error
  return path
}

/** Generate a signed URL with 1hr expiry for a private-bucket object. */
export async function signedUrl(
  event: H3Event,
  bucket: string,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const admin = serviceSupabase(event)
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
  if (error || !data) return null
  return data.signedUrl
}

/** Public CDN URL for the avatars bucket. */
export function publicAvatarUrl(event: H3Event, path: string): string {
  const config = useRuntimeConfig(event)
  const base = config.public.storageCdnUrl
  return `${base}/${config.storageBucketAvatars}/${path}`
}

export async function deleteFromStorage(event: H3Event, bucket: string, path: string) {
  const admin = serviceSupabase(event)
  const { error } = await admin.storage.from(bucket).remove([path])
  if (error) console.warn(`[storage] delete failed for ${bucket}/${path}:`, error.message)
}
