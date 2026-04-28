/**
 * Authorization helpers — replace the RLS policies that used to scope
 * every query by `auth.uid()`.
 *
 * Every workspace- or project-scoped route handler should call one of
 * these immediately after `requireUser(event)` and before doing any
 * data work. They throw 403 on a non-member, 500 on a DB error.
 *
 *   const u = requireUser(event)
 *   const supabase = serviceSupabase(event)
 *   await assertWorkspaceMember(supabase, workspaceId, u.id)
 *
 * The helpers that return `{ role }` let routes also enforce
 * editor-only or owner-only rules:
 *
 *   const { role } = await assertWorkspaceMember(supabase, wsId, u.id)
 *   if (role !== 'owner') throw createError({ statusCode: 403, … })
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'h3'

type MemberRole = 'owner' | 'editor' | 'viewer'

/**
 * Throws 403 if the user is not a member of the workspace.
 * Returns the membership role on success.
 */
export async function assertWorkspaceMember(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<{ role: MemberRole }> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return { role: data.role as MemberRole }
}

/** Stricter variant — must be an owner or editor of the workspace. */
export async function assertWorkspaceEditor(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<{ role: 'owner' | 'editor' }> {
  const { role } = await assertWorkspaceMember(supabase, workspaceId, userId)
  if (role !== 'owner' && role !== 'editor') {
    throw createError({ statusCode: 403, statusMessage: 'Editor role required' })
  }
  return { role }
}

/** Strictest variant — must be the workspace owner. */
export async function assertWorkspaceOwner(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { role } = await assertWorkspaceMember(supabase, workspaceId, userId)
  if (role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Owner role required' })
  }
}

/**
 * Project access derives from workspace membership: any member of a
 * project's parent workspace can see the project. Returns the workspace
 * role so callers can layer editor/owner checks on top.
 */
export async function assertProjectMember(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<{ workspaceId: string; role: MemberRole }> {
  // One round-trip: fetch the project's workspace_id and the caller's
  // membership in that workspace via an inner join.
  const { data, error } = await supabase
    .from('projects')
    .select('workspace_id, workspace:workspaces!inner(workspace_members!inner(role,user_id))')
    .eq('id', projectId)
    .eq('workspace.workspace_members.user_id', userId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const role = (data as any).workspace?.workspace_members?.[0]?.role as MemberRole | undefined
  if (!role) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  return { workspaceId: (data as any).workspace_id as string, role }
}

/** Stricter variant — caller must be owner/editor of the project's workspace. */
export async function assertProjectEditor(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<{ workspaceId: string; role: 'owner' | 'editor' }> {
  const { workspaceId, role } = await assertProjectMember(supabase, projectId, userId)
  if (role !== 'owner' && role !== 'editor') {
    throw createError({ statusCode: 403, statusMessage: 'Editor role required' })
  }
  return { workspaceId, role }
}
