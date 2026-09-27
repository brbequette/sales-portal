// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const create = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({ default: class { chat = { completions: { create } } } }))
import { createAIChatCompletion } from '../src/lib/ai-client'

describe('caller-specific OpenAI model selection', () => {
  beforeEach(() => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('OPENAI_MODEL', 'configured-app-model')
    create.mockReset().mockResolvedValue({ choices: [] })
  })
  afterEach(() => vi.unstubAllEnvs())
  it('overrides only the requesting call and reports the actual selected model', async () => {
    const request = { messages: [{ role: 'user' as const, content: 'Hello' }] }
    const telegram = await createAIChatCompletion(request, { openAIModel: 'gpt-4.1' })
    expect(create.mock.calls[0][0].model).toBe('gpt-4.1')
    expect(telegram.model).toBe('gpt-4.1')
    const regular = await createAIChatCompletion(request)
    expect(create.mock.calls[1][0].model).toBe('configured-app-model')
    expect(regular.model).toBe('configured-app-model')
  })
  it('does not apply the OpenAI override to an Ollama candidate', async () => {
    vi.stubEnv('AI_PROVIDER', 'ollama')
    vi.stubEnv('OLLAMA_MODEL', 'configured-local-model')
    const result = await createAIChatCompletion({ messages: [] }, { openAIModel: 'gpt-4.1' })
    expect(create.mock.calls[0][0].model).toBe('configured-local-model')
    expect(result.provider).toBe('ollama')
  })
})
