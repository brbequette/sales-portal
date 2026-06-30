import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'

export async function POST(req: Request) {
  try {
    let body: any = {}
    try {
      body = await req.json()
    } catch (e) {
      // ignore
    }
    
    // Support fromDate/toDate in body or default to june 2026
    const fromDateStr = body.fromDate || '2026-06-01'
    const toDateStr = body.toDate || '2026-06-30'
    // Format required by Zoho might be different, but typically we just fetch pages of recent logs
    // since the API may not support date range in the same format.
    // Let's use fromIdx and size
    let fromIdx = parseInt(body.from) || 0

    const accessToken = await getZohoAccessToken()
    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Zoho not connected' }, { status: 401 })
    }

    let syncedCount = 0
    let hasMore = true
    const debugLog: any[] = []

    while (hasMore) {
      // Zoho Voice call logs API endpoint (guessed from typical structure, v1/calllogs)
      // We will try `v1/calllogs` and if it fails, fallback.
      const res = await fetch(`https://voice.zoho.com/rest/json/v1/calllogs?from=${fromIdx}&size=100`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!res.ok) {
        throw new Error(`Zoho API Error: ${res.statusText}`)
      }

      const data = await res.json()
      // e.g. data.calllogs
      const logs = data.calllogs || data.callLogs || data.data || []
      
      debugLog.push({ step: 'fetched_page', fromIdx, count: logs.length })

      if (logs.length < 100) {
        hasMore = false
      }
      fromIdx += 100

      for (const log of logs) {
        // Find matching contact/account based on phone number
        // 'caller' or 'called' or 'fromNumber' or 'toNumber'
        const zohoCallId = log.callid?.toString() || log.callId?.toString() || log.id?.toString()
        const fromNumber = log.fromNumber || log.caller || ''
        const toNumber = log.toNumber || log.called || ''
        const duration = parseInt(log.duration || log.callDuration) || 0
        const status = log.status || log.callStatus || 'completed'
        const direction = log.direction || log.callDirection || (log.type === 'incoming' ? 'INBOUND' : 'OUTBOUND')
        
        let relatedNumber = direction === 'INBOUND' ? fromNumber : toNumber
        if (relatedNumber.startsWith('+1')) relatedNumber = relatedNumber.substring(2)
        if (relatedNumber.startsWith('1') && relatedNumber.length === 11) relatedNumber = relatedNumber.substring(1)
        
        let accountId = null
        if (relatedNumber) {
          const contact = await prisma.contact.findFirst({
            where: {
              OR: [
                { phone: { contains: relatedNumber } },
                { mobilePhone: { contains: relatedNumber } }
              ]
            }
          })
          if (contact) accountId = contact.accountId
        }

        if (accountId && zohoCallId) {
          const createdAtDate = log.callTime || log.startTime || log.createdTime ? new Date(log.callTime || log.startTime || log.createdTime) : new Date()
          
          await prisma.callLog.upsert({
            where: { zohoCallId: zohoCallId },
            update: {
              duration,
              status,
              updatedAt: new Date()
            },
            create: {
              accountId,
              authorId: 'system', // or match with user
              fromNumber,
              toNumber,
              direction,
              duration,
              status,
              zohoCallId,
              createdAt: createdAtDate,
              updatedAt: new Date()
            }
          })
          
          // Update Account lastCalledAt
          const acc = await prisma.account.findUnique({ where: { id: accountId } })
          if (acc) {
            const currentLastCalled = acc.lastCalledAt ? new Date(acc.lastCalledAt).getTime() : 0
            if (createdAtDate.getTime() > currentLastCalled) {
              await prisma.account.update({
                where: { id: accountId },
                data: { lastCalledAt: createdAtDate }
              })
            }
          }
          
          syncedCount++
        }
      }
      
      // Safety break to prevent infinite loop during tests
      if (fromIdx > 5000) break;
    }

    return NextResponse.json({ success: true, syncedCount, debugLog })
  } catch (error: any) {
    console.error('Zoho voice sync error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
