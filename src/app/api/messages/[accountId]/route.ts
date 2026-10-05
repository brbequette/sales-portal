import { handler as guardedSmsHandler } from "../../../../../netlify/functions/send-sms"
/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
// Using default auth for prototype
import { getZohoVoiceAccessToken } from '@/lib/zoho-voice-auth'
import FormData from 'form-data'
import { checkAccountOwnership } from '@/lib/auth-helpers'
import { guardSmsSend } from '@/lib/sms-suppression'

export async function GET(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const params = await context.params
    const access = await checkAccountOwnership(params.accountId)
    if (!access.authorized) return access.errorResponse || NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const access = await checkAccountOwnership(params.accountId)
    if (!access.authorized) return access.errorResponse || NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { text, fromNumber, contactId, attachVCard, vcardCustomFields } = body

    if (!text || !fromNumber) {
      return NextResponse.json({ success: false, error: 'Message text and sender number are required' }, { status: 400 })
    }

    const sessionUser = access.user as { dbId?: string; email?: string } | undefined
    let dbUser = sessionUser?.dbId
      ? await prisma.user.findUnique({ where: { id: sessionUser.dbId } })
      : null
    if (!dbUser && sessionUser?.email) dbUser = await prisma.user.findUnique({ where: { email: sessionUser.email } })

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

    const result: any = await guardedSmsHandler({
      httpMethod: 'POST', path: '/api/send-sms', headers: Object.fromEntries(req.headers.entries()),
      body: JSON.stringify({ accountId: params.accountId, contactId, message: finalText, fromNumber, requestId: body.requestId }),
      queryStringParameters: {}, isBase64Encoded: false,
    } as any, {} as any)
    return new NextResponse(result.body, { status: result.statusCode, headers: result.headers })
  } catch (error: any) {
    console.error('Send Account Message Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
