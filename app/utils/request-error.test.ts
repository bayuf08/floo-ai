import { describe, expect, test } from 'bun:test'
import { getRequestErrorDetail } from './request-error'

describe('getRequestErrorDetail', () => {
  test('prefers the backend payload message over a generic top-level status', () => {
    expect(
      getRequestErrorDetail({
        statusMessage: 'Server Error',
        data: { statusMessage: 'Workspace delete is blocked by related records.' },
      })
    ).toBe('Workspace delete is blocked by related records.')
  })

  test('falls back through other known message locations', () => {
    expect(getRequestErrorDetail({ statusMessage: 'Bad Request' })).toBe('Bad Request')
    expect(getRequestErrorDetail({ message: 'Network down' })).toBe('Network down')
  })

  test('uses the provided fallback when nothing useful is present', () => {
    expect(getRequestErrorDetail({}, 'Something went wrong.')).toBe('Something went wrong.')
  })
})
