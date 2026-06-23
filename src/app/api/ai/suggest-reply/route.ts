import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import prisma from '@/lib/prisma'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy'
})

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const { messages, accountId } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ success: false, error: 'Messages array is required' }, { status: 400 })
    }

    // Get the prompt setting
    let systemPrompt = 'You are a helpful sales representative for Titan Diamond, a diamond wholesaler. Review the conversation history and suggest 3 short, professional, and friendly SMS text replies to continue the conversation. Return your response as a JSON array of 3 strings.'
    const promptSetting = await prisma.systemSetting.findUnique({ where: { key: 'ai_reply_prompt' } })
    if (promptSetting && promptSetting.value) {
      systemPrompt = promptSetting.value
    }

    // Format messages for OpenAI
    const formattedMessages = messages.map((m: any) => ({
      role: m.direction === 'INBOUND' ? 'user' : 'assistant',
      content: m.body
    }))

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt + ' IMPORTANT: You must return a JSON object with a single key suggestions containing an array of 3 string suggestions.' },
        ...formattedMessages
      ],
    })

    const rawResponse = completion.choices[0].message.content || '{}'
    let suggestions = []
    try {
      const parsed = JSON.parse(rawResponse)
      suggestions = parsed.suggestions || []
    } catch (e) {
      console.error('Failed to parse AI response', rawResponse)
    }

    return NextResponse.json({ success: true, suggestions })
  } catch (error: any) {
    console.error('AI Suggestion Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
