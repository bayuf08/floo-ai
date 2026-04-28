/**
 * REMOVED — auth is server-side via /api/auth/callback. There is no
 * browser→server token bridge anymore.
 */
export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage:
      '/api/auth/set-session is gone. Auth is now server-side via /api/auth/callback.',
  })
})
