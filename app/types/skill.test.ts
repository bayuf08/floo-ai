import { describe, expect, test } from 'bun:test'
import { resolveSkillFormCategory } from './skill'

describe('resolveSkillFormCategory', () => {
  test('uses the current filtered category when one is active', () => {
    expect(resolveSkillFormCategory('trend')).toBe('trend')
    expect(resolveSkillFormCategory('workflow')).toBe('workflow')
    expect(resolveSkillFormCategory('format')).toBe('format')
    expect(resolveSkillFormCategory('voice')).toBe('voice')
  })

  test('falls back to voice when the all view is active', () => {
    expect(resolveSkillFormCategory('all')).toBe('voice')
  })

  test('falls back to voice when no category is provided', () => {
    expect(resolveSkillFormCategory()).toBe('voice')
  })
})
