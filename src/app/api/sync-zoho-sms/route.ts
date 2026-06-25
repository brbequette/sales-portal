import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'

export async function POST(req: Request) {
  try {
    let body = {}
    try {
      body = await req.json()
    } catch (e) {
      // ignore
    }
    const fromIdx = (body as any).from || 0

    const accessToken = await getZohoAccessToken()
    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Zoho not connected' }, { status: 401 })
    }

    // Set fetch timeframe: last 3 days to avoid overwhelming API, or we can use fromDate/toDate
    // But since it's a sync, we can just grab the last 100 logs.
    const res = await fetch(`https://voice.zoho.com/rest/json/v1/sms/logs?from=${fromIdx}&size=100&messageType=incoming`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Accept': 'application/json'
      }
    })

    if (!res.ok) {
      throw new Error(`Zoho API Error: ${res.statusText}`)
    }

    const data = await res.json()
    const logs = data.data || [] // Assuming data is an array under 'data', let's just default to array

    let syncedCount = 0

    for (const log of logs) {
      const zohoLogId = log.logId?.toString() || log.id?.toString()
      if (!zohoLogId) continue

      // Check if this log was already synced
      const existing = await prisma.smsMessage.findFirst({
        where: { zohoLogId }
      })

      if (existing) continue

      const fromNumber = log.customerNumber || log.from
      const messageContent = log.message || log.text
      const mediaUrl = log.mediaUrl || null
      // the timestamp might be in log.time or log.createdTime

      if (!fromNumber || !messageContent) continue

      const cleanFromNumber = fromNumber.toString().replace(/[^\d+]/g, '')

      // Find the account
      const contacts = await prisma.contact.findMany({
        where: {
          OR: [
            { mobilePhone: { contains: cleanFromNumber.replace('+1', '') } },
            { phone: { contains: cleanFromNumber.replace('+1', '') } }
          ]
        },
        include: { account: true }
      })

      let accountId = null

      if (contacts.length > 0) {
        accountId = contacts[0].accountId
      } else {
        // Fallback to unknown account
        let unknownAccount = await prisma.account.findFirst({
          where: { name: 'Unknown SMS Sender' }
        })

        if (!unknownAccount) {
          const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
          if (admin) {
            unknownAccount = await prisma.account.create({
              data: {
                name: 'Unknown SMS Sender',
                zohoId: 'unknown-sms-' + Date.now(),
                status: 'Lead',
                ownerId: admin.id
              }
            })
          }
        }
        accountId = unknownAccount?.id
      }

      if (!accountId) continue

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
        // Only associate if the outbound was within the last 7 days
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        if (recentOutbound.createdAt > sevenDaysAgo) {
          campaignBlastId = recentOutbound.campaignBlastId
        }
      }

      await prisma.smsMessage.create({
        data: {
          accountId,
          fromNumber: cleanFromNumber,
          toNumber: log.longCode || log.to || '',
          body: messageContent,
          direction: 'INBOUND',
          zohoLogId,
          mediaUrl,
          campaignBlastId,
          // If the log has a valid timestamp, use it. Otherwise use now.
          createdAt: log.createdTime ? new Date(log.createdTime) : new Date()
        }
      })

      syncedCount++
    }

    return NextResponse.json({ success: true, syncedCount })
  } catch (error: any) {
    console.error('SMS Sync Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
