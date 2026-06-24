import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'
import { getPrimaryAccountPhone, normalizePhoneNumber, resolveAccount, resolveOutboundVoiceNumber } from '@/lib/communications'
import { getServerSession } from 'next-auth/next'
import fetch from 'node-fetch'
import FormData from 'form-data'

export async function GET(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const params = await context.params
    // const { userId } = auth()
    // if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const account = await resolveAccount(params.accountId)
    if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })

    const messages = await prisma.smsMessage.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true } } }
    })

    return NextResponse.json({ success: true, messages })
  } catch (error: unknown) {
    console.error('Fetch Account Messages Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch messages'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const params = await context.params
    const session = await getServerSession()
    const dbUser = session?.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email } })
      : await prisma.user.findFirst()
    if (!dbUser) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })

    const body = await req.json()
    const { text, fromNumber } = body

    if (!text) {
      return NextResponse.json({ success: false, error: 'Message text is required' }, { status: 400 })
    }

    const account = await resolveAccount(params.accountId)

    if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })

    const phoneNumber = getPrimaryAccountPhone(account)
    if (!phoneNumber) {
      return NextResponse.json({ success: false, error: 'Account has no phone number' }, { status: 400 })
    }

    const senderNumber = await resolveOutboundVoiceNumber(fromNumber)
    if (!senderNumber) {
      return NextResponse.json({ success: false, error: 'No outbound SMS number configured' }, { status: 400 })
    }

    const accessToken = await getZohoAccessToken()
    if (!accessToken) throw new Error('Failed to get Zoho Access Token')

    const zohoDc = process.env.ZOHO_DC || 'com'
    const zohoVoiceUrl = `https://voice.zoho.${zohoDc}/rest/json/v2/sms/send`
    const smsData = {
      customerNumber: phoneNumber,
      message: text,
      senderId: senderNumber,
      mms: false
    }

    const formData = new FormData()
    formData.append('sms_data', JSON.stringify(smsData))

    const smsRes = await fetch(zohoVoiceUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        ...formData.getHeaders()
      },
      body: formData
    })

    const resultText = await smsRes.text()
    let resultJson: Record<string, string> = {}
    try { resultJson = JSON.parse(resultText) } catch {}

    if (smsRes.ok && resultJson.status !== 'error' && resultJson.code !== 'error') {
      const msg = await prisma.smsMessage.create({
        data: {
          accountId: account.id,
          authorId: dbUser.id,
          fromNumber: normalizePhoneNumber(senderNumber),
          toNumber: phoneNumber,
          body: text,
          direction: 'OUTBOUND'
        }
      })
      return NextResponse.json({ success: true, message: msg })
    } else {
      throw new Error(resultJson.message || 'Zoho API Error')
    }
  } catch (error: unknown) {
    console.error('Send Account Message Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send message'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
