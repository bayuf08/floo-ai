/**
 * GET /api/health
 * Public liveness probe. Returns ok + a short set of feature flags so
 * uptime monitors and the frontend can sanity-check the backend.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  return {
    status: 'ok',
    time: new Date().toISOString(),
    features: {
      supabase: !!config.public.supabaseUrl && !!config.public.supabaseAnonKey,
      ai: !!config.glmApiKey || !!config.openaiApiKey || !!config.anthropicApiKey,
      ai_provider: config.glmApiKey ? 'glm' : config.openaiApiKey ? 'openai' : config.anthropicApiKey ? 'anthropic' : 'mock',
      email: !!config.resendApiKey,
      stripe: !!config.stripeSecretKey,
    },
  }
})
