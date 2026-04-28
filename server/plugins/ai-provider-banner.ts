/**
 * Logs a one-line summary of which AI provider is active at server
 * startup. Saves you from having to curl `/api/health/ai` just to
 * confirm `.env` was picked up.
 *
 * Output looks like:
 *   [INFO] [ai/startup] active provider { provider: 'openai', model: 'gpt-4o-mini', forced: false }
 *
 * `forced: true` means `AI_PROVIDER` in `.env` overrode the legacy
 * first-key-wins resolution.
 */
import { pickProvider } from '~/server/utils/ai'
import { log } from '~/server/utils/logger'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const provider = pickProvider(config)
  const requested = String((config as any).aiProvider ?? '').toLowerCase()
  const forced = !!requested && requested !== 'auto'

  // Pull the model id we'd actually use so the line is self-contained.
  const model =
    provider === 'glm'
      ? config.glmModel
      : provider === 'openai'
        ? config.openaiModel
        : provider === 'anthropic'
          ? config.anthropicModel
          : 'mock'

  log.info('[ai/startup]', 'active provider', {
    provider,
    model,
    forced,
    aiProviderEnv: requested || '(unset)',
    hasGlm: !!config.glmApiKey,
    hasOpenAi: !!config.openaiApiKey,
    hasAnthropic: !!config.anthropicApiKey,
  })
})
