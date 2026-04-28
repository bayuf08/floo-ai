import { describe, expect, test } from 'bun:test'
import { normalizeWorkspaceDeleteFailure } from './workspace-delete'

describe('normalizeWorkspaceDeleteFailure', () => {
  test('maps foreign-key violations to a clearer conflict response', () => {
    expect(
      normalizeWorkspaceDeleteFailure({
        code: '23503',
        message: 'update or delete on table "workspaces" violates foreign key constraint "foo"',
        details: 'Key (id)=(ws-1) is still referenced from table "foo".',
      })
    ).toEqual({
      statusCode: 409,
      statusMessage:
        'Workspace delete is blocked by related records. update or delete on table "workspaces" violates foreign key constraint "foo" Key (id)=(ws-1) is still referenced from table "foo".',
    })
  })

  test('passes through generic database failures', () => {
    expect(
      normalizeWorkspaceDeleteFailure({
        message: 'Database unavailable',
      })
    ).toEqual({
      statusCode: 500,
      statusMessage: 'Database unavailable',
    })
  })

  test('provides a stable fallback message when the error is empty', () => {
    expect(normalizeWorkspaceDeleteFailure(null)).toEqual({
      statusCode: 500,
      statusMessage: 'Workspace delete failed.',
    })
  })
})
