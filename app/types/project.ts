export type Platform = 'tiktok' | 'instagram' | 'twitter' | 'youtube' | 'linkedin' | 'threads'

export type AssetCategory =
  | 'image'        // .jpg .jpeg .png .webp .gif .svg
  | 'video'        // .mp4 .mov .avi .webm
  | 'document'     // .pdf .doc .docx .txt .md
  | 'presentation' // .ppt .pptx .key
  | 'spreadsheet'  // .xls .xlsx .csv .numbers
  | 'other'

export interface BrandAsset {
  id: string
  name: string
  size: string
  sizeBytes: number
  category: AssetCategory
  extension: string
  uploadedAt: Date
  description: string
  previewUrl?: string
  /**
   * Backend extraction state for parseable docs (PDF/DOCX/TXT/MD).
   * - 'pending'  → upload landed, extractor not finished yet (rare, but possible)
   * - 'done'     → text extracted; AI has full content
   * - 'error'    → parser crashed; AI sees a placeholder, user should re-upload
   * - 'skipped'  → not a parseable format (image/video/etc)
   * Undefined means we don't know yet (optimistic local-only assets).
   */
  extractionStatus?: 'pending' | 'done' | 'error' | 'skipped'
}

/** Saved AI output that the user explicitly bookmarked. */
export interface SavedOutput {
  id: string
  label: string
  sub?: string
  accent?: string
  items: string[]
  savedAt: Date
}

export interface ProjectMember {
  id: string
  name: string
  email: string
  initials: string
  /** CSS color for the avatar gradient */
  avatarColor: string
  role: 'owner' | 'editor' | 'viewer'
  joinedAt: Date
}

export interface Project {
  id: string
  name: string
  /** References Workspace.id — determines which workspace this project appears under. */
  workspaceId: string
  platform: Platform
  color: string
  updatedAt: Date
  /** When true, the project sorts to the top of the sidebar list. */
  isPinned?: boolean
  contextRules?: ProjectContext
  /** Collaborators on this project. Always includes the owner as first member. */
  members?: ProjectMember[]
}

export interface ProjectContext {
  brandVoice: string
  doGuidelines: string[]
  dontGuidelines: string[]
  skills: Skill[]
  platformProfile?: PlatformProfile
  /** Permanent project-level reference files. */
  brandAssets?: BrandAsset[]
  /** Project-level hashtag set used as a reference for content generation. */
  hashtags?: string[]
  /** AI outputs the user explicitly saved. */
  savedOutputs?: SavedOutput[]
}

export interface Skill {
  id: string
  name: string
  active: boolean
}

export interface PlatformProfile {
  platform: Platform
  handle: string
  followers?: number
  bio?: string
}

/**
 * Map a filename to an AssetCategory used for icon + color coding.
 */
export function getAssetCategory(filename: string): AssetCategory {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'video'
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return 'document'
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'presentation'
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'spreadsheet'
  return 'other'
}

export const PLATFORM_CONFIG: Record<Platform, { label: string; color: string; bgColor: string }> = {
  tiktok: { label: 'Tiktok', color: '#FFFFFF', bgColor: '#E44D6A' },
  instagram: { label: 'Instagram', color: '#FFFFFF', bgColor: '#C13584' },
  twitter: { label: 'X / Twitter', color: '#FFFFFF', bgColor: '#1B1726' },
  youtube: { label: 'YouTube', color: '#FFFFFF', bgColor: '#FF0000' },
  linkedin: { label: 'LinkedIn', color: '#FFFFFF', bgColor: '#0077B5' },
  threads: { label: 'Threads', color: '#FFFFFF', bgColor: '#000000' },
}
