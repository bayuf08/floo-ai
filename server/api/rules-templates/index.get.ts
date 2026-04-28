/**
 * GET /api/rules-templates?workspace=:wsId
 * List rules templates available to the user — system templates + workspace
 * customs. Without `workspace`, returns system templates only.
 *
 * Caller must be a member of the queried workspace (when one is provided).
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceMember } from '~/server/utils/authz'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const workspaceId = query.workspace as string | undefined

  const u = requireUser(event)
  const supabase = serviceSupabase(event)

  if (workspaceId) {
    await assertWorkspaceMember(supabase, workspaceId, u.id)
  }

  let qb = supabase
    .from('rules_templates')
    .select(
      'id, name, voice_preview, brand_voice, do_guidelines, dont_guidelines, hashtags, is_system, workspace_id, created_at'
    )
    // System rows first, then alphabetical.
    .order('is_system', { ascending: false })
    .order('name')

  if (workspaceId) {
    qb = qb.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
  } else {
    qb = qb.is('workspace_id', null)
  }

  const { data, error } = await qb
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
