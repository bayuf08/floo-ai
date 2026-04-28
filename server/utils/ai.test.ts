import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { AIProviderError, __testCallGlm as callGlm } from './ai'

type FetchCall = { url: string; init: RequestInit | undefined }
let fetchCalls: FetchCall[] = []
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>

const originalFetch = globalThis.fetch
beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = ((url: any, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init })
    return fetchImpl(String(url), init)
  }) as typeof fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const baseConfig = {
  glmApiKey: 'test-key',
  glmApiBaseUrl: 'https://api.z.ai/api/paas/v4',
  glmModel: 'glm-4.5',
  glmEnableWebSearch: true,
}

describe('callGlm — modelOverride propagation', () => {
  test.each(['glm-4.5', 'glm-4-plus', 'glm-4-air', 'glm-4.5-flash'])(
    'sends model=%s to GLM when modelOverride is set',
    async (model: string) => {
      fetchImpl = async () =>
        jsonResponse({ choices: [{ message: { content: 'ok' } }], usage: {} })
      const out = await callGlm(
        baseConfig,
        { messages: [{ role: 'user', content: 'hi' }] },
        { modelOverride: model }
      )
      const sent = JSON.parse((fetchCalls[0]!.init!.body as string))
      expect(sent.model).toBe(model)
      expect(out.model).toBe(model)
    }
  )

  test('falls back to config.glmModel when no override is given', async () => {
    fetchImpl = async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }], usage: {} })
    await callGlm(
      baseConfig,
      { messages: [{ role: 'user', content: 'hi' }] },
      {}
    )
    const sent = JSON.parse((fetchCalls[0]!.init!.body as string))
    expect(sent.model).toBe('glm-4.5')
  })
})

describe('callGlm — webSearch tool', () => {
  test('webSearch=true adds the web_search tool to the request body', async () => {
    fetchImpl = async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }], usage: {} })
    await callGlm(
      baseConfig,
      { messages: [{ role: 'user', content: 'hi' }] },
      { webSearch: true }
    )
    const sent = JSON.parse((fetchCalls[0]!.init!.body as string))
    expect(Array.isArray(sent.tools)).toBe(true)
    expect(sent.tools[0].type).toBe('web_search')
  })

  test('webSearch=false omits tools entirely', async () => {
    fetchImpl = async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }], usage: {} })
    await callGlm(
      baseConfig,
      { messages: [{ role: 'user', content: 'hi' }] },
      { webSearch: false }
    )
    const sent = JSON.parse((fetchCalls[0]!.init!.body as string))
    expect(sent.tools).toBeUndefined()
  })

  test('citations are extracted from web_search results', async () => {
    fetchImpl = async () =>
      jsonResponse({
        choices: [{ message: { content: 'ok' } }],
        web_search: [
          { title: 'a', link: 'https://example.com/a', content: 'snippet a' },
          { title: 'b', link: 'https://example.com/b' },
        ],
      })
    const out = await callGlm(
      baseConfig,
      { messages: [{ role: 'user', content: 'hi' }] },
      { webSearch: true }
    )
    expect(out.citations?.length).toBe(2)
    expect(out.citations?.[0]?.url).toBe('https://example.com/a')
  })
})

describe('callGlm — error handling', () => {
  test('non-2xx with JSON error body throws AIProviderError with parsed message', async () => {
    fetchImpl = async () =>
      jsonResponse({ error: { message: "model 'glm-foo' not found" } }, 400)
    let caught: unknown = null
    try {
      await callGlm(
        baseConfig,
        { messages: [{ role: 'user', content: 'hi' }] },
        { modelOverride: 'glm-foo' }
      )
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AIProviderError)
    const err = caught as AIProviderError
    expect(err.status).toBe(400)
    expect(err.providerMessage).toContain("model 'glm-foo' not found")
    expect(err.model).toBe('glm-foo')
    expect(err.provider).toBe('glm')
  })

  test('non-2xx with plain-text body throws AIProviderError with raw text', async () => {
    fetchImpl = async () =>
      new Response('upstream timeout', { status: 504 })
    let caught: unknown = null
    try {
      await callGlm(
        baseConfig,
        { messages: [{ role: 'user', content: 'hi' }] },
        {}
      )
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AIProviderError)
    expect((caught as AIProviderError).status).toBe(504)
    expect((caught as AIProviderError).providerMessage).toContain('upstream timeout')
  })
})
