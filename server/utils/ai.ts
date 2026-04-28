/**
 * AI client factory.
 *
 * Primary provider: GLM (ChatGLM / Zhipu AI / Z.ai). OpenAI and Anthropic are
 * optional fallbacks — the client picks the first provider with an API key
 * configured. All providers are called via their OpenAI-compatible REST
 * surface so the rest of the codebase doesn't need provider-specific code.
 *
 * Capabilities:
 *   - generateChat()    — text completion (single shot)
 *   - streamChat()      — SSE streaming chat
 *   - generateImage()   — CogView-3 image generation (GLM only)
 *   - Multimodal input  — pass image_url parts in `content` for vision
 *   - Web-search tool   — opt-in via opts.webSearch (research/competitor/trend modes)
 */
import type { H3Event } from 'h3'
import { log } from './logger'

export type ChatRole = 'system' | 'user' | 'assistant'

/** Multimodal content part. String shorthand also allowed for plain text. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatTurn {
  role: ChatRole
  content: string | ContentPart[]
}

export interface AIRequest {
  messages: ChatTurn[]
  temperature?: number
  maxTokens?: number
}

export interface AIRequestOptions {
  /** Force a specific model (overrides config default for the chosen provider). */
  modelOverride?: string
  /** Enable provider-side web search grounding (GLM web_search tool). */
  webSearch?: boolean
  /** Force vision-capable model (when messages contain image_url parts). */
  vision?: boolean
}

