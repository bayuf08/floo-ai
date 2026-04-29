import { describe, expect, test } from 'bun:test'
import { resolveSkillFormCategory } from './skill'

describe('resolveSkillFormCategory', () => {
  test('uses the current filtered category when one is active', () => {
    expect(resolveSkillFormCategory('marketing')).toBe('marketing')
    expect(resolveSkillFormCategory('creator')).toBe('creator')
  })

  test('falls back to marketing when the all view is active', () => {
    expect(resolveSkillFormCategory('all')).toBe('marketing')
  })

  test('falls back to marketing when no category is provided', () => {
    expect(resolveSkillFormCategory()).toBe('marketing')
  })
})
