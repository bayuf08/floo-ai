import { describe, expect, test } from 'bun:test'
import { buildRulesTemplateMutation } from './rules-template'

describe('buildRulesTemplateMutation', () => {
  test('trims string fields and removes blank guidelines and hashtags', () => {
    const result = buildRulesTemplateMutation({
      name: '  Template  ',
      voice_preview: '  Quiet  ',
      brand_voice: '  Long form guidance.  ',
      do_guidelines: [' Keep it grounded ', ' '],
      dont_guidelines: [' Avoid slang ', ''],
      hashtags: [' #brand ', ''],
    })

    expect(result).toEqual({
      name: 'Template',
      voice_preview: 'Quiet',
      brand_voice: 'Long form guidance.',
      do_guidelines: ['Keep it grounded'],
      dont_guidelines: ['Avoid slang'],
      hashtags: ['#brand'],
    })
  })

  test('rejects blank trimmed names on create or patch', () => {
    expect(() => buildRulesTemplateMutation({ name: '   ' })).toThrow('Template name is required')
  })

  test('rejects empty patches after normalization', () => {
    expect(() => buildRulesTemplateMutation({ voice_preview: '   ' }, { requireAtLeastOneField: true })).toThrow(
      'No template fields to update'
    )
  })
})
