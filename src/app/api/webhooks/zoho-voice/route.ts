import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasValidWebhookToken } from '@/lib/webhook-auth'
import { indexCallAndCreateSafeFollowUp } from '@/lib/communication-automation'
import { matchVoiceCallToAccount } from '@/lib/voice-account-matching'

export async function POST(req: Request) {
  try {
    if (!hasValidWebhookToken(req, process.env.ZOHO_VOICE_WEBHOOK_SECRET || process.env.ZOHO_WEBHOOK_SECRET)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await req.json()
    
    // Parse Zoho Voice CDR payload
    // Adjust these field names based on the actual Zoho Voice webhook structure
    const zohoCallId = payload.call_id || payload.CallId
    const fromNumber = payload.from_number || payload.From
    const toNumber = payload.to_number || payload.To
    const direction = payload.direction || payload.Direction || (payload.type === 'inbound' ? 'INBOUND' : 'OUTBOUND')
    const duration = parseInt(payload.duration || payload.Duration || '0', 10)
    const status = payload.status || payload.Status || payload.call_status
    const recordingUrl = payload.recording_url || payload.RecordingUrl || payload.recordingUrl
    const zohoSentiment = payload.sentiment || payload.Sentiment || payload.call_sentiment
    const transcript = payload.transcript || payload.Transcript || payload.ai_transcript || payload.call_transcript
    const aiSummary = payload.summary || payload.Summary || payload.ai_summary
    const agentEmail = payload.agent_email || payload.agentEmail || payload.user_email

    if (!zohoCallId) {
      return NextResponse.json({ success: false, error: 'Missing zohoCallId' }, { status: 400 })
    }

    // Try to match agent email to local User
    let authorId = 'SYSTEM'
    if (agentEmail) {
      const user = await prisma.user.findUnique({ where: { email: agentEmail.toLowerCase().trim() } })
      if (user) authorId = user.id
    }
    if (authorId === 'SYSTEM') {
      const adminUser = await prisma.user.findFirst({ where: { role: { contains: "ADMIN", mode: "insensitive" } } })
      if (adminUser) authorId = adminUser.id
    }

    // Try to match the phone number to a contact and account
    let accountId = ''
    let contactId: string | null = null

    const phoneMatch = await matchVoiceCallToAccount({ direction, fromNumber, toNumber })
    if (phoneMatch.status === "MATCHED") {
      accountId = phoneMatch.accountId
      contactId = phoneMatch.contactId
    }

    // CallLog.accountId is required. Preserve unmatched inbound activity under
    // one stable holding account so the webhook never drops calls because of a
    // foreign-key failure; admins can later reassign the call to the customer.
    if (!accountId) {
      const adminUser = await prisma.user.findFirst({
        where: { role: { contains: 'admin', mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      })
      if (!adminUser) {
        return NextResponse.json({ success: false, error: 'No administrator is available to own unmatched calls' }, { status: 503 })
      }
      const holdingAccount = await prisma.account.upsert({
        where: { zohoId: 'unknown-voice-caller' },
        update: {},
        create: {
          name: 'Unknown Voice Caller',
          zohoId: 'unknown-voice-caller',
          status: 'Lead',
          ownerId: adminUser.id,
        },
      })
      accountId = holdingAccount.id
    }

    // Upsert CallLog
    const callLog = await prisma.callLog.upsert({
      where: { zohoCallId },
      update: {
        accountId,
        duration,
        status,
        recordingUrl: recordingUrl || undefined,
        zohoSentiment: zohoSentiment || undefined,
        transcript: transcript || undefined,
        aiSummary: aiSummary || undefined,
        contactId: contactId || undefined,
      },
      create: {
        zohoCallId,
        accountId: accountId,
        contactId: contactId,
        authorId: authorId,
        fromNumber: fromNumber || 'Unknown',
        toNumber: toNumber || 'Unknown',
        direction: direction.toUpperCase(),
        duration,
        status,
        recordingUrl,
        zohoSentiment,
        transcript,
        aiSummary
      }
    })

    await indexCallAndCreateSafeFollowUp(callLog)

    if (phoneMatch.status !== "MATCHED") {
      await prisma.integrationException.upsert({
        where: { integration_entityType_externalId_exceptionType: { integration: "ZOHO_VOICE", entityType: "CALL_LOG", externalId: String(zohoCallId), exceptionType: "ACCOUNT_MATCH" } },
        update: { status: "OPEN", externalNumber: phoneMatch.normalized, summary: phoneMatch.status === "AMBIGUOUS" ? "Multiple accounts share the caller phone; review required." : "No account contact matches the caller phone; review required.", proposedMatches: phoneMatch.matches.map(item => ({ accountId: item.accountId, contactId: item.id })) },
        create: { integration: "ZOHO_VOICE", entityType: "CALL_LOG", externalId: String(zohoCallId), externalNumber: phoneMatch.normalized, exceptionType: "ACCOUNT_MATCH", summary: phoneMatch.status === "AMBIGUOUS" ? "Multiple accounts share the caller phone; review required." : "No account contact matches the caller phone; review required.", proposedMatches: phoneMatch.matches.map(item => ({ accountId: item.accountId, contactId: item.id })), confidence: 0 },
      })
    }

    return NextResponse.json({ success: true, message: 'Call logged' })
  } catch (error: any) {
    console.error('Zoho Voice Webhook Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
