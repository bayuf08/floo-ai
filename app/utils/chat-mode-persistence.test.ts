/**
 * Tests for the chat-mode persistence codec.
 *
 * These rules are tiny but load-bearing for the "task intent is optional"
 * UX: a regression that silently snaps users back to a previously-set mode
 * (or shows the placeholder when they had a real selection) would defeat
 * the whole change. Lock the encoding contract here.
 */
import { describe, expect, test } from 'bun:test'
import type { ContentMode } from '~/types/chat'
import {
  CHAT_MODE_LS_KEY,
  CHAT_MODE_LS_NONE,
  decodePersistedMode,
  encodeModeForStorage,
} from './chat-mode-persistence'

const ALLOWED: readonly ContentMode[] = ['research', 'competitor', 'trend', 'copy', 'image', 'video']

describe('chat-mode persistence — keys', () => {
  test('key is stable so localStorage values from prior versions still parse', () => {
    expect(CHAT_MODE_LS_KEY).toBe('floo:chat:selectedMode')
  })

  test('"none" is the explicit-clear sentinel', () => {
    expect(CHAT_MODE_LS_NONE).toBe('none')
  })
})

describe('decodePersistedMode', () => {
  test('null (fresh browser) → undefined', () => {
    expect(decodePersistedMode(null, ALLOWED)).toBeUndefined()
  })

  test('empty string → undefined', () => {
    expect(decodePersistedMode('', ALLOWED)).toBeUndefined()
  })

  test('the "none" sentinel → undefined (explicit clear is honoured)', () => {
    expect(decodePersistedMode(CHAT_MODE_LS_NONE, ALLOWED)).toBeUndefined()
  })

  test('a valid mode in the allow-list → that mode', () => {
    expect(decodePersistedMode('research', ALLOWED)).toBe('research')
    expect(decodePersistedMode('copy', ALLOWED)).toBe('copy')
    expect(decodePersistedMode('image', ALLOWED)).toBe('image')
  })

  test('a string outside the allow-list → undefined (safe fallback)', () => {
    expect(decodePersistedMode('legacy-mode', ALLOWED)).toBeUndefined()
    expect(decodePersistedMode('research-but-typo', ALLOWED)).toBeUndefined()
  })

  test('decode is case-sensitive (matches Zod enum on server)', () => {
    expect(decodePersistedMode('Research', ALLOWED)).toBeUndefined()
    expect(decodePersistedMode('RESEARCH', ALLOWED)).toBeUndefined()
  })
})

describe('encodeModeForStorage', () => {
  test('a defined mode encodes to its own value', () => {
    expect(encodeModeForStorage('research')).toBe('research')
    expect(encodeModeForStorage('copy')).toBe('copy')
  })

  test('undefined encodes to the "none" sentinel (NOT an empty string)', () => {
    // Using "none" lets us distinguish "user cleared" from "fresh browser".
    expect(encodeModeForStorage(undefined)).toBe('none')
  })
})

describe('round-trip', () => {
  test('encode then decode preserves a defined mode', () => {
    for (const m of ALLOWED) {
      expect(decodePersistedMode(encodeModeForStorage(m), ALLOWED)).toBe(m)
    }
  })

  test('encode then decode preserves the cleared state', () => {
    expect(decodePersistedMode(encodeModeForStorage(undefined), ALLOWED)).toBeUndefined()
  })
})
