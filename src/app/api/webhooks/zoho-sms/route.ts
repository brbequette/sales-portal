import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const text = await req.text()
    let body: any = {}
    
    // Zoho Voice sometimes sends URL-encoded forms or JSON
    try {
      body = JSON.parse(text)
    } catch {
      const params = new URLSearchParams(text)
      params.forEach((value, key) => {
        body[key] = value
      })
    }

    console.log('Incoming Zoho SMS Webhook:', body)

    // Expected fields from Zoho (adjust if Zoho sends different keys)
    const fromNumberRaw = body.from || body.From || body.source || ''
    const toNumberRaw = body.to || body.To || body.destination || ''
    const messageContent = body.text || body.Text || body.message || ''

    if (!fromNumberRaw || !messageContent) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const fromNumber = fromNumberRaw.replace(/[^\d+]/g, '')
    const toNumber = toNumberRaw.replace(/[^\d+]/g, '')

    const cleanDigits = fromNumber.replace(/\D/g, '').slice(-10)

    // Search for a contact with this phone number (matching trailing 10 digits)
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { mobilePhone: { contains: cleanDigits } },
          { phone: { contains: cleanDigits } }
        ]
      },
      include: { account: true }
    })

    let accountId = null

    if (contacts.length > 0) {
      accountId = contacts[0].accountId
    } else {
      // Find or create Unknown SMS account
      let unknownAccount = await prisma.account.findFirst({
        where: { name: 'Unknown SMS Sender' }
      })

      if (!unknownAccount) {
        // Need to find an admin user to own it
        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
        if (!admin) throw new Error('No admin user found to own unknown account')

        unknownAccount = await prisma.account.create({
          data: {
            name: 'Unknown SMS Sender',
            zohoId: 'unknown-sms-' + Date.now(),
            status: 'Lead',
            ownerId: admin.id
          }
        })
      }
      accountId = unknownAccount.id
    }

    // Look up if this account was part of a recent campaign
    // to associate the inbound message to that campaign blast
    const recentOutbound = await prisma.smsMessage.findFirst({
      where: {
        accountId,
        direction: 'OUTBOUND',
        campaignBlastId: { not: null }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    let campaignBlastId = null
    if (recentOutbound && recentOutbound.campaignBlastId) {
      campaignBlastId = recentOutbound.campaignBlastId
    }

    await prisma.smsMessage.create({
      data: {
        accountId: accountId,
        fromNumber: fromNumber,
        toNumber: toNumber,
        body: messageContent,
        direction: 'INBOUND',
        campaignBlastId: campaignBlastId
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Zoho SMS Webhook Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
