import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasValidWebhookToken } from '@/lib/webhook-auth'
import { indexCallAndCreateSafeFollowUp } from '@/lib/communication-automation'

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
    const searchNumber = direction.toUpperCase() === 'INBOUND' ? fromNumber : toNumber
    let accountId = ''
    let contactId: string | null = null

    if (searchNumber) {
      const cleanNumber = searchNumber.replace(/\D/g, '')
      if (cleanNumber.length >= 7) {
        const last7 = cleanNumber.slice(-7)
        const contact = await prisma.contact.findFirst({
          where: {
            OR: [
              { phone: { contains: last7 } },
              { mobilePhone: { contains: last7 } }
            ]
          }
        })
        if (contact) {
          accountId = contact.accountId
          contactId = contact.id
        } else {
          // Check raw account shipping/billing phone or notes if contact not found
          const account = await prisma.account.findFirst({
            where: {
              OR: [
                { name: { contains: cleanNumber } }
              ]
            }
          })
          if (account) accountId = account.id
        }
      }
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

    return NextResponse.json({ success: true, message: 'Call logged' })
  } catch (error: any) {
    console.error('Zoho Voice Webhook Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
