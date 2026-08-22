import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAIChatCompletion, isAIConfigured } from '@/lib/ai-client'
import { checkAccountOwnership } from '@/lib/auth-helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    
    const call = await prisma.callLog.findUnique({ where: { id } })
    if (!call) return NextResponse.json({ success: false, error: 'Call not found' }, { status: 404 })

    const access = await checkAccountOwnership(call.accountId)
    if (!access.authorized) return access.errorResponse

    let aiSentiment = 'Neutral'
    let aiSummary = 'No transcript is available, so this call could not be analyzed.'

    if (isAIConfigured() && call.transcript?.trim()) {
      try {
         const { response: completion } = await createAIChatCompletion({
            messages: [
               { role: "system", content: "Return JSON with sentiment (Positive, Negative, or Neutral) and a concise summary. Never invent details that are not supplied." },
               { role: "user", content: call.transcript.slice(0, 30000) }
            ],
            response_format: { type: "json_object" }
         })
         
         const result = JSON.parse(completion.choices[0].message.content || '{}') as { sentiment?: unknown; summary?: unknown }
         if (result.sentiment === 'Positive' || result.sentiment === 'Negative' || result.sentiment === 'Neutral') aiSentiment = result.sentiment
         if (typeof result.summary === 'string' && result.summary.trim()) aiSummary = result.summary.trim().slice(0, 4000)
      } catch (aiError) {
         console.warn("AI evaluation failed, using a truthful unavailable result.", aiError)
      }
    }

    const updatedCall = await prisma.callLog.update({
      where: { id },
      data: {
        aiSentiment,
        aiSummary
      }
    })

    return NextResponse.json({ success: true, call: updatedCall })
  } catch (error: unknown) {
    console.error('Call Analysis Error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to analyze call' }, { status: 500 })
  }
}