export interface AIResponse {
  content: string
  provider: 'glm' | 'openai' | 'anthropic' | 'mock'
  model: string
  /** Web-search citations returned by the provider, if any. */
  citations?: Array<{ title?: string; url?: string; snippet?: string }>
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

export interface ImageRequest {
  prompt: string
  n?: number
  size?: string // e.g. '1024x1024'
  quality?: 'standard' | 'hd'
}

export interface ImageResponse {
  images: Array<{ url: string; prompt: string; size: string }>
  provider: 'glm' | 'openai' | 'mock'
  model: string
}

/**
 * Returns whether a provider can produce real images directly.
 *   - 'glm'       → CogView-3 via /images/generations
 *   - 'openai'    → gpt-image-1 via /images/generations
 *   - 'anthropic' → no image gen (fall back to text-based concept cards)
 *   - 'mock'      → returns a placeholder PNG (still "supports" generation)
 *
 * Used by the image-mode endpoint to decide between calling generateImage()
 * vs routing through the text chat flow (which produces 3 numbered concept
 * cards instead of pixels).
 */
export function providerSupportsImageGen(provider: ResolvedProvider): boolean {
  return provider === 'glm' || provider === 'openai' || provider === 'mock'
}

/**
 * Thrown by AI provider client functions on non-2xx responses. Carries the
 * upstream HTTP status and the parsed provider error message so callers can
 * surface an actionable detail to the user (e.g. "model 'glm-foo' not found")
 * instead of a generic "AI provider failed".
 */
export class AIProviderError extends Error {
  constructor(
    public status: number,
    public providerMessage: string,
    public model: string,
    public provider: 'glm' | 'openai' | 'anthropic'
  ) {
    super(`${provider} ${status}: ${providerMessage}`)
    this.name = 'AIProviderError'
  }
}

/**
 * Resolve which provider to use for this call.
 *
 * Resolution order:
 *   1. `AI_PROVIDER` env var (case-insensitive). If it names a provider
 *      whose key is also configured, that wins — even if other keys are
 *      present. If it names a provider whose key is NOT configured, we
 *      fall through to (2) and log a warning so the misconfig is visible.
 *   2. Legacy first-key-wins: GLM → OpenAI → Anthropic.
 *   3. `mock` if nothing is configured.
 */
export type ResolvedProvider = 'glm' | 'openai' | 'anthropic' | 'mock'

export function pickProvider(config: any): ResolvedProvider {
  const requested = String(config.aiProvider ?? '').toLowerCase()
  if (requested && requested !== 'auto') {
    if (requested === 'glm' && config.glmApiKey) return 'glm'
    if (requested === 'openai' && config.openaiApiKey) return 'openai'
    if (requested === 'anthropic' && config.anthropicApiKey) return 'anthropic'
    // Misconfig: AI_PROVIDER names a provider whose key isn't set. Don't
    // crash — fall through to auto-detect — but make it loud.
    log.warn('[ai/pickProvider]', 'AI_PROVIDER set but matching key missing', {
      requested,
      hasGlm: !!config.glmApiKey,
      hasOpenAi: !!config.openaiApiKey,
      hasAnthropic: !!config.anthropicApiKey,
    })
  }
  if (config.glmApiKey) return 'glm'
  if (config.openaiApiKey) return 'openai'
  if (config.anthropicApiKey) return 'anthropic'
  return 'mock'
}

/**
 * Generate a chat completion with the resolved provider.
 * If no provider keys are set, returns a deterministic mock response so
 * the app keeps working in dev without API credentials.
 */
export async function generateChat(
  event: H3Event,
  req: AIRequest,
  opts: AIRequestOptions = {}
): Promise<AIResponse> {
  const config = useRuntimeConfig(event)
  const provider = pickProvider(config)

  if (provider === 'glm')       return callGlm(config, req, opts)
  if (provider === 'openai')    return callOpenAI(config, req, opts)
  if (provider === 'anthropic') return callAnthropic(config, req, opts)
  return mockResponse(req)
}

// ─── GLM (Z.ai / Zhipu AI) ──────────────────────────────────
async function callGlm(
  config: any,
  req: AIRequest,
  opts: AIRequestOptions
): Promise<AIResponse> {
  const baseUrl = (config.glmApiBaseUrl ?? 'https://api.z.ai/api/paas/v4').replace(/\/$/, '')
  const model =
    opts.modelOverride ??
    (opts.vision ? config.glmVisionModel ?? 'glm-4v-plus' : config.glmModel ?? 'glm-4.5')

  const body: any = {
    model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 2048,
  }

  if (opts.webSearch && config.glmEnableWebSearch !== false) {
    body.tools = [
      {
        type: 'web_search',
        // `search_engine` is required by the z.ai spec — sending the
        // tool without it triggers a 400 validation error. The other
        // fields are optional and use safe defaults; tweak via env
        // later if we want recency filters or domain scoping.
        web_search: {
          search_engine: 'search_pro_jina',
          enable: true,
          search_result: true,
        },
      },
    ]
  }

  const startedAt = Date.now()
  const httpRes = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.glmApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!httpRes.ok) {
    const text = await httpRes.text().catch(() => '')
    let providerMessage = text || `HTTP ${httpRes.status}`
    try {
      const j = JSON.parse(text)
      providerMessage = j?.error?.message ?? j?.message ?? j?.error ?? providerMessage
    } catch { /* keep raw text */ }
    // Persist a single line to logs/app.log with everything we'd need to
    // diagnose without the client involved (status, model, tools used,
    // upstream message). Bodies are NOT logged — they can contain user
    // content. If we ever need that, gate it behind FLOO_LOG_PROMPTS=1.
    log.error('[ai/glm]', 'GLM rejected the request', {
      status: httpRes.status,
      model,
      webSearch: Boolean(body.tools),
      latencyMs: Date.now() - startedAt,
      providerMessage: String(providerMessage).slice(0, 500),
    })
    throw new AIProviderError(httpRes.status, String(providerMessage).slice(0, 500), model, 'glm')
  }

  const res = (await httpRes.json()) as any
  const choice = res?.choices?.[0]
  return {
    content: choice?.message?.content ?? '',
    provider: 'glm',
    model,
    citations: extractGlmCitations(res),
    usage: {
      promptTokens: res?.usage?.prompt_tokens,
      completionTokens: res?.usage?.completion_tokens,
      totalTokens: res?.usage?.total_tokens,
    },
  }
}

/**
 * Z.ai returns web search results in `web_search` (top-level) when the
 * web_search tool is invoked. Normalize them into the shared citation shape.
 */
