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
}
