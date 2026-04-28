export function isSkillAssignableToWorkspace(
  projectWorkspaceId: string,
  skillWorkspaceId?: string | null,
): boolean {
  return !skillWorkspaceId || skillWorkspaceId === projectWorkspaceId
}

export function buildSkillPatch(body: Record<string, unknown> | null | undefined) {
  const patch: Record<string, unknown> = {}

  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw new Error('name cannot be blank')
    patch.name = name
  }

  if (body?.description !== undefined) {
    const description = String(body.description).trim()
    if (!description) throw new Error('description cannot be blank')
    patch.description = description
  }

  if (body?.instructions !== undefined) {
    const instructions = String(body.instructions ?? '').trim()
    patch.instructions = instructions || null
  }

  if (body?.examples !== undefined) {
    patch.examples = Array.isArray(body.examples) && body.examples.length > 0
      ? body.examples.map((example) => String(example))
      : null
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('No updatable fields provided')
  }

  return patch
}
