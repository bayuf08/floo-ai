/**
 * Static integrity test for the marketing + creator skill seed migration.
 *
 * Why this exists: the seed migration is generated from
 * floo-content/skills-source/*.md by `build_seed_migration.py`. If someone
 * re-runs the generator with empty source bodies, or hand-edits the SQL
 * and breaks a row, the catalog will silently regress to dummy skills
 * (which is the exact failure mode this whole refactor was fixing).
 *
 * This test parses the migration file in-place and asserts each seeded
 * row has substantive instructions and ≥ 1 example. It does NOT need a
 * live database — it's a content-quality guard at the source of truth.
 *
 * If you legitimately need to ship a seed row with no body (rare, e.g. a
 * placeholder skill), update the MIN_INSTR_CHARS threshold or expected
 * row list — don't silence the test.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260429000001_seed_marketing_creator_skills.sql',
)

/** Minimum body length for an Anthropic-grade skill. Anything less is a dummy. */
const MIN_INSTR_CHARS = 1_500

/** Names + categories we expect to find. Update if the roster changes. */
const EXPECTED_ROWS: Array<{ name: string; category: string }> = [
  { name: 'Brand Review', category: 'marketing' },
  { name: 'Campaign Plan', category: 'marketing' },
  { name: 'Competitive Brief', category: 'marketing' },
  { name: 'Draft Content', category: 'marketing' },
  { name: 'Email Sequence', category: 'marketing' },
  { name: 'Performance Report', category: 'marketing' },
  { name: 'SEO Audit', category: 'marketing' },
  { name: 'Skill Creator', category: 'creator' },
]

interface ParsedRow {
  name: string
  category: string
  description: string
  instructions: string
  examplesCount: number
}

/**
 * Hand-rolled parser keyed to the generator's output shape:
 *   ('Name', 'category', 'description', $instr$ ... $instr$, ARRAY[$ex0$ ... $exN$ ... ]::text[], false, NULL)
 *
 * If the generator output shape changes, update this regex. We deliberately
 * don't pull in a SQL parser dependency — this is a fast, focused guard.
 */
function parseSeed(sql: string): ParsedRow[] {
  const tuple =
    /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*\$instr\$\s*([\s\S]*?)\s*\$instr\$\s*,\s*ARRAY\[([\s\S]*?)\]::text\[\]\s*,\s*false\s*,\s*NULL\s*\)/g
  const rows: ParsedRow[] = []
  let m: RegExpExecArray | null
  while ((m = tuple.exec(sql)) !== null) {
    const [, name, category, description, instructions, examplesBlob] = m
    // Each example uses a unique $exN$...$exN$ pair. Count opening tags.
    const examplesCount = (examplesBlob.match(/\$ex\d+\$/g)?.length ?? 0) / 2
    rows.push({
      name: name!,
      category: category!,
      description: description!.replace(/''/g, "'"),
      instructions: instructions!,
      examplesCount,
    })
  }
  return rows
}

describe('marketing + creator seed migration', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8')
  const rows = parseSeed(sql)
  const byName = new Map(rows.map((r) => [r.name, r]))

  test('contains exactly the expected 8 rows', () => {
    expect(rows).toHaveLength(EXPECTED_ROWS.length)
    for (const expected of EXPECTED_ROWS) {
      const row = byName.get(expected.name)
      expect(row, `missing row: ${expected.name}`).toBeDefined()
      expect(row!.category).toBe(expected.category)
    }
  })

  test('every row has a non-empty description ≤ 110 chars', () => {
    for (const row of rows) {
      expect(row.description.length).toBeGreaterThan(0)
      expect(
        row.description.length,
        `${row.name} description is ${row.description.length} chars`,
      ).toBeLessThanOrEqual(110)
    }
  })

  test('every row has substantive instructions (Anthropic-grade body)', () => {
    for (const row of rows) {
      expect(
        row.instructions.length,
        `${row.name} instructions are only ${row.instructions.length} chars (< ${MIN_INSTR_CHARS})`,
      ).toBeGreaterThanOrEqual(MIN_INSTR_CHARS)
      // Sanity check that the body contains the key SKILL.md sections.
      expect(row.instructions).toContain('## Purpose')
      expect(row.instructions).toContain('## When to use')
      expect(row.instructions).toContain('## Output format')
      expect(row.instructions).toContain('## Anti-patterns to avoid')
    }
  })

  test('every row has ≥ 2 examples', () => {
    for (const row of rows) {
      expect(
        row.examplesCount,
        `${row.name} has only ${row.examplesCount} examples`,
      ).toBeGreaterThanOrEqual(2)
    }
  })

  test('uses only the relaxed category set (marketing | creator)', () => {
    const allowed = new Set(['marketing', 'creator'])
    for (const row of rows) {
      expect(allowed.has(row.category), `${row.name} has category ${row.category}`).toBe(true)
    }
  })
})
