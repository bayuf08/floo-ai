import type { Platform } from '~/types/project'

export type WorkspaceMembershipRole = 'owner' | 'editor' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  role: string
  avatarUrl?: string
  initials: string
}

export interface Workspace {
  id: string
  name: string
  type: string
  color: string
  description?: string
  defaultPlatform?: Platform
  membershipRole?: WorkspaceMembershipRole
}

export interface WorkspaceMember {
  id: string
  name: string
  email: string
  initials: string
  avatarUrl?: string
  role: WorkspaceMembershipRole
}
