import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
// Using default auth for prototype
import { getZohoAccessToken } from '@/lib/zoho-auth'
import fetch from 'node-fetch'
import FormData from 'form-data'

export async function GET(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const params = await context.params
    const url = new URL(req.url)
    const includeClosedHistory = url.searchParams.get("includeClosedHistory") === "true"

    const account = await prisma.account.findUnique({
      where: { id: params.accountId },
      select: { lastClosedCycleAt: true }
    })

    const lastClosedCycleAt = account?.lastClosedCycleAt || null

    let whereClause: any = { accountId: params.accountId }
    if (!includeClosedHistory && lastClosedCycleAt) {
      whereClause.createdAt = { gte: lastClosedCycleAt }
    }

    const messages = await prisma.smsMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true, phone: true, mobilePhone: true } }
      }
    })

    let closedMessagesCount = 0
    if (lastClosedCycleAt) {
      closedMessagesCount = await prisma.smsMessage.count({
        where: { accountId: params.accountId, createdAt: { lt: lastClosedCycleAt } }
      })
    }

    return NextResponse.json({
      success: true,
      messages,
      lastClosedCycleAt,
      closedMessagesCount
    })
  } catch (error: any) {
    console.error('Fetch Account Messages Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const params = await context.params

    const body = await req.json()
    const { text, fromNumber, contactId, userId, userEmail, attachVCard, vcardCustomFields } = body

    if (!text || !fromNumber) {
      return NextResponse.json({ success: false, error: 'Message text and sender number are required' }, { status: 400 })
    }

    let dbUser = null
    if (userId) dbUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!dbUser && userEmail) dbUser = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!dbUser) dbUser = await prisma.user.findFirst()

    if (!dbUser) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })

    // Auto-append vCard link if requested or rep preference is enabled
    let finalText = text.trim()
    const shouldAttach = attachVCard === true || (attachVCard === undefined && (dbUser as any).autoAttachVCard === true)
    if (shouldAttach) {
      let vcardUrl = `https://tdusales.com/api/vcard/${dbUser.id}`
      if (vcardCustomFields && typeof vcardCustomFields === "object") {
        const queryParams = new URLSearchParams()
        if (vcardCustomFields.name) queryParams.set("name", vcardCustomFields.name)
        if (vcardCustomFields.title) queryParams.set("title", vcardCustomFields.title)
        if (vcardCustomFields.phone) queryParams.set("phone", vcardCustomFields.phone)
        if (vcardCustomFields.email) queryParams.set("email", vcardCustomFields.email)
        if (vcardCustomFields.company) queryParams.set("company", vcardCustomFields.company)
        if (vcardCustomFields.website) queryParams.set("website", vcardCustomFields.website)
        if (vcardCustomFields.photoUrl) queryParams.set("photoUrl", vcardCustomFields.photoUrl)
        
        const qStr = queryParams.toString()
        if (qStr) vcardUrl += `?${qStr}`
      }

      if (!finalText.includes("https://tdusales.com/api/vcard/")) {
        finalText += `\n\nSave my contact: ${vcardUrl}`
      }
    }

    const account = await prisma.account.findUnique({
      where: { id: params.accountId },
      include: { contacts: true }
    })

    if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })

    let selectedContact = null
    if (contactId) {
      selectedContact = account.contacts.find((c: any) => c.id === contactId)
    }
    if (!selectedContact) {
      selectedContact = account.contacts.find((c: any) => c.isPrimary) || account.contacts[0]
    }

    const rawPhoneNumber = selectedContact?.mobilePhone || selectedContact?.phone

    if (!rawPhoneNumber) {
      return NextResponse.json({ success: false, error: 'Account/Contact has no phone number' }, { status: 400 })
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
      message: finalText,
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
    try { resultJson = JSON.parse(resultText) } catch (e) { console.warn('Failed to parse Zoho SMS response:', e) }

    if (smsRes.ok && resultJson.status !== 'error' && resultJson.code !== 'error') {
      const msg = await prisma.smsMessage.create({
        data: {
          accountId: account.id,
          contactId: selectedContact?.id || null,
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
