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
    let fromIdx = (body as any).from || 0

    const accessToken = await getZohoAccessToken()
    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Zoho not connected' }, { status: 401 })
    }

    // Set fetch timeframe: last 3 days to avoid overwhelming API, or we can use fromDate/toDate
    // But since it's a sync, we can just grab the last 100 logs.
    let syncedCount = 0
    let hasMore = true
    const debugLog: any[] = []

    while (hasMore) {
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
      const logs = data.data || []
      
      debugLog.push({ step: 'fetched_page', fromIdx, data })

      if (logs.length < 100) {
        hasMore = false
      }
      fromIdx += 100

      for (const log of logs) {
        debugLog.push({ step: 'evaluating_log', id: log.logid || log.logId || log.id })
        const zohoLogId = log.logid?.toString() || log.logId?.toString() || log.id?.toString()
        if (!zohoLogId) {
          debugLog.push({ step: 'skip_no_zohoLogId', raw: log })
          continue
        }

      // Check if this log was already synced
      const existing = await prisma.smsMessage.findFirst({
        where: { zohoLogId }
      })

      if (existing) {
        debugLog.push({ step: 'skip_existing', zohoLogId })
        continue
      }

      const fromNumber = log.customerNumber || log.from
      const messageContent = log.message || log.text
      const mediaUrl = log.mediaUrl || null
      // the timestamp might be in log.time or log.createdTime

      if (!fromNumber || !messageContent) {
        debugLog.push({ step: 'skip_no_from_or_msg', zohoLogId, fromNumber, messageContent })
        continue
      }

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
          let userOwner = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
          if (!userOwner) userOwner = await prisma.user.findFirst() // fallback to ANY user
          if (userOwner) {
            unknownAccount = await prisma.account.create({
              data: {
                name: 'Unknown SMS Sender',
                zohoId: 'unknown-sms-' + Date.now(),
                status: 'Lead',
                ownerId: userOwner.id
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
        // Associate with the most recent outbound campaign without time restriction
        campaignBlastId = recentOutbound.campaignBlastId
      }

      await prisma.smsMessage.create({
        data: {
          accountId,
          fromNumber: cleanFromNumber,
          toNumber: log.senderId || log.longCode || log.to || '',
          body: messageContent,
          direction: 'INBOUND',
          zohoLogId,
          mediaUrl,
          campaignBlastId,
          // Use submittedTime (ms) or sentTime string
          createdAt: log.submittedTime ? new Date(log.submittedTime) : (log.sentTime ? new Date(log.sentTime) : new Date())
        }
      })

      debugLog.push({ step: 'created', zohoLogId })
      syncedCount++
      }
    }

    return NextResponse.json({ success: true, syncedCount, debugLog })
  } catch (error: any) {
    console.error('SMS Sync Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
