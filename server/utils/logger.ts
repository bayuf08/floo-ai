/**
 * Server-side file logger.
 *
 * Writes timestamped JSON lines to logs/app.log (relative to project root).
 * The logs/ directory is git-ignored. Use this for debugging server routes.
 *
 * Usage:
 *   import { log } from '~/server/utils/logger'
 *   log.info('[auth/callback]', 'code exchanged', { userId })
 *   log.error('[auth/login]', 'signInWithOAuth failed', error)
 */

import fs from 'node:fs'
import path from 'node:path'

const LOG_DIR = path.resolve(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function write(level: string, context: string, message: string, data?: unknown) {
  try {
    ensureLogDir()
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      context,
      message,
      ...(data !== undefined ? { data } : {}),
    })
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch {
    // Never crash the request because of a logging failure
  }

  // Also mirror to the Nuxt dev console
  const prefix = `[${level.toUpperCase()}] ${context}`
  if (level === 'error') {
    console.error(prefix, message, data ?? '')
  } else {
    console.log(prefix, message, data ?? '')
  }
}

export const log = {
  info:  (context: string, message: string, data?: unknown) => write('info',  context, message, data),
  warn:  (context: string, message: string, data?: unknown) => write('warn',  context, message, data),
  error: (context: string, message: string, data?: unknown) => write('error', context, message, data),
  debug: (context: string, message: string, data?: unknown) => write('debug', context, message, data),
}
