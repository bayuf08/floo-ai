/**
 * GET /api/workspaces/:id/members
 * Return the full member list for a workspace.
 * Any workspace member may call this.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceMember(supabase, id, u.id)

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      role,
      profiles(id, name, email, initials, avatar_url)
    `)
    .eq('workspace_id', id)
    .order('joined_at', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return (data ?? []).map((row: any) => ({
    id: row.profiles.id as string,
    name: row.profiles.name as string,
    email: row.profiles.email as string,
    initials: row.profiles.initials as string,
    avatarUrl: (row.profiles.avatar_url as string | null) ?? undefined,
    role: row.role as 'owner' | 'editor' | 'viewer',
  }))
})
