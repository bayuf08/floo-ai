/**
 * AI client factory.
 *
 * Primary provider: GLM (ChatGLM / Zhipu AI). OpenAI and Anthropic are
 * optional fallbacks — the client picks the first provider with an API key
 * configured. All providers are called via their OpenAI-compatible REST
 * surface so the rest of the codebase doesn't need provider-specific code.
 */
import type { H3Event } from 'h3'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatTurn {
  role: ChatRole
  content: string
}

export interface AIRequest {
  messages: ChatTurn[]
  temperature?: number
  maxTokens?: number
}

export interface AIResponse {
  content: string
  provider: 'glm' | 'openai' | 'anthropic' | 'mock'
  model: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

/**
 * Generate a chat completion with the first configured provider.
 * If no provider keys are set, returns a deterministic mock response so
 * the app keeps working in dev without API credentials.
 */
export async function generateChat(event: H3Event, req: AIRequest): Promise<AIResponse> {
  const config = useRuntimeConfig(event)

  if (config.glmApiKey) return callGlm(config, req)
  if (config.openaiApiKey) return callOpenAI(config, req)
  if (config.anthropicApiKey) return callAnthropic(config, req)

  return mockResponse(req)
}

// ─── GLM (Zhipu AI) ──────────────────────────────────────────
async function callGlm(config: any, req: AIRequest): Promise<AIResponse> {
  const baseUrl = (config.glmApiBaseUrl ?? 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '')
  const model = config.glmModel ?? 'glm-4-flash'

  const res = await $fetch<any>(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.glmApiKey}`,
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
    provider: 'glm',
    model,
    usage: {
      promptTokens: res?.usage?.prompt_tokens,
      completionTokens: res?.usage?.completion_tokens,
      totalTokens: res?.usage?.total_tokens,
    },
  }
}

// ─── OpenAI ──────────────────────────────────────────────────
async function callOpenAI(config: any, req: AIRequest): Promise<AIResponse> {
  const baseUrl = (config.openaiApiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = config.openaiModel ?? 'gpt-4o-mini'

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
async function callAnthropic(config: any, req: AIRequest): Promise<AIResponse> {
  const model = config.anthropicModel ?? 'claude-sonnet-4-20250514'

  // Anthropic uses a separate `system` field instead of role: 'system'.
  const systemTurns = req.messages.filter((m) => m.role === 'system')
  const dialogTurns = req.messages.filter((m) => m.role !== 'system')

  const res = await $fetch<any>('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: {
      model,
      system: systemTurns.map((s) => s.content).join('\n\n') || undefined,
      messages: dialogTurns.map((m) => ({ role: m.role, content: m.content })),
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
  const last = req.messages.findLast((m) => m.role === 'user')?.content ?? ''
  return {
    content:
      `[mock response — no AI provider configured]\n\n` +
      `Floo would respond here using project rules + active skills + brand assets.\n` +
      `You sent: ${last.slice(0, 200)}${last.length > 200 ? '…' : ''}`,
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
  req: AIRequest
): AsyncGenerator<string, AIResponse, void> {
  const config = useRuntimeConfig(event as any)

  if (config.glmApiKey) {
    return yield* streamOpenAICompat(
      `${(config.glmApiBaseUrl ?? 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '')}/chat/completions`,
      config.glmApiKey,
      config.glmModel ?? 'glm-4-flash',
      req,
      'glm'
    )
  }
  if (config.openaiApiKey) {
    return yield* streamOpenAICompat(
      `${(config.openaiApiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
      config.openaiApiKey,
      config.openaiModel ?? 'gpt-4o-mini',
      req,
      'openai'
    )
  }
  // Anthropic streaming differs enough to skip for now — fall through to mock.
  if (config.anthropicApiKey) {
    const non = await callAnthropic(config, req)
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
  provider: 'glm' | 'openai'
): AsyncGenerator<string, AIResponse, void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2048,
      stream: true,
    }),
  })

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    throw new Error(`AI provider error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

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
      if (payload === '[DONE]') return { content: full, provider, model }
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          full += delta
          yield delta
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return { content: full, provider, model }
}
