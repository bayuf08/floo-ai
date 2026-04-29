import { describe, expect, test } from 'bun:test'
import { reconcileMentionRefs } from './mention-refs'

describe('reconcileMentionRefs', () => {
  test('empty refs → empty array', () => {
    expect(reconcileMentionRefs('hello @anything', [])).toEqual([])
  })

  test('one ref present in text → returns its id', () => {
    expect(
      reconcileMentionRefs('analyze @LK.pdf please', [
        { assetId: 'a-1', filename: 'LK.pdf' },
      ]),
    ).toEqual(['a-1'])
  })

  test('one ref deleted from text → returns []', () => {
    expect(
      reconcileMentionRefs('plain text now', [
        { assetId: 'a-1', filename: 'LK.pdf' },
      ]),
    ).toEqual([])
  })

  test('two refs, second deleted → returns first only', () => {
    expect(
      reconcileMentionRefs('compare @LK.pdf with the other doc', [
        { assetId: 'a-1', filename: 'LK.pdf' },
        { assetId: 'a-2', filename: 'XL.pdf' },
      ]),
    ).toEqual(['a-1'])
  })

  test('duplicate refs (same assetId twice, both filenames present) → de-duplicated', () => {
    expect(
      reconcileMentionRefs('@LK.pdf again @LK.pdf', [
        { assetId: 'a-1', filename: 'LK.pdf' },
        { assetId: 'a-1', filename: 'LK.pdf' },
      ]),
    ).toEqual(['a-1'])
  })

  test('two different files with same filename string but different ids → both kept', () => {
    // brand_assets.name is not unique per project (no DB constraint), so this
    // is a legal state. Both ids must survive.
    expect(
      reconcileMentionRefs('see @LK.pdf', [
        { assetId: 'a-1', filename: 'LK.pdf' },
        { assetId: 'a-2', filename: 'LK.pdf' },
      ]),
    ).toEqual(['a-1', 'a-2'])
  })

  test('preserves insertion order in the output', () => {
    expect(
      reconcileMentionRefs('@a.pdf @b.pdf @c.pdf', [
        { assetId: 'id-c', filename: 'c.pdf' },
        { assetId: 'id-a', filename: 'a.pdf' },
        { assetId: 'id-b', filename: 'b.pdf' },
      ]),
    ).toEqual(['id-c', 'id-a', 'id-b'])
  })

  test('short filename is prefix of longer filename — only the matched entry is returned', () => {
    // @brief.doc is a substring of @brief.docx, but the boundary check
    // (next char `x` is a filename-continuation char) rejects the false match.
    expect(
      reconcileMentionRefs('see @brief.docx', [
        { assetId: 'doc-id', filename: 'brief.doc' },
        { assetId: 'docx-id', filename: 'brief.docx' },
      ]),
    ).toEqual(['docx-id'])
  })
})
