/**
 * Smoke test for the Task Intent + Model Switcher wiring.
 *
 * Hits a running dev server with every (mode, model) pair and verifies that
 * the persisted assistant_message.metadata.model matches what was sent.
 * Warns (does not fail) if web-search citations are missing on research mode,
 * since GLM doesn't always trigger web_search for trivial probes.
 *
 * Usage:
 *   1. Start the dev server: `bun run dev`
 *   2. In your browser, open DevTools → Application → Cookies → copy the
 *      value of `nuxt-session` for http://localhost:3000.
 *   3. Set env vars:
 *        SMOKE_BASE_URL=http://localhost:3000 (default)
 *        SMOKE_SESSION_COOKIE=<the value from step 2>
 *        SMOKE_PROJECT_ID=<a project id you can edit>
 *   4. Run: `bun run scripts/smoke-glm.ts`
 *
 * Exit code 0 on all-pass, 1 otherwise.
 */
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const COOKIE = process.env.SMOKE_SESSION_COOKIE
const PROJECT_ID = process.env.SMOKE_PROJECT_ID

if (!COOKIE) {
  console.error('Missing SMOKE_SESSION_COOKIE — copy from your browser cookies.')
  process.exit(2)
}
if (!PROJECT_ID) {
  console.error('Missing SMOKE_PROJECT_ID — create a project in the UI and pass its id.')
  process.exit(2)
}

const MODES = ['research', 'copy'] as const
const MODELS = ['glm-4.5', 'glm-4-plus', 'glm-4-air', 'glm-4.5-flash'] as const

type Row = {
  mode: string
  model: string
  actualModel: string
  citations: number
  latencyMs: number
  status: 'PASS' | 'FAIL' | 'WARN'
  reason?: string
}

const results: Row[] = []

for (const mode of MODES) {
  for (const model of MODELS) {
    const t0 = performance.now()
    let actualModel = '(none)'
    let citations = 0
    let status: Row['status'] = 'FAIL'
    let reason: string | undefined

    try {
      const res = await fetch(`${BASE}/api/projects/${PROJECT_ID}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `nuxt-session=${COOKIE}`,
        },
        body: JSON.stringify({
          content: `Smoke probe — ${mode} mode, ${model}. Reply with one short sentence.`,
          mode,
          model,
        }),
      })

      if (!res.ok) {
        reason = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`
      } else {
        const j: any = await res.json()
        const meta = j?.assistant_message?.metadata ?? {}
        actualModel = meta.model ?? '(missing metadata.model)'
        citations = Array.isArray(meta.citations) ? meta.citations.length : 0

        if (actualModel !== model) {
          status = 'FAIL'
          reason = `expected model=${model}, got ${actualModel}`
        } else if (mode === 'research' && citations === 0) {
          status = 'WARN'
          reason = 'research mode produced no citations (probe may have been too trivial)'
        } else {
          status = 'PASS'
        }
      }
    } catch (e: any) {
      reason = e?.message ?? String(e)
    }

    results.push({
      mode,
      model,
      actualModel,
      citations,
      latencyMs: Math.round(performance.now() - t0),
      status,
      reason,
    })
  }
}

// Print table
const w = (s: string, n: number) => s.padEnd(n).slice(0, n)
console.log()
console.log(
  w('mode', 10) + w('model', 16) + w('actual model', 16) +
  w('cites', 6) + w('latency', 10) + w('status', 6) + 'reason'
)
console.log('-'.repeat(110))
for (const r of results) {
  console.log(
    w(r.mode, 10) + w(r.model, 16) + w(r.actualModel, 16) +
    w(String(r.citations), 6) + w(`${r.latencyMs}ms`, 10) +
    w(r.status, 6) + (r.reason ?? '')
  )
}
console.log()

const failed = results.filter((r) => r.status === 'FAIL').length
const warned = results.filter((r) => r.status === 'WARN').length
const passed = results.length - failed - warned
console.log(`${passed} pass · ${warned} warn · ${failed} fail`)
process.exit(failed === 0 ? 0 : 1)