function extractGlmCitations(
  res: any
): Array<{ title?: string; url?: string; snippet?: string }> | undefined {
  const ws = res?.web_search ?? res?.choices?.[0]?.message?.web_search
  if (!Array.isArray(ws) || !ws.length) return undefined
  return ws
    .map((c: any) => ({
      title: c.title ?? c.refer ?? undefined,
      url: c.link ?? c.url ?? undefined,
      snippet: c.content ?? c.snippet ?? undefined,
    }))
    .filter((c: any) => c.url || c.title)
}

// ─── OpenAI ──────────────────────────────────────────────────
async function callOpenAI(
  config: any,
  req: AIRequest,
  opts: AIRequestOptions
): Promise<AIResponse> {
  const baseUrl = (config.openaiApiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = opts.modelOverride ?? config.openaiModel ?? 'gpt-4o-mini'

  const res = await $fetch<any>(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2048,
    },
  })

  const choice = res?.choices?.[0]
  return {
    content: choice?.message?.content ?? '',
    provider: 'openai',
    model,
    usage: {
      promptTokens: res?.usage?.prompt_tokens,
      completionTokens: res?.usage?.completion_tokens,
      totalTokens: res?.usage?.total_tokens,
    },
  }
}

// ─── Anthropic ───────────────────────────────────────────────
async function callAnthropic(
  config: any,
  req: AIRequest,
  opts: AIRequestOptions
): Promise<AIResponse> {
  const model = opts.modelOverride ?? config.anthropicModel ?? 'claude-sonnet-4-20250514'

  // Anthropic uses a separate `system` field instead of role: 'system'.
  const systemTurns = req.messages.filter((m) => m.role === 'system')
  const dialogTurns = req.messages.filter((m) => m.role !== 'system')

  // Anthropic content is either a string or an array of {type:text|image}. For
  // simplicity we serialize image_url parts as text mentions ("[image attached]")
  // when falling back to Anthropic — full vision support requires base64 conversion.
  const flatten = (c: ChatTurn['content']): string => {
    if (typeof c === 'string') return c
    return c
      .map((p) => (p.type === 'text' ? p.text : '[image attached]'))
      .join('\n')
  }

  const res = await $fetch<any>('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: {
      model,
      system: systemTurns.map((s) => flatten(s.content)).join('\n\n') || undefined,
      messages: dialogTurns.map((m) => ({ role: m.role, content: flatten(m.content) })),
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
    },
  })

  const text = (res?.content ?? []).map((b: any) => b.text ?? '').join('')
  return {
    content: text,
    provider: 'anthropic',
    model,
    usage: {
      promptTokens: res?.usage?.input_tokens,
      completionTokens: res?.usage?.output_tokens,
      totalTokens: (res?.usage?.input_tokens ?? 0) + (res?.usage?.output_tokens ?? 0),
    },
  }
}

// ─── Mock fallback (no API key configured) ───────────────────
function mockResponse(req: AIRequest): AIResponse {
  const last = req.messages.findLast((m) => m.role === 'user')
  const lastText = lastTextOf(last?.content)
  return {
    content:
      `[mock response — no AI provider configured]\n\n` +
      `Floo would respond here using project rules + active skills + brand assets.\n` +
      `You sent: ${lastText.slice(0, 200)}${lastText.length > 200 ? '…' : ''}`,
    provider: 'mock',
    model: 'mock',
  }
}

function lastTextOf(content: ChatTurn['content'] | undefined): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content.filter((p) => p.type === 'text').map((p: any) => p.text).join(' ')
}

// ─── Image generation ────────────────────────────────────────
// GLM   → CogView-3 via z.ai  /images/generations
// OpenAI → gpt-image-1   via api.openai.com /images/generations  (returns base64)
// Other  → mock PNG so the UI keeps rendering
export async function generateImage(
  event: H3Event,
  req: ImageRequest
): Promise<ImageResponse> {
  const config = useRuntimeConfig(event)
  const provider = pickProvider(config)

  if (provider === 'glm' && config.glmApiKey) {
    return callGlmImage(config, req)
  }
  if (provider === 'openai' && config.openaiApiKey) {
    return callOpenAIImage(config, req)
  }
  // Anthropic + no-key + any other case: placeholder. The image-mode
  // endpoint should detect this with providerSupportsImageGen() and route
  // through the text-card flow instead.
  return mockImageResponse(req)
}

