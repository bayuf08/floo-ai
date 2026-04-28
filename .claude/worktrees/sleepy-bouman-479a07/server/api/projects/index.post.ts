/**
 * POST /api/projects
 * Create a project in a workspace. Caller must be an editor or owner of
 * that workspace. The on_project_created trigger automatically inserts
 * an empty project_contexts row.
 */
import { z } from 'zod'
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'

const Schema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().min(1).max(140),
  platform: z.enum(['tiktok', 'instagram', 'twitter', 'youtube', 'linkedin', 'threads']).default('tiktok'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  }

  const u = requireUser(event)
  const supabase = serviceSupabase(event)
  await assertWorkspaceEditor(supabase, parsed.data.workspace_id, u.id)

  const { description, ...projectFields } = parsed.data

  const { data, error } = await supabase
    .from('projects')
    .insert(projectFields)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  // Optional brand_voice seed from description.
  if (description) {
    await supabase
      .from('project_contexts')
      .update({ brand_voice: description })
      .eq('project_id', data.id)
  }

  return data
})
