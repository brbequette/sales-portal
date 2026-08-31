import OpenAI from 'openai'
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'

export type AIProvider = 'ollama' | 'openai'
export type AIProviderPreference = AIProvider | 'auto'

export interface AIClientConfig {
  client: OpenAI
  model: string
  provider: AIProvider
}

export interface AICompletionResult {
  response: ChatCompletion
  provider: AIProvider
  model: string
}

let cached: AIClientConfig | null = null

export function getOpenAIApiKey(): string {
  const value = String(process.env.OPENAI_API_KEY || '').trim()
  const wrapped = (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  return wrapped ? value.slice(1, -1).trim() : value
}

function ollamaConfig(): AIClientConfig {
  return {
    client: new OpenAI({
      apiKey: 'ollama',
      baseURL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',
      // User-facing routes provide their own provider fallback. Retrying the
      // same local request can otherwise turn a 20-second timeout into a
      // minute-long UI stall while monopolizing the single Ollama slot.
      maxRetries: 0,
    }),
    model: process.env.OLLAMA_MODEL || process.env.AI_MODEL || 'qwen3:4b',
    provider: 'ollama',
  }
}

function openAIConfig(): AIClientConfig | null {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) return null
  return {
    client: new OpenAI({ apiKey, maxRetries: 0 }),
    model: process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
    provider: 'openai',
  }
}

/**
 * Ordered provider candidates for resilient AI jobs. In auto mode, inexpensive
 * local inference runs first and OpenAI is retained as an optional fallback.
 */
export function getAIClientCandidates(): AIClientConfig[] {
  const requested = (process.env.AI_PROVIDER || 'auto').toLowerCase() as AIProviderPreference
  const openai = openAIConfig()

  if (requested === 'openai') {
    if (!openai) throw new Error('OPENAI_API_KEY is not configured.')
    return [openai]
  }

  if (requested === 'ollama') return [ollamaConfig()]
  return [ollamaConfig(), ...(openai ? [openai] : [])]
}

/**
 * Returns an OpenAI-compatible client. Ollama implements the subset of the
 * OpenAI API used by the portal, so callers do not need provider-specific code.
 */
export function getAIClient(): AIClientConfig {
  if (cached) return cached
  cached = getAIClientCandidates()[0]
  return cached
}

export function isAIConfigured(): boolean {
  const provider = (process.env.AI_PROVIDER || 'auto').toLowerCase()
  return provider === 'ollama' || provider === 'auto' || Boolean(getOpenAIApiKey())
}

export function getAIProviderStatus() {
  const preference = (process.env.AI_PROVIDER || 'auto').toLowerCase() as AIProviderPreference
  const candidates = getAIClientCandidates()
  return {
    preference,
    providers: candidates.map(({ provider, model }) => ({ provider, model })),
    fallbackEnabled: candidates.length > 1,
  }
}

/**
 * Normalizes and sanitizes chat messages for broad provider compatibility (OpenAI, Gemini, Ollama, Anthropic).
 * Google Gemini / OpenAI-compatible gateways reject requests ending with a model/assistant turn with HTTP 400.
 */
export function sanitizeMessagesForAI<T extends { role?: string; content?: any }>(
  rawMessages: T[]
): T[] {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) return []

  const result: T[] = [...rawMessages]

  // If the last message is from the assistant/model, append a user prompt to continue or summarize
  const lastMsg = result[result.length - 1]
  if (lastMsg && (lastMsg.role === 'assistant' || lastMsg.role === 'model')) {
    result.push({
      role: 'user',
      content: 'Please proceed.',
    } as unknown as T)
  }

  return result
}

/**
 * Runs a chat completion through the configured provider chain. Local models
 * have a shorter deadline so slow hardware cannot stall user-facing work.
 */
export async function createAIChatCompletion(
  request: Omit<ChatCompletionCreateParamsNonStreaming, 'model'>,
): Promise<AICompletionResult> {
  const candidates = getAIClientCandidates()
  const errors: string[] = []

  const sanitizedMessages = sanitizeMessagesForAI(request.messages as any[])
  const sanitizedRequest = {
    ...request,
    messages: sanitizedMessages,
  }

  for (const candidate of candidates) {
    const timeout = candidate.provider === 'ollama'
      ? Number(process.env.OLLAMA_TIMEOUT_MS || 20000)
      : Number(process.env.OPENAI_TIMEOUT_MS || 45000)
    try {
      const response = await candidate.client.chat.completions.create(
        { ...sanitizedRequest, model: candidate.model } as any,
        { timeout },
      )
      return { response, provider: candidate.provider, model: candidate.model }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${candidate.provider}: ${message}`)
    }
  }

  throw new Error(`All configured AI providers failed. ${errors.join(' | ')}`)
}