async function callGlmImage(config: any, req: ImageRequest): Promise<ImageResponse> {
  const baseUrl = (config.glmApiBaseUrl ?? 'https://api.z.ai/api/paas/v4').replace(/\/$/, '')
  const model = config.glmImageModel ?? 'cogview-3-flash'
  const size = req.size ?? '1024x1024'

  const res = await $fetch<any>(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.glmApiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      prompt: req.prompt,
      size,
      // CogView-3 currently returns one image per call; loop client-side for n>1.
      // Some endpoints accept `n` — passthrough so future model upgrades work.
      ...(req.n && req.n > 1 ? { n: req.n } : {}),
      ...(req.quality ? { quality: req.quality } : {}),
    },
  })

  const data = Array.isArray(res?.data) ? res.data : []
  const images = data
    .map((d: any) => d.url)
    .filter((u: any) => typeof u === 'string')
    .map((url: string) => ({ url, prompt: req.prompt, size }))

  if (!images.length && typeof res?.data?.[0]?.b64_json === 'string') {
    images.push({
      url: `data:image/png;base64,${res.data[0].b64_json}`,
      prompt: req.prompt,
      size,
    })
  }

  return { images, provider: 'glm', model }
}

/**
 * OpenAI gpt-image-1 image generation.
 *
 * gpt-image-1 always returns base64 (no `response_format` opt-in needed). It
 * accepts `n` natively, so we make a single call. Sizes are restricted to
 * 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape) — we map our
 * existing 768x1024 / 1024x768 contract to the closest gpt-image-1 size.
 *
 * Reference: https://platform.openai.com/docs/api-reference/images/create
 */
async function callOpenAIImage(config: any, req: ImageRequest): Promise<ImageResponse> {
  const baseUrl = ((config.openaiApiBaseUrl as string | undefined) ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = (config.openaiImageModel as string | undefined) ?? 'gpt-image-1'

  // Map our generic sizes to gpt-image-1's allowed values.
  const requested = req.size ?? '1024x1024'
  const size =
    requested === '768x1024' ? '1024x1536'
    : requested === '1024x768' ? '1536x1024'
    : '1024x1024'

  const res = await $fetch<any>(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      prompt: req.prompt,
      size,
      n: req.n ?? 1,
      // gpt-image-1 supports quality: 'low' | 'medium' | 'high' | 'auto'.
      // Map our 'standard' | 'hd' contract.
      ...(req.quality === 'hd' ? { quality: 'high' } : req.quality ? { quality: 'medium' } : {}),
    },
  })

  const data = Array.isArray(res?.data) ? res.data : []
  const images: Array<{ url: string; prompt: string; size: string }> = []

  for (const d of data) {
    if (typeof d?.url === 'string') {
      images.push({ url: d.url, prompt: req.prompt, size })
    } else if (typeof d?.b64_json === 'string') {
      images.push({
        url: `data:image/png;base64,${d.b64_json}`,
        prompt: req.prompt,
        size,
      })
    }
  }

  return { images, provider: 'openai', model }
}

function mockImageResponse(req: ImageRequest): ImageResponse {
  // 1×1 transparent PNG so the UI has *something* to render in dev mock mode.
  const placeholder =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='
  return {
    images: Array.from({ length: req.n ?? 1 }, () => ({
      url: placeholder,
      prompt: req.prompt,
      size: req.size ?? '1024x1024',
    })),
    provider: 'mock',
    model: 'mock',
  }
}

// ─── Streaming (SSE-style token stream) ──────────────────────
//
// `streamChat` returns an async iterable of text chunks. The caller pipes them
// into a Server-Sent Events response. We use OpenAI-compatible streaming for
// GLM and OpenAI (delta.content); Anthropic uses its own SSE shape; mock
// streams the canned response one word at a time.

