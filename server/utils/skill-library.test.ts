import { describe, expect, test } from 'bun:test'
import { buildSkillPatch, isSkillAssignableToWorkspace } from './skill-library'

describe('isSkillAssignableToWorkspace', () => {
  test('allows system skills with no workspace', () => {
    expect(isSkillAssignableToWorkspace('ws-1', null)).toBe(true)
    expect(isSkillAssignableToWorkspace('ws-1', undefined)).toBe(true)
  })

  test('allows custom skills from the same workspace only', () => {
    expect(isSkillAssignableToWorkspace('ws-1', 'ws-1')).toBe(true)
    expect(isSkillAssignableToWorkspace('ws-1', 'ws-2')).toBe(false)
  })
})

describe('buildSkillPatch', () => {
  test('normalizes valid fields into an update patch', () => {
    expect(
      buildSkillPatch({
        name: '  Renamed skill  ',
        description: '  Updated description  ',
        instructions: '  Be specific  ',
      })
    ).toEqual({
      name: 'Renamed skill',
      description: 'Updated description',
      instructions: 'Be specific',
    })
  })

  test('allows clearing optional instructions', () => {
    expect(buildSkillPatch({ instructions: '' })).toEqual({ instructions: null })
  })

  test('rejects blank required text fields after trimming', () => {
    expect(() => buildSkillPatch({ name: '   ' })).toThrow('name cannot be blank')
    expect(() => buildSkillPatch({ description: '   ' })).toThrow('description cannot be blank')
  })

  test('rejects requests with no updatable fields', () => {
    expect(() => buildSkillPatch({})).toThrow('No updatable fields provided')
  })
})
