#!/usr/bin/env node
/**
 * scripts/build-prod-env.mjs
 *
 * Reads the local `.env` and produces `.env.production.filled` — a flat
 * KEY=value file ready to bulk-import into Vercel's "Production"
 * environment (and "Preview" if you re-run with --target=preview).
 *
 * What this script does, in order:
 *
 *   1. Parses `.env` (handles quoted values, ignores comments).
 *   2. Drops vars that Vercel sets automatically (NODE_ENV, VERCEL_*).
 *   3. Drops vars that aren't read by the runtime (GOOGLE_REDIRECT_URI is
 *      pure documentation — nuxt-auth-utils derives the callback URL
 *      from the request host).
 *   4. Overrides the values that MUST differ for production:
 *        - NUXT_PUBLIC_APP_URL → https://floo-ai.vercel.app
 *        - SESSION_SECRET      → a fresh, prod-only secret
 *        - SUPABASE_S3_*       → stamps the prod-region defaults; you
 *                                still have to paste the real S3
 *                                access key / secret manually.
 *   5. Writes `.env.production.filled` (gitignored).
 *   6. Prints a list of any variables that still contain placeholder
 *      values, so you know what to fix before uploading.
 *
 * The output file is a sibling of `.env`, NOT committed. After uploading
 * to Vercel, delete it.
 *
 * Usage:
 *   node scripts/build-prod-env.mjs                 # writes .env.production.filled
 *   node scripts/build-prod-env.mjs --target=preview # marks output for vercel "preview"
 *
 * Then bulk-upload to Vercel (one-liner at the bottom of this file).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL_ENV_PATH = path.join(ROOT, '.env')
const OUT_PATH = path.join(ROOT, '.env.production.filled')

// CLI arg: --target=production|preview (informational only; the file
// itself is target-agnostic — `vercel env add KEY <target>` is what
// actually scopes it).
const targetArg = process.argv.find((a) => a.startsWith('--target='))
const TARGET = targetArg ? targetArg.split('=')[1] : 'production'
if (!['production', 'preview'].includes(TARGET)) {
  console.error(`error: --target must be "production" or "preview", got "${TARGET}"`)
  process.exit(2)
}

// ────────────────────────────────────────────────────────────
// Production overrides — applied AFTER parsing local .env
// ────────────────────────────────────────────────────────────
const OVERRIDES = {
  NUXT_PUBLIC_APP_URL: 'https://floo-ai.vercel.app',

  // Fresh prod session secret. DO NOT reuse the local one — if the
  // local .env leaks, prod sessions stay safe.
  SESSION_SECRET: '3271c9627f2d91fc23a955a6ff08a10fc4a8de1d6724c046ec391fd888e587d0',

  // Supabase S3 — not present in local .env. Endpoint + region are
  // safe to hardcode (they're not secret); the access key/secret are
  // placeholders you fill in by hand from Supabase Dashboard →
  // Storage → S3 Access Keys → New access key.
  SUPABASE_S3_ENDPOINT: 'https://xxumxffdukpshebypzur.supabase.co/storage/v1/s3',
  SUPABASE_S3_REGION: 'ap-south-1',
  SUPABASE_S3_ACCESS_KEY_ID: '__FILL_FROM_SUPABASE_DASHBOARD__',
  SUPABASE_S3_SECRET_ACCESS_KEY: '__FILL_FROM_SUPABASE_DASHBOARD__',

  // File-size limits aren't in local .env either — stamp defaults.
  MAX_BRAND_ASSET_SIZE_MB: '50',
  MAX_AVATAR_SIZE_MB: '5',
  MAX_ATTACHMENT_SIZE_MB: '25',
}

// Vercel sets these on its own. Including them in env-vars confuses
// the build cache.
const VERCEL_AUTOSETS = new Set([
  'NODE_ENV',
  'VERCEL',
  'VERCEL_URL',
  'VERCEL_ENV',
  'VERCEL_REGION',
  'VERCEL_GIT_COMMIT_SHA',
])

// Variables that exist in .env.example for documentation but aren't
// actually read by the runtime — keep them out of Vercel.
const NOT_USED_AT_RUNTIME = new Set([
  'GOOGLE_REDIRECT_URI', // nuxt-auth-utils derives this from request host
  'DB_PASS', // commented-out helper in local .env
])

// ────────────────────────────────────────────────────────────
// Parse local .env (no dotenv dependency — keep this script
// dependency-free so it runs without `npm install`).
// ────────────────────────────────────────────────────────────
function parseEnv(raw) {
  const out = {}
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue
    let val = line.slice(eq + 1).trim()
    // Strip wrapping quotes (single or double)
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

if (!fs.existsSync(LOCAL_ENV_PATH)) {
  console.error(`error: ${LOCAL_ENV_PATH} not found. This script reads your local .env.`)
  process.exit(1)
}

const local = parseEnv(fs.readFileSync(LOCAL_ENV_PATH, 'utf8'))

// Merge: local first, overrides on top.
const merged = { ...local, ...OVERRIDES }
for (const k of [...VERCEL_AUTOSETS, ...NOT_USED_AT_RUNTIME]) delete merged[k]

// ────────────────────────────────────────────────────────────
// Format output. Quote values that contain whitespace, '#', or '"'.
// ────────────────────────────────────────────────────────────
function formatValue(v) {
  if (/^[A-Za-z0-9_\-:.\/+@=]+$/.test(v)) return v // safe unquoted
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// Group output for readability — mirrors the .env.production.example layout.
const GROUPS = [
  ['APP', ['NUXT_PUBLIC_APP_URL', 'NUXT_PUBLIC_APP_NAME']],
  ['SUPABASE', [
    'NUXT_PUBLIC_SUPABASE_URL',
    'NUXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_URL',
    'SUPABASE_JWT_SECRET',
  ]],
  ['GOOGLE OAUTH', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']],
  ['SESSION', ['SESSION_SECRET']],
  ['AI', [
    'GLM_API_KEY', 'GLM_API_BASE_URL', 'GLM_MODEL',
    'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_API_BASE_URL',
    'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
  ]],
  ['SUPABASE STORAGE (S3)', [
    'SUPABASE_S3_ACCESS_KEY_ID',
    'SUPABASE_S3_SECRET_ACCESS_KEY',
    'SUPABASE_S3_ENDPOINT',
    'SUPABASE_S3_REGION',
  ]],
  ['BUCKETS', [
    'SUPABASE_STORAGE_BUCKET_ASSETS',
    'SUPABASE_STORAGE_BUCKET_AVATARS',
    'SUPABASE_STORAGE_BUCKET_ATTACHMENTS',
    'NUXT_PUBLIC_STORAGE_CDN_URL',
    'MAX_BRAND_ASSET_SIZE_MB',
    'MAX_AVATAR_SIZE_MB',
    'MAX_ATTACHMENT_SIZE_MB',
  ]],
  ['EMAIL', ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_FROM_NAME']],
  ['RATE LIMITING', ['RATE_LIMIT_AI_REQUESTS_PER_MINUTE']],
]

const placeholderPatterns = [
  /^your-/i,
  /-here$/i,
  /^sk-?your/i,
  /^sk-ant-your/i,
  /^re_your/i,
  /^pk_test_your/i,
  /^sk_test_your/i,
  /^__FILL_/i,
  /^<.*>$/,
  /^noreply@yourdomain\.com$/i,
]

const isPlaceholder = (v) => placeholderPatterns.some((re) => re.test(v))

const lines = []
const placeholders = []
const seen = new Set()

lines.push(`# Floo·Content — production env (target: ${TARGET})`)
lines.push(`# Generated by scripts/build-prod-env.mjs at ${new Date().toISOString()}`)
lines.push(`# Bulk-upload: see comment block at the bottom of this file.`)
lines.push(`# DELETE THIS FILE AFTER UPLOADING — it contains real secrets.`)
lines.push('')

for (const [groupName, keys] of GROUPS) {
  lines.push(`# ── ${groupName} ─────────────────────────`)
  for (const k of keys) {
    if (!(k in merged)) continue
    seen.add(k)
    const v = merged[k]
    if (isPlaceholder(v)) placeholders.push(k)
    lines.push(`${k}=${formatValue(v)}`)
  }
  lines.push('')
}

// Catch any vars in local .env that we didn't slot into a group
const orphans = Object.keys(merged).filter((k) => !seen.has(k))
if (orphans.length) {
  lines.push(`# ── OTHER (uncategorized — review before uploading) ─`)
  for (const k of orphans) {
    const v = merged[k]
    if (isPlaceholder(v)) placeholders.push(k)
    lines.push(`${k}=${formatValue(v)}`)
  }
  lines.push('')
}

lines.push('# ───────────────────────────────────────────')
lines.push('# Bulk-upload to Vercel (run from the project root):')
lines.push('#')
lines.push('#   while IFS="=" read -r k v; do')
lines.push('#     [[ -z "$k" || "$k" =~ ^# ]] && continue')
lines.push('#     v="${v#\\\"}"; v="${v%\\\"}"')
lines.push(`#     printf '%s' "$v" | vercel env add "$k" ${TARGET}`)
lines.push('#   done < .env.production.filled')
lines.push('#')
lines.push('# Then delete this file:  rm .env.production.filled')
lines.push('# ───────────────────────────────────────────')

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', { mode: 0o600 })

// ────────────────────────────────────────────────────────────
// Report (no secrets in stdout — only key names)
// ────────────────────────────────────────────────────────────
const totalKeys = lines.filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l)).length

console.log(`✓ Wrote ${totalKeys} variables to ${path.relative(ROOT, OUT_PATH)} (target: ${TARGET})`)
console.log(`  Permissions: 0600 (owner read/write only)`)

if (placeholders.length) {
  console.log('')
  console.log(`⚠  ${placeholders.length} variable(s) still hold placeholder values — fill these in before uploading:`)
  for (const k of placeholders) console.log(`     - ${k}`)
}

console.log('')
console.log('Next steps:')
console.log(`  1. Open .env.production.filled and replace any placeholders`)
console.log(`  2. Bulk-upload (one line):`)
console.log(`       while IFS="=" read -r k v; do [[ -z "$k" || "$k" =~ ^# ]] && continue; v="\${v#\\"}"; v="\${v%\\"}"; printf '%s' "$v" | vercel env add "$k" ${TARGET}; done < .env.production.filled`)
console.log(`  3. Trigger a redeploy:  vercel --prod`)
console.log(`  4. Clean up:            rm .env.production.filled`)
