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

import { replaceMentionTrigger } from './mention-parsing'

describe('replaceMentionTrigger', () => {
  test('replaces @LK at end of text with @filename + trailing space', () => {
    // "hi @LK" — start=3, caret=6. Filename "LK-XL-25-Q1.pdf" (15 chars).
    // Expected: "hi @LK-XL-25-Q1.pdf " (20 chars), caret at 20.
    expect(replaceMentionTrigger('hi @LK', 3, 6, 'LK-XL-25-Q1.pdf')).toEqual({
      text: 'hi @LK-XL-25-Q1.pdf ',
      caret: 20,
    })
  })

  test('next char is whitespace — omits trailing space, jumps caret past existing whitespace', () => {
    // "hi @LK after" — start=3, caret=6. Filename "LK-XL-25-Q1.pdf" (15 chars).
    // After is " after" → starts with whitespace, so insertion is "@LK-XL-25-Q1.pdf" (16 chars, no trailing space).
    // Caret = start (3) + insertion length (16) + 1 (skip existing space) = 20.
    expect(replaceMentionTrigger('hi @LK after', 3, 6, 'LK-XL-25-Q1.pdf')).toEqual({
      text: 'hi @LK-XL-25-Q1.pdf after',
      caret: 20,
    })
  })

  test('trigger at index 0', () => {
    expect(replaceMentionTrigger('@', 0, 1, 'LK.pdf')).toEqual({
      text: '@LK.pdf ',
      caret: 8,
    })
  })

  test('trigger at index 0 with text after caret (non-whitespace)', () => {
    expect(replaceMentionTrigger('@xyz', 0, 1, 'LK.pdf')).toEqual({
      // before="" + "@LK.pdf " (8) + "xyz" → "@LK.pdf xyz", caret = 0 + 8 = 8
      text: '@LK.pdf xyz',
      caret: 8,
    })
  })

  test('caret at end of partial query, suffix preserved', () => {
    // "say @LK now" — start=4, caret=7. Filename "LK.pdf" (6 chars).
    // After = " now" → whitespace → insertion = "@LK.pdf" (7 chars, no trailing space).
    // Caret = 4 + 7 + 1 = 12.
    expect(replaceMentionTrigger('say @LK now', 4, 7, 'LK.pdf')).toEqual({
      text: 'say @LK.pdf now',
      caret: 12,
    })
  })
})
