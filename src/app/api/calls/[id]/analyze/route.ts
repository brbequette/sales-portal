import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAIChatCompletion, isAIConfigured } from '@/lib/ai-client'
import { checkAccountOwnership } from '@/lib/auth-helpers'

type CallInsights = {
  sentiment: 'Positive' | 'Negative' | 'Neutral'
  summary: string
  outcome?: string
  decisionMakerStatus?: string
  products?: string[]
  equipment?: string[]
  applications?: string[]
  competitors?: string[]
  objections?: string[]
  buyingIntentScore?: number
  recommendedChannel?: string
  recommendedTiming?: string
  commitments?: Array<{ description?: string; dueAt?: string; confidence?: number }>
  proposedAccountUpdates?: Array<{ field?: string; value?: unknown; evidence?: string }>
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    
    const call = await prisma.callLog.findUnique({
      where: { id },
      include: { account: { select: { ownerId: true, name: true } } },
    })
    if (!call) return NextResponse.json({ success: false, error: 'Call not found' }, { status: 404 })

    const access = await checkAccountOwnership(call.accountId)
    if (!access.authorized) return access.errorResponse

    let aiSentiment = 'Neutral'
    let aiSummary = 'No transcript is available, so this call could not be analyzed.'
    let insights: CallInsights | null = null

    if (isAIConfigured() && call.transcript?.trim()) {
      try {
         const { response: completion } = await createAIChatCompletion({
            messages: [
               { role: "system", content: `Return strict JSON grounded only in the transcript. Include sentiment, summary, outcome, decisionMakerStatus, products, equipment, applications, competitors, objections, buyingIntentScore (0-100), recommendedChannel, recommendedTiming, commitments, and proposedAccountUpdates. Commitments need description, optional ISO dueAt, and confidence 0-1. Never invent missing facts; use empty arrays or omit uncertain values. Account updates are proposals only.` },
               { role: "user", content: call.transcript.slice(0, 30000) }
            ],
            response_format: { type: "json_object" }
         })
         
         const result = JSON.parse(completion.choices[0].message.content || '{}') as CallInsights
         if (result.sentiment === 'Positive' || result.sentiment === 'Negative' || result.sentiment === 'Neutral') aiSentiment = result.sentiment
         if (typeof result.summary === 'string' && result.summary.trim()) aiSummary = result.summary.trim().slice(0, 4000)
         insights = {
           ...result,
           sentiment: aiSentiment as CallInsights['sentiment'],
           summary: aiSummary,
           buyingIntentScore: typeof result.buyingIntentScore === 'number' ? Math.min(100, Math.max(0, result.buyingIntentScore)) : undefined,
           commitments: Array.isArray(result.commitments) ? result.commitments.slice(0, 20) : [],
           proposedAccountUpdates: Array.isArray(result.proposedAccountUpdates) ? result.proposedAccountUpdates.slice(0, 20) : [],
         }
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

    await prisma.communicationEvent.upsert({
      where: { sourceType_sourceId_eventType: { sourceType: 'CALL_LOG', sourceId: call.id, eventType: 'CALL_ANALYSIS' } },
      update: { summary: aiSummary, metadata: (insights || { sentiment: aiSentiment }) as Prisma.InputJsonValue },
      create: {
        accountId: call.accountId,
        contactId: call.contactId,
        actorId: call.authorId,
        channel: 'VOICE',
        direction: call.direction,
        eventType: 'CALL_ANALYSIS',
        sourceType: 'CALL_LOG',
        sourceId: call.id,
        subject: 'AI call analysis',
        summary: aiSummary,
        occurredAt: new Date(),
        metadata: (insights || { sentiment: aiSentiment }) as Prisma.InputJsonValue,
      },
    })

    const proposedCommitments = insights?.commitments || []
    for (const commitment of proposedCommitments) {
      const description = typeof commitment.description === 'string' ? commitment.description.trim().slice(0, 1000) : ''
      if (!description) continue
      const existing = await prisma.salesCommitment.findFirst({
        where: { sourceType: 'CALL_LOG', sourceId: call.id, description },
        select: { id: true },
      })
      if (existing) continue
      const parsedDueAt = commitment.dueAt ? new Date(commitment.dueAt) : null
      await prisma.salesCommitment.create({
        data: {
          accountId: call.accountId,
          contactId: call.contactId,
          ownerId: call.account.ownerId,
          sourceType: 'CALL_LOG',
          sourceId: call.id,
          description,
          dueAt: parsedDueAt && !Number.isNaN(parsedDueAt.getTime()) ? parsedDueAt : null,
          confidence: typeof commitment.confidence === 'number' ? Math.min(1, Math.max(0, commitment.confidence)) : null,
          status: 'PROPOSED',
        },
      })
    }

    return NextResponse.json({
      success: true,
      call: updatedCall,
      insights,
      proposedCommitments: proposedCommitments.length,
      proposedAccountUpdates: insights?.proposedAccountUpdates?.length || 0,
    })
  } catch (error: unknown) {
    console.error('Call Analysis Error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to analyze call' }, { status: 500 })
  }
}
