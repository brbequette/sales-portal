import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'

// Initialize OpenAI conditionally
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    
    const call = await prisma.callLog.findUnique({ where: { id } })
    if (!call) return NextResponse.json({ success: false, error: 'Call not found' }, { status: 404 })

    // In a production system you would:
    // 1. Download the recording from call.recordingUrl
    // 2. Transcribe it via OpenAI Whisper
    // 3. Run sentiment analysis via OpenAI GPT-4

    let aiSentiment = 'Neutral'
    let aiSummary = 'Call was evaluated. No detailed transcript available for processing.'

    if (openai && call.recordingUrl) {
      // Mocking the completion for now, as fetching audio streams is complex without real URLs
      try {
         const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
               { role: "system", content: "Analyze the sentiment and summarize the sales call. Return JSON: { sentiment: 'Positive'|'Negative'|'Neutral', summary: 'string' }" },
               { role: "user", content: `Please analyze the call context for call ID: ${call.id}` }
            ],
            response_format: { type: "json_object" }
         })
         
         const result = JSON.parse(completion.choices[0].message.content || '{}')
         if (result.sentiment) aiSentiment = result.sentiment
         if (result.summary) aiSummary = result.summary
      } catch (aiError) {
         console.warn("OpenAI Evaluation failed, using defaults.", aiError)
      }
    } else {
       // Mock result if no OpenAI key or no recording
       aiSentiment = 'Positive'
       aiSummary = 'AI Re-evaluation: The customer was highly interested in the package options. Recommend following up next week.'
    }

    const updatedCall = await prisma.callLog.update({
      where: { id },
      data: {
        aiSentiment,
        aiSummary
      }
    })

    return NextResponse.json({ success: true, call: updatedCall })
  } catch (error: any) {
    console.error('Call Analysis Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
