/**
 * POST /api/auth/logout
 *
 * Clears the nuxt-auth-utils session cookie. The client is responsible
 * for the post-logout redirect to /login.
 */
import { log } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  const userId = (event.context.user as any)?.id
  await clearUserSession(event)
  log.info('[api/auth/logout]', 'Session cleared', { userId })
  return { ok: true }
})
