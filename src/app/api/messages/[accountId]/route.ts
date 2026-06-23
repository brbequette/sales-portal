import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
// Using default auth for prototype
import { getZohoAccessToken } from '@/lib/zoho-auth'
import fetch from 'node-fetch'
import FormData from 'form-data'

export async function GET(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const params = await context.params
    // const { userId } = auth()
    // if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const messages = await prisma.smsMessage.findMany({
      where: { accountId: params.accountId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true } } }
    })

    return NextResponse.json({ success: true, messages })
  } catch (error: any) {
    console.error('Fetch Account Messages Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const params = await context.params
    // const { userId } = auth()
    // if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const dbUser = await prisma.user.findFirst()
    if (!dbUser) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })

    const body = await req.json()
    const { text, fromNumber } = body

    if (!text || !fromNumber) {
      return NextResponse.json({ success: false, error: 'Message text and sender number are required' }, { status: 400 })
    }

    const account = await prisma.account.findUnique({
      where: { id: params.accountId },
      include: { contacts: true }
    })

    if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })

    const contact = account.contacts.find((c: any) => c.isPrimary) || account.contacts[0]
    const rawPhoneNumber = contact?.mobilePhone || contact?.phone

    if (!rawPhoneNumber) {
      return NextResponse.json({ success: false, error: 'Account has no phone number' }, { status: 400 })
    }

    let phoneNumber = rawPhoneNumber.replace(/[^\d+]/g, '')
    if (phoneNumber.length === 10 && !phoneNumber.startsWith('+')) phoneNumber = '+1' + phoneNumber
    else if (!phoneNumber.startsWith('+') && phoneNumber.length > 10) phoneNumber = '+' + phoneNumber

    const accessToken = await getZohoAccessToken()
    if (!accessToken) throw new Error('Failed to get Zoho Access Token')

    const zohoDc = process.env.ZOHO_DC || 'com'
    const zohoVoiceUrl = `https://voice.zoho.${zohoDc}/rest/json/v2/sms/send`
    const smsData = {
      customerNumber: phoneNumber,
      message: text,
      senderId: fromNumber
    }

    const formData = new FormData()
    formData.append('sms_data', JSON.stringify(smsData))

    const smsRes = await fetch(zohoVoiceUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        ...formData.getHeaders()
      },
      body: formData as any
    })

    const resultText = await smsRes.text()
    let resultJson: any = {}
    try { resultJson = JSON.parse(resultText) } catch (e) {}

    if (smsRes.ok && resultJson.status !== 'error' && resultJson.code !== 'error') {
      const msg = await prisma.smsMessage.create({
        data: {
          accountId: account.id,
          authorId: dbUser.id,
          fromNumber: fromNumber,
          toNumber: phoneNumber,
          body: text,
          direction: 'OUTBOUND'
        }
      })
      return NextResponse.json({ success: true, message: msg })
    } else {
      throw new Error(resultJson.message || 'Zoho API Error')
    }
  } catch (error: any) {
    console.error('Send Account Message Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
