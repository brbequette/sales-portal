import { withVoiceCallLock, hasConfirmedVoiceAssociation } from "@/lib/voice-call-lock"
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoVoiceAccessToken } from '@/lib/zoho-voice-auth'
import { requireAdministrator } from '@/lib/auth-helpers'
import { transcriptText, matchVoiceContacts } from '@/lib/voice-account-matching'
import { indexCallAndCreateSafeFollowUp } from '@/lib/communication-automation'

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
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

    const accessToken = await getZohoVoiceAccessToken()
    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Zoho not connected' }, { status: 401 })
    }

    // Resolve fallback authorId (first admin or first user)
    const fallbackUser = await prisma.user.findFirst({
      where: { role: { contains: "ADMIN", mode: "insensitive" } }
    }) || await prisma.user.findFirst()
    if (!fallbackUser) {
      return NextResponse.json({ success: false, error: 'No user is available to own imported calls' }, { status: 503 })
    }
    const fallbackUserId = fallbackUser.id

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

    let syncedCount = 0
    let transcriptCount = 0
    let ambiguousCount = 0
    const transcriptLimit = Math.max(0, Math.min(100, Number(body.transcriptLimit) || 25))
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

        const manualAssociation = await prisma.operationalAction.findUnique({
          where: { idempotencyKey: `voice-manual-association:${zohoCallId}` }, select: { status: true },
        })
        if (manualAssociation?.status === "SUCCEEDED") continue

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
        
        const status = log.hangup_cause_displayname === 'Successful call' ? 'completed' : (log.hangup_cause_displayname || log.status || 'unknown')
        const direction = log.call_type === 'incoming' || log.direction === 'INBOUND' ? 'INBOUND' : log.call_type === 'outgoing' || log.direction === 'OUTBOUND' ? 'OUTBOUND' : 'UNKNOWN'
        
        const match = matchVoiceContacts({ direction, fromNumber, toNumber }, contacts)
        const contactId = match.status === "MATCHED" ? match.contactId : null
        let accountId = match.status === "MATCHED" ? match.accountId : null
        if (match.status === "AMBIGUOUS") ambiguousCount++

        if (!accountId) {
          const holding = await prisma.account.upsert({
            where: { zohoId: 'unknown-voice-caller' }, update: {},
            create: { name: 'Unknown Voice Caller', zohoId: 'unknown-voice-caller', status: 'Lead', ownerId: fallbackUserId },
            select: { id: true },
          })
          accountId = holding.id
        }

        if (accountId) {
          const createdAtDate = log.start_time ? new Date(parseInt(log.start_time)) : new Date()

          // Parse extra call attributes
          const recordingUrl = log.recording_url || log.recordingUrl || log.recording_path || log.recordingPath || log.recording || log.audio_url || null
          const notes = log.notes || log.note || log.description || log.comment || log.comments || null
          let transcript = log.transcript || log.transcription || log.call_transcript || log.ai_transcript || null
          const transcriptionStatus = String(log.call_recording_transcription_status || log.transcription_status || "").toLowerCase()
          if (!transcript && transcriptCount < transcriptLimit && ["completed", "success", "available"].includes(transcriptionStatus)) {
            const transcriptResponse = await fetch(`https://voice.zoho.com/rest/json/zv/transcribe?logId=${encodeURIComponent(zohoCallId)}&transcriptionType=2`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" } })
            if (transcriptResponse.ok) {
              transcript = transcriptText(await transcriptResponse.json()) || null
              if (transcript) transcriptCount++
            }
          }
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
          
          const persisted = await withVoiceCallLock(String(zohoCallId), async tx => {
            if (await hasConfirmedVoiceAssociation(tx, String(zohoCallId))) return false
            if (match.status !== "MATCHED") await tx.integrationException.upsert({
              where: { integration_entityType_externalId_exceptionType: { integration: 'ZOHO_VOICE', entityType: 'CALL_LOG', externalId: zohoCallId, exceptionType: 'ACCOUNT_MATCH' } },
              update: { status: 'OPEN', externalNumber: match.normalized, summary: 'No unique customer identity; review required.', proposedMatches: match.matches.map(item => ({ accountId: item.accountId, contactId: item.id })) },
              create: { integration: 'ZOHO_VOICE', entityType: 'CALL_LOG', externalId: zohoCallId, externalNumber: match.normalized, exceptionType: 'ACCOUNT_MATCH', summary: 'No unique customer identity; review required.', confidence: 0 },
            })
          const savedCall = await tx.callLog.upsert({
            where: { zohoCallId: zohoCallId },
            update: {
              duration,
              status,
              recordingUrl: recordingUrl || undefined,
              notes: notes || undefined,
              transcript: transcript || undefined,
              zohoSentiment: zohoSentiment || undefined,
              aiSummary: aiSummary || undefined,
              accountId,
              contactId,
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
          await indexCallAndCreateSafeFollowUp(savedCall, tx)
          
          // Update Account lastCalledAt
          const acc = await tx.account.findUnique({ where: { id: accountId } })
          if (acc) {
            const currentLastCalled = acc.lastCalledAt ? new Date(acc.lastCalledAt).getTime() : 0
            if (createdAtDate.getTime() > currentLastCalled) {
              await tx.account.update({
                where: { id: accountId },
                data: { lastCalledAt: createdAtDate }
              })
            }
          }
          
            return true
          })
          if (!persisted) continue
          syncedCount++
        }
      }
      
      // Safety break to prevent infinite loop during tests
      if (fromIdx > 5000) break;
    }

    return NextResponse.json({ success: true, syncedCount, transcriptCount, ambiguousCount, debugLog })
  } catch (error: any) {
    console.error('Zoho voice sync error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
