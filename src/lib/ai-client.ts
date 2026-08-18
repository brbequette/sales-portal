import OpenAI from 'openai'

export type AIProvider = 'ollama' | 'openai'

export interface AIClientConfig {
  client: OpenAI
  model: string
  provider: AIProvider
}

let cached: AIClientConfig | null = null

/**
 * Returns an OpenAI-compatible client. Ollama implements the subset of the
 * OpenAI API used by the portal, so callers do not need provider-specific code.
 */
export function getAIClient(): AIClientConfig {
  if (cached) return cached

  const requested = (process.env.AI_PROVIDER || 'openai').toLowerCase()
  if (requested === 'ollama') {
    cached = {
      client: new OpenAI({
        apiKey: 'ollama',
        baseURL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',
      }),
      model: process.env.AI_MODEL || 'qwen3:4b',
      provider: 'ollama',
    }
    return cached
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('No AI provider is configured. Set AI_PROVIDER=ollama or OPENAI_API_KEY.')
  }

  cached = {
    client: new OpenAI({ apiKey }),
    model: process.env.AI_MODEL || process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini',
    provider: 'openai',
  }
  return cached
}

export function isAIConfigured(): boolean {
  return (process.env.AI_PROVIDER || '').toLowerCase() === 'ollama' || Boolean(process.env.OPENAI_API_KEY)
}

