import { describe, expect, test } from 'bun:test'
import { detectMentionTrigger } from './mention-parsing'

describe('detectMentionTrigger', () => {
  test('empty text → null', () => {
    expect(detectMentionTrigger('', 0)).toBeNull()
  })

  test('text without @ → null', () => {
    expect(detectMentionTrigger('hello', 5)).toBeNull()
  })

  test('@ alone, caret right after → empty query at start 0', () => {
    expect(detectMentionTrigger('@', 1)).toEqual({ start: 0, query: '' })
  })

  test('@LK at start, caret at end → query "LK"', () => {
    expect(detectMentionTrigger('@LK', 3)).toEqual({ start: 0, query: 'LK' })
  })

  test('@ after a space, caret at end → trigger from the @', () => {
    expect(detectMentionTrigger('hi @LK', 6)).toEqual({ start: 3, query: 'LK' })
  })

  test('@ mid-word (email-like) → null', () => {
    expect(detectMentionTrigger('hi@LK', 5)).toBeNull()
  })

  test('two @ tokens, second preceded by space → second trigger wins', () => {
    expect(detectMentionTrigger('@hi @LK', 7)).toEqual({ start: 4, query: 'LK' })
  })

  test('whitespace after the trigger commits — no active trigger', () => {
    expect(detectMentionTrigger('@LK there', 9)).toBeNull()
  })

  test('caret inside the query, not at the end', () => {
    // text = "@LK", caret = 2 → caret is between @ and L? No — between L and K.
    // Walking back from caret: text[1]='L', text[0]='@' → start 0, query = slice(1, 2) = 'L'
    expect(detectMentionTrigger('@LK', 2)).toEqual({ start: 0, query: 'L' })
  })

  test('@ at index 0, caret at 0 (cursor before @) → null (no chars before caret)', () => {
    expect(detectMentionTrigger('@LK', 0)).toBeNull()
  })
})
