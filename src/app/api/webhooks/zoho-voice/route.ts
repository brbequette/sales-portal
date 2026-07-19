import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    
    // Parse Zoho Voice CDR payload
    // Adjust these field names based on the actual Zoho Voice webhook structure
    const zohoCallId = payload.call_id || payload.CallId
    const fromNumber = payload.from_number || payload.From
    const toNumber = payload.to_number || payload.To
    const direction = payload.direction || payload.Direction || (payload.type === 'inbound' ? 'INBOUND' : 'OUTBOUND')
    const duration = parseInt(payload.duration || payload.Duration || '0', 10)
    const status = payload.status || payload.Status || payload.call_status
    const recordingUrl = payload.recording_url || payload.RecordingUrl
    const zohoSentiment = payload.sentiment || payload.Sentiment

    if (!zohoCallId) {
      return NextResponse.json({ success: false, error: 'Missing zohoCallId' }, { status: 400 })
    }

    // Try to match the phone number to an account
    // For inbound, match fromNumber. For outbound, match toNumber.
    const searchNumber = direction.toUpperCase() === 'INBOUND' ? fromNumber : toNumber
    
    // Find account by number (this is a simplified search, you might need to clean numbers e.g. remove +1)
    let accountId = 'UNKNOWN'
    if (searchNumber) {
      const cleanNumber = searchNumber.replace(/\D/g, '')
      // This is a rough search across the accounts - you may want to refine this
      // For now we just find any account with this number in its phone field or contact
      const contact = await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: { contains: cleanNumber } },
            { mobilePhone: { contains: cleanNumber } }
          ]
        }
      })
      if (contact) {
        accountId = contact.accountId
      }
    }

    // Upsert CallLog
    await prisma.callLog.upsert({
      where: { zohoCallId },
      update: {
        duration,
        status,
        recordingUrl: recordingUrl || undefined,
        zohoSentiment: zohoSentiment || undefined
      },
      create: {
        zohoCallId,
        accountId: accountId === 'UNKNOWN' ? '' : accountId, // Fallback if no match
        authorId: 'SYSTEM', // You might extract the Zoho Agent ID and map to your local user
        fromNumber: fromNumber || 'Unknown',
        toNumber: toNumber || 'Unknown',
        direction: direction.toUpperCase(),
        duration,
        status,
        recordingUrl,
        zohoSentiment
      }
    })

    return NextResponse.json({ success: true, message: 'Call logged' })
  } catch (error: any) {
    console.error('Zoho Voice Webhook Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
