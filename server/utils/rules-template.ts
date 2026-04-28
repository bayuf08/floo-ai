import { createError } from 'h3'

function normalizeHashtag(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, '')
  if (!trimmed) return null
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

function normalizeStringArray(values: unknown[], options: { hashtags?: boolean } = {}) {
  return values
    .map((value) => String(value ?? '').trim())
    .map((value) => (options.hashtags ? normalizeHashtag(value) : value))
    .filter((value): value is string => !!value)
}

export function buildRulesTemplateMutation(
  body: Record<string, unknown>,
  options: { requireAtLeastOneField?: boolean } = {},
) {
  const next: Record<string, unknown> = {}

  const setString = (sourceKey: string, targetKey = sourceKey, errorLabel?: string) => {
    if (!(sourceKey in body)) return
    const value = String(body[sourceKey] ?? '').trim()
    if (!value) {
      if (errorLabel) {
        throw createError({ statusCode: 400, statusMessage: `${errorLabel} is required` })
      }
      return
    }
    next[targetKey] = value
  }

  const setArray = (sourceKey: string, arrayOptions: { hashtags?: boolean } = {}) => {
    if (!(sourceKey in body)) return
    const raw = Array.isArray(body[sourceKey]) ? body[sourceKey] : []
    next[sourceKey] = normalizeStringArray(raw, arrayOptions)
  }

  setString('name', 'name', 'Template name')
  setString('voice_preview')
  setString('brand_voice')
  setArray('do_guidelines')
  setArray('dont_guidelines')
  setArray('hashtags', { hashtags: true })

  if (options.requireAtLeastOneField && Object.keys(next).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No template fields to update' })
  }

  return next
}
