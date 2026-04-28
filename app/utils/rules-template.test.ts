import { describe, expect, test } from 'bun:test'
import {
  FALLBACK_RULES_TEMPLATES,
  normalizeRulesTemplateDraft,
  normalizeRulesTemplateRow,
  splitRulesTemplates,
} from '../types/rules-template'
import type { Project } from '../types/project'
import { patchProjectRulesState, toProjectContextPatchBody } from './rules-context'

describe('normalizeRulesTemplateRow', () => {
  test('maps backend snake_case fields into frontend camelCase', () => {
    const row = normalizeRulesTemplateRow({
      id: 'tpl-1',
      name: 'Quiet Artisan',
      voice_preview: 'Deliberate and quiet.',
      brand_voice: 'Deliberate, weight-bearing.',
      do_guidelines: ['Reference craft.'],
      dont_guidelines: ['Avoid slang.'],
      hashtags: ['#SlowCraft'],
      is_system: true,
      workspace_id: null,
      created_at: '2026-04-27T12:00:00.000Z',
    })

    expect(row).toEqual({
      id: 'tpl-1',
      name: 'Quiet Artisan',
      voicePreview: 'Deliberate and quiet.',
      brandVoice: 'Deliberate, weight-bearing.',
      doGuidelines: ['Reference craft.'],
      dontGuidelines: ['Avoid slang.'],
      hashtags: ['#SlowCraft'],
      isSystem: true,
      workspaceId: null,
      createdAt: new Date('2026-04-27T12:00:00.000Z'),
    })
  })
})

describe('normalizeRulesTemplateDraft', () => {
  test('trims fields and removes blank guideline and hashtag entries', () => {
    const draft = normalizeRulesTemplateDraft({
      name: '  Template  ',
      voicePreview: '  Quiet and precise  ',
      brandVoice: '  Give careful direction.  ',
      doGuidelines: ['  Mention process  ', '   '],
      dontGuidelines: [' Avoid slang ', ''],
      hashtags: [' #slow ', '', 'craft '],
    })

    expect(draft).toEqual({
      name: 'Template',
      voicePreview: 'Quiet and precise',
      brandVoice: 'Give careful direction.',
      doGuidelines: ['Mention process'],
      dontGuidelines: ['Avoid slang'],
      hashtags: ['#slow', '#craft'],
    })
  })

  test('keeps fallback templates available for offline mode', () => {
    expect(FALLBACK_RULES_TEMPLATES.length).toBeGreaterThan(0)
    expect(FALLBACK_RULES_TEMPLATES.every((tpl) => tpl.isSystem)).toBe(true)
  })
})

describe('splitRulesTemplates', () => {
  test('separates system templates from workspace custom templates', () => {
    const rows = [
      normalizeRulesTemplateRow({ id: 'sys', name: 'System', is_system: true, workspace_id: null }),
      normalizeRulesTemplateRow({ id: 'custom', name: 'Custom', is_system: false, workspace_id: 'ws-1' }),
    ]

    const result = splitRulesTemplates(rows)

    expect(result.system.map((row) => row.id)).toEqual(['sys'])
    expect(result.workspace.map((row) => row.id)).toEqual(['custom'])
  })
})

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

describe('patchProjectRulesState', () => {
  test('updates only the requested project Rules keys and returns a rollback snapshot', () => {
    const projects = [
      makeProject({
        id: 'proj-1',
        contextRules: {
          brandVoice: 'Old voice',
          doGuidelines: ['Old do'],
          dontGuidelines: ['Old dont'],
          hashtags: ['#old'],
          skills: [],
        },
      }),
    ]

    const result = patchProjectRulesState(projects, 'proj-1', {
      brandVoice: 'New voice',
      hashtags: ['#new'],
    })

    expect(result.previous).toEqual({
      brandVoice: 'Old voice',
      doGuidelines: ['Old do'],
      dontGuidelines: ['Old dont'],
      hashtags: ['#old'],
      skills: [],
    })
    expect(projects[0]?.contextRules?.brandVoice).toBe('New voice')
    expect(projects[0]?.contextRules?.hashtags).toEqual(['#new'])
    expect(projects[0]?.contextRules?.doGuidelines).toEqual(['Old do'])
  })
})

describe('toProjectContextPatchBody', () => {
  test('maps camelCase rules keys into the backend patch shape', () => {
    expect(
      toProjectContextPatchBody({
        brandVoice: 'Voice',
        doGuidelines: ['Do'],
        dontGuidelines: ['Dont'],
        hashtags: ['#tag'],
      })
    ).toEqual({
      brand_voice: 'Voice',
      do_guidelines: ['Do'],
      dont_guidelines: ['Dont'],
      hashtags: ['#tag'],
    })
  })
})
