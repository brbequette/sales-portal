import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAIChatCompletion, isAIConfigured } from '@/lib/ai-client'
import { checkAccountOwnership } from '@/lib/auth-helpers'

type SuggestionMessage = { direction?: string; body?: string }

export async function POST(req: Request) {
  try {
    if (!isAIConfigured()) {
      return NextResponse.json({ success: false, error: 'AI provider not configured' }, { status: 500 })
    }

    const { messages, accountId } = await req.json() as { messages?: SuggestionMessage[]; accountId?: string }

    if (!accountId) {
      return NextResponse.json({ success: false, error: 'Account is required' }, { status: 400 })
    }

    const access = await checkAccountOwnership(accountId)
    if (!access.authorized) return access.errorResponse

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: 'Messages array is required' }, { status: 400 })
    }

    // Get the prompt setting
    let systemPrompt = 'You are a helpful sales representative for Titan Diamond, a diamond wholesaler. Review the conversation history and suggest 3 short, professional, and friendly SMS text replies to continue the conversation. Return your response as a JSON array of 3 strings.'
    const promptSetting = await prisma.systemSetting.findUnique({ where: { key: 'ai_reply_prompt' } })
    if (promptSetting && promptSetting.value) {
      systemPrompt = promptSetting.value
    }

    // Format messages for AI completion
    const formattedMessages = messages.slice(-10).map(m => ({
      role: (m.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: (m.body || '').slice(0, 4000),
    }))

    // If the conversation ends with an outbound message (assistant), add a user-prompt asking for follow-up suggestions
    // to ensure the conversation turns do not end with a model/assistant turn (which Gemini and other providers reject with 400).
    const conversationMessages = [...formattedMessages]
    if (conversationMessages.length > 0 && conversationMessages[conversationMessages.length - 1].role === 'assistant') {
      conversationMessages.push({
        role: 'user',
        content: 'Please suggest 3 short follow-up or reply options based on the message thread above.',
      })
    }

    const { response: completion, provider, model } = await createAIChatCompletion({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt + ' IMPORTANT: You must return a JSON object with a single key suggestions containing an array of 3 string suggestions.' },
        ...conversationMessages
      ],
    })

    const rawResponse = completion.choices[0].message.content || '{}'
    let suggestions: string[] = []
    try {
      const parsed = JSON.parse(rawResponse) as { suggestions?: unknown }
      suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.filter((item): item is string => typeof item === 'string').slice(0, 3)
        : []
    } catch {
      console.error('Failed to parse AI response', rawResponse)
    }

    return NextResponse.json({ success: true, suggestions, ai: { provider, model } })
  } catch (error: unknown) {
    console.error('AI Suggestion Error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to generate suggestions' }, { status: 500 })
  }
}
