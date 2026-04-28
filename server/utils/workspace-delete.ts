type WorkspaceDeleteErrorLike = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
} | null | undefined

function joinErrorParts(error: WorkspaceDeleteErrorLike): string {
  const parts = [error?.message, error?.details, error?.hint]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())

  return parts.join(' ')
}

export function normalizeWorkspaceDeleteFailure(error: WorkspaceDeleteErrorLike): {
  statusCode: number
  statusMessage: string
} {
  const detail = joinErrorParts(error)

  if (error?.code === '23503') {
    return {
      statusCode: 409,
      statusMessage: detail
        ? `Workspace delete is blocked by related records. ${detail}`
        : 'Workspace delete is blocked by related records.',
    }
  }

  return {
    statusCode: 500,
    statusMessage: detail || 'Workspace delete failed.',
  }
}