export async function* streamChat(
  event: H3EventLike,
  req: AIRequest,
  opts: AIRequestOptions = {}
): AsyncGenerator<string, AIResponse, void> {
  const config = useRuntimeConfig(event as any)
  const provider = pickProvider(config)

  if (provider === 'glm') {
    const model =
      opts.modelOverride ??
      (opts.vision ? config.glmVisionModel ?? 'glm-4v-plus' : config.glmModel ?? 'glm-4.5')
    return yield* streamOpenAICompat(
      `${(config.glmApiBaseUrl ?? 'https://api.z.ai/api/paas/v4').replace(/\/$/, '')}/chat/completions`,
      config.glmApiKey,
      model,
      req,
      'glm',
      // streamOpenAICompat takes `boolean`; opts.webSearch is `boolean | undefined`.
      Boolean(opts.webSearch) && config.glmEnableWebSearch !== false
    )
  }
  if (provider === 'openai') {
    return yield* streamOpenAICompat(
      // The runtimeConfig type for openaiApiBaseUrl loses its way through
      // useRuntimeConfig's deep inference and ends up as `{}`, so we cast
      // explicitly here (the GLM branch above did not need it because the
      // ?? default is wrapped slightly differently).
      `${((config.openaiApiBaseUrl as string | undefined) ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
      config.openaiApiKey,
      opts.modelOverride ?? config.openaiModel ?? 'gpt-4o-mini',
      req,
      'openai',
      // OpenAI's chat-completions API does NOT accept the GLM-shape
      // web_search tool. Force false to avoid a 400 on research mode.
      false
    )
  }
  // Anthropic streaming differs enough to skip for now — fall through to non-stream.
  if (provider === 'anthropic') {
    const non = await callAnthropic(config, req, opts)
    yield non.content
    return non
  }

  // Mock streaming — chunk out the canned response word-by-word
  const non = mockResponse(req)
  for (const chunk of non.content.split(/(\s+)/)) {
    yield chunk
    await new Promise((r) => setTimeout(r, 30))
  }
  return non
}

type H3EventLike = { node: any; context: any } | any

/** Stream from any OpenAI-compatible /chat/completions endpoint. */
async function* streamOpenAICompat(
  url: string,
  apiKey: string,
  model: string,
  req: AIRequest,
  provider: 'glm' | 'openai',
  webSearch: boolean
): AsyncGenerator<string, AIResponse, void> {
  const body: any = {
    model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 2048,
    stream: true,
  }
  if (webSearch) {
    body.tools = [
      {
        type: 'web_search',
        // See callGlm() — `search_engine` is required by the z.ai spec.
        web_search: {
          search_engine: 'search_pro_jina',
          enable: true,
          search_result: true,
        },
      },
    ]
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    let providerMessage = errText || `HTTP ${res.status}`
    try {
      const j = JSON.parse(errText)
      providerMessage = j?.error?.message ?? j?.message ?? j?.error ?? providerMessage
    } catch { /* keep raw text */ }
    log.error(`[ai/${provider}/stream]`, 'streaming endpoint rejected request', {
      status: res.status,
      model,
      webSearch,
      providerMessage: String(providerMessage).slice(0, 500),
    })
    throw new AIProviderError(
      res.status,
      String(providerMessage).slice(0, 500),
      model,
      provider
    )
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let citations: AIResponse['citations']

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return { content: full, provider, model, citations }
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          full += delta
          yield delta
        }
        // GLM may attach web_search results on the final chunk.
        const webHits = json?.web_search ?? json?.choices?.[0]?.delta?.web_search
        if (Array.isArray(webHits) && webHits.length) {
          citations = webHits
            .map((c: any) => ({
              title: c.title ?? c.refer,
              url: c.link ?? c.url,
              snippet: c.content ?? c.snippet,
            }))
            .filter((c: any) => c.url || c.title)
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return { content: full, provider, model, citations }
}

// Test-only export — keeps the public surface (generateChat) clean while
// letting bun:test pin the GLM client wiring directly.
export const __testCallGlm = callGlm
