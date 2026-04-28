import { describe, expect, test } from 'bun:test'
import type { Project } from '../types/project'
import {
  canManageSkills,
  canToggleProjectSkills,
  removeSkillFromProjects,
  syncSkillNameAcrossProjects,
  upsertProjectSkillState,
} from './skill-library'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? 'proj-1',
    name: overrides.name ?? 'Project',
    workspaceId: overrides.workspaceId ?? 'ws-1',
    platform: overrides.platform ?? 'tiktok',
    color: overrides.color ?? '#000000',
    updatedAt: overrides.updatedAt ?? new Date('2026-04-27T00:00:00.000Z'),
    contextRules: overrides.contextRules,
    members: overrides.members,
    isPinned: overrides.isPinned,
  }
}

describe('skill-library permissions', () => {
  test('allows owners and editors to manage skills', () => {
    expect(canManageSkills('owner')).toBe(true)
    expect(canManageSkills('editor')).toBe(true)
  })

  test('blocks viewers and unknown roles from managing skills', () => {
    expect(canManageSkills('viewer')).toBe(false)
    expect(canManageSkills(undefined)).toBe(false)
    expect(canManageSkills(null)).toBe(false)
  })

  test('uses the same policy for project skill toggles', () => {
    expect(canToggleProjectSkills('owner')).toBe(true)
    expect(canToggleProjectSkills('editor')).toBe(true)
    expect(canToggleProjectSkills('viewer')).toBe(false)
  })
})

describe('project skill sync helpers', () => {
  test('syncs a renamed skill across every loaded project', () => {
    const projects = [
      makeProject({
        id: 'proj-1',
        contextRules: {
          brandVoice: '',
          doGuidelines: [],
          dontGuidelines: [],
          skills: [
            { id: 'sk-1', name: 'Original', active: true },
            { id: 'sk-2', name: 'Untouched', active: false },
          ],
        },
      }),
      makeProject({
        id: 'proj-2',
        contextRules: {
          brandVoice: '',
          doGuidelines: [],
          dontGuidelines: [],
          skills: [
            { id: 'sk-1', name: 'Original', active: false },
          ],
        },
      }),
      makeProject({ id: 'proj-3' }),
    ]

    const next = syncSkillNameAcrossProjects(projects, 'sk-1', 'Renamed skill')

    expect(next[0]?.contextRules?.skills[0]?.name).toBe('Renamed skill')
    expect(next[1]?.contextRules?.skills[0]?.name).toBe('Renamed skill')
    expect(next[0]?.contextRules?.skills[1]?.name).toBe('Untouched')
    expect(next[2]?.contextRules).toBeUndefined()
  })

  test('removes a deleted skill from every loaded project', () => {
    const projects = [
      makeProject({
        id: 'proj-1',
        contextRules: {
          brandVoice: '',
          doGuidelines: [],
          dontGuidelines: [],
          skills: [
            { id: 'sk-1', name: 'Delete me', active: true },
            { id: 'sk-2', name: 'Keep me', active: true },
          ],
        },
      }),
      makeProject({
        id: 'proj-2',
        contextRules: {
          brandVoice: '',
          doGuidelines: [],
          dontGuidelines: [],
          skills: [{ id: 'sk-1', name: 'Delete me', active: false }],
        },
      }),
    ]

    const next = removeSkillFromProjects(projects, 'sk-1')

    expect(next[0]?.contextRules?.skills).toEqual([{ id: 'sk-2', name: 'Keep me', active: true }])
    expect(next[1]?.contextRules?.skills).toEqual([])
  })

  test('adds or updates project skill assignment state locally', () => {
    expect(
      upsertProjectSkillState([], { id: 'sk-1', name: 'Skill one' }, true)
    ).toEqual([{ id: 'sk-1', name: 'Skill one', active: true }])

    expect(
      upsertProjectSkillState(
        [{ id: 'sk-1', name: 'Old name', active: true }],
        { id: 'sk-1', name: 'New name' },
        false,
      )
    ).toEqual([{ id: 'sk-1', name: 'New name', active: false }])
  })
})
