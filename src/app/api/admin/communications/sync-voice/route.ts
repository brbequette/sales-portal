import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'

function normalizePhone(num: string | null | undefined): string {
  if (!num) return ''
  let cleaned = num.replace(/[^\d]/g, '')
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    cleaned = cleaned.substring(1)
  }
  return cleaned
}

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

    // Resolve fallback authorId (first admin or first user)
    const fallbackUser = await prisma.user.findFirst({
      where: { role: { contains: "ADMIN", mode: "insensitive" } }
    }) || await prisma.user.findFirst()
    const fallbackUserId = fallbackUser?.id || 'system'

    // Load all users to match agent email or name
    const usersList = await prisma.user.findMany({ select: { id: true, email: true, name: true } })
    const userEmailToIdMap = new Map<string, string>()
    const userNameToIdMap = new Map<string, string>()
    for (const u of usersList) {
      if (u.email) {
        userEmailToIdMap.set(u.email.toLowerCase().trim(), u.id)
      }
      if (u.name) {
        userNameToIdMap.set(u.name.toLowerCase().trim(), u.id)
      }
    }

    // Load all contacts to match phone numbers in memory
    const contacts = await prisma.contact.findMany({
      select: { id: true, accountId: true, phone: true, mobilePhone: true, firstName: true, lastName: true }
    })

    const phoneToContactMap = new Map<string, { contactId: string, accountId: string }>()
    const last7ToContactMap = new Map<string, { contactId: string, accountId: string }>()
    const contactNameToContactMap = new Map<string, { contactId: string, accountId: string }>()

    for (const c of contacts) {
      const p = normalizePhone(c.phone)
      if (p) {
        phoneToContactMap.set(p, { contactId: c.id, accountId: c.accountId })
        if (p.length >= 7) {
          last7ToContactMap.set(p.slice(-7), { contactId: c.id, accountId: c.accountId })
        }
      }
      const m = normalizePhone(c.mobilePhone)
      if (m) {
        phoneToContactMap.set(m, { contactId: c.id, accountId: c.accountId })
        if (m.length >= 7) {
          last7ToContactMap.set(m.slice(-7), { contactId: c.id, accountId: c.accountId })
        }
      }
      const fullName = `${c.firstName || ''} ${c.lastName || ''}`.replace(/\s+/g, ' ').trim().toLowerCase()
      if (fullName) {
        contactNameToContactMap.set(fullName, { contactId: c.id, accountId: c.accountId })
      }
    }

    // Load all accounts to match company/account name in memory
    const accounts = await prisma.account.findMany({ select: { id: true, name: true } })
    const accountNameToIdMap = new Map<string, string>()
    for (const a of accounts) {
      if (a.name) {
        accountNameToIdMap.set(a.name.toLowerCase().trim(), a.id)
      }
    }

    let syncedCount = 0
    let hasMore = true
    const debugLog: any[] = []

    while (hasMore) {
      // Zoho Voice call logs API endpoint (zv/logs)
      const res = await fetch(`https://voice.zoho.com/rest/json/zv/logs?from=${fromIdx}&size=100`, { signal: AbortSignal.timeout(15000),
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!res.ok) {
        throw new Error(`Zoho API Error: ${res.statusText}`)
      }

      const data = await res.json()
      const logs = data.callLogQuery || data.callLogs || data.logs || data.data || []
      
      debugLog.push({ step: 'fetched_page', fromIdx, count: logs.length })

      if (logs.length < 100) {
        hasMore = false
      }
      fromIdx += 100

      for (const log of logs) {
        const zohoCallId = log.logid?.toString() || log.logId?.toString() || log.id?.toString()
        if (!zohoCallId) continue

        const fromNumber = log.caller_id_number || log.fromNumber || log.caller || ''
        const toNumber = log.destination_number || log.toNumber || log.called || ''
        
        let duration = 0
        if (log.start_time && log.end_time) {
          duration = Math.round((parseInt(log.end_time) - parseInt(log.start_time)) / 1000)
        } else if (typeof log.duration === 'number') {
          duration = log.duration
        } else if (log.duration && typeof log.duration === 'string') {
          const parts = log.duration.split(':')
          duration = parts.reduce((acc: number, val: string) => (acc * 60) + (parseInt(val, 10) || 0), 0)
        }
        
        const status = log.hangup_cause_displayname === 'Successful call' ? 'completed' : (log.status || 'completed')
        const direction = log.call_type === 'incoming' || log.direction === 'INBOUND' ? 'INBOUND' : 'OUTBOUND'
        
        const rawRelated = direction === 'INBOUND' ? fromNumber : toNumber
        const cleanRelated = normalizePhone(rawRelated)
        
        let contactId: string | null = null
        let accountId: string | null = null

        // 1. Phone number match
        if (cleanRelated) {
          let matched = phoneToContactMap.get(cleanRelated)
          if (!matched && cleanRelated.length >= 7) {
            matched = last7ToContactMap.get(cleanRelated.slice(-7))
          }
          if (matched) {
            contactId = matched.contactId
            accountId = matched.accountId
          }
        }

        // 2. Account Name fallback match
        if (!accountId) {
          const zohoAccountName = (log.account_name || log.accountName || log.company || log.company_name || '').toLowerCase().trim()
          if (zohoAccountName && accountNameToIdMap.has(zohoAccountName)) {
            accountId = accountNameToIdMap.get(zohoAccountName)!
          }
        }

        // 3. Contact Name fallback match
        if (!accountId) {
          const zohoContactName = (log.contact_name || log.contactName || log.customer_name || log.customerName || log.display_name || '').replace(/\s+/g, ' ').trim().toLowerCase()
          if (zohoContactName && contactNameToContactMap.has(zohoContactName)) {
            const matchedContact = contactNameToContactMap.get(zohoContactName)!
            contactId = matchedContact.contactId
            accountId = matchedContact.accountId
          }
        }

        if (accountId) {
          const createdAtDate = log.start_time ? new Date(parseInt(log.start_time)) : new Date()

          // Parse extra call attributes
          const recordingUrl = log.recording_url || log.recordingUrl || log.recording_path || log.recordingPath || log.recording || log.audio_url || null
          const notes = log.notes || log.note || log.description || log.comment || log.comments || null
          const transcript = log.transcript || log.transcription || log.call_transcript || log.ai_transcript || null
          const zohoSentiment = log.sentiment || log.zohoSentiment || log.call_sentiment || null
          const aiSummary = log.summary || log.aiSummary || log.ai_summary || log.call_summary || null

          // Resolve agent/author user
          const agentEmail = (log.agent_email || log.agentEmail || log.user_email || log.userEmail || '').toLowerCase().trim()
          const agentName = (log.agent_name || log.agentName || log.user_name || log.userName || '').toLowerCase().trim()
          
          let authorId = fallbackUserId
          if (agentEmail && userEmailToIdMap.has(agentEmail)) {
            authorId = userEmailToIdMap.get(agentEmail)!
          } else if (agentName && userNameToIdMap.has(agentName)) {
            authorId = userNameToIdMap.get(agentName)!
          }
          
          await prisma.callLog.upsert({
            where: { zohoCallId: zohoCallId },
            update: {
              duration,
              status,
              recordingUrl: recordingUrl || undefined,
              notes: notes || undefined,
              transcript: transcript || undefined,
              zohoSentiment: zohoSentiment || undefined,
              aiSummary: aiSummary || undefined,
              contactId: contactId || undefined,
              updatedAt: new Date()
            },
            create: {
              accountId,
              contactId,
              authorId,
              fromNumber,
              toNumber,
              direction,
              duration,
              status,
              recordingUrl,
              notes,
              transcript,
              zohoSentiment,
              zohoCallId,
              aiSummary,
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
