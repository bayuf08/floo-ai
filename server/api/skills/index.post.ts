/**
 * POST /api/skills
 *
 * Creates a custom skill in the given workspace.
 *
 * Body:
 *   workspace_id   string  (required)
 *   name           string  (required)
 *   category       string  — 'marketing' | 'creator' (required)
 *   description    string  (required)
 *   instructions   string  (optional)
 *   examples       string[] (optional)
 *
 * Auth: workspace editor or owner.
 */
import { requireUser, serviceSupabase } from '~/server/utils/supabase'
import { assertWorkspaceEditor } from '~/server/utils/authz'

const VALID_CATEGORIES = ['marketing', 'creator'] as const

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const body = await readBody(event)
  const supabase = serviceSupabase(event)

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!body?.workspace_id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'workspace_id is required' })
  }
  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }
  if (!body?.description?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'description is required' })
  }
  if (!VALID_CATEGORIES.includes(body.category)) {
    throw createError({ statusCode: 400, statusMessage: `category must be one of: ${VALID_CATEGORIES.join(', ')}` })
  }
  if (body.examples !== undefined && !Array.isArray(body.examples)) {
    throw createError({ statusCode: 400, statusMessage: 'examples must be an array of strings' })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  await assertWorkspaceEditor(supabase, body.workspace_id, user.id)

  // ── Insert ────────────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('skills')
    .insert({
      workspace_id:  body.workspace_id,
      name:          body.name.trim(),
      category:      body.category,
      description:   body.description.trim(),
      instructions:  body.instructions?.trim() || null,
      examples:      Array.isArray(body.examples) && body.examples.length > 0
                       ? body.examples.map((e: string) => String(e))
                       : null,
      is_custom:     true,
      created_by:    user.id,
    })
    .select('id, name, category, description, instructions, examples, is_custom, workspace_id, created_by, created_at, updated_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
