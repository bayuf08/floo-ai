/**
 * REMOVED — single OAuth entry point lives at /api/auth/callback now.
 *
 * If something stale still POSTs here, return 410 with a clear pointer
 * rather than silently 404-ing.
 */
export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage:
      'POST /api/auth/login/google is gone. Navigate to GET /api/auth/callback to start the OAuth flow.',
  })
})
