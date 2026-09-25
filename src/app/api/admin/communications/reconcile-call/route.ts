import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getZohoVoiceAccessToken } from "@/lib/zoho-voice-auth"
import { transcriptText } from "@/lib/voice-transcript"
import { readVoicePreview, signVoicePreview, validateVoiceLog, type VoicePreview } from "@/lib/voice-call-preview"

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const actorId = auth.session.user.dbId
  if (!actorId) return NextResponse.json({ error: "Local administrator identity required" }, { status: 403 })
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return NextResponse.json({ error: "Preview signing unavailable" }, { status: 503 })
  try {
    const input = await req.json()
    if (input.mode === "preview") {
      const { zohoCallId, accountId, contactId = null, retellCallId, taskId, reason } = input
      if (typeof zohoCallId !== "string" || !uuid.test(zohoCallId) || typeof accountId !== "string" ||
          typeof retellCallId !== "string" || !/^call_[a-zA-Z0-9]+$/.test(retellCallId) ||
          typeof taskId !== "string" || typeof reason !== "string" || reason.trim().length < 20 || reason.length > 2000 ||
          (contactId !== null && typeof contactId !== "string")) return NextResponse.json({ error: "Valid source IDs, account, existing task and association reason required" }, { status: 400 })
      const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, name: true, zohoId: true } })
      if (!account || account.zohoId === "unknown-voice-caller") return NextResponse.json({ error: "Select a real account" }, { status: 400 })
      if (contactId && !await prisma.contact.findFirst({ where: { id: contactId, accountId }, select: { id: true } })) return NextResponse.json({ error: "Contact does not belong to account" }, { status: 400 })
      const task = await prisma.task.findUnique({ where: { zohoId: taskId }, select: { id: true, accountId: true } })
      if (!task || task.accountId !== accountId) return NextResponse.json({ error: "Existing CRM-backed task must belong to the selected account" }, { status: 409 })
      const accessToken = await getZohoVoiceAccessToken()
      if (!accessToken) return NextResponse.json({ error: "Voice connection unavailable" }, { status: 503 })
      const headers = { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" }
      const response = await fetch(`https://voice.zoho.com/rest/json/zv/logs/${encodeURIComponent(zohoCallId)}`, { headers, signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error" })
      if (!response.ok) return NextResponse.json({ error: `Voice call read failed (${response.status})` }, { status: 502 })
      const evidence = validateVoiceLog(await response.json(), zohoCallId)
      const transcriptResponse = await fetch(`https://voice.zoho.com/rest/json/zv/transcribe?logId=${encodeURIComponent(zohoCallId)}&transcriptionType=2`, { headers, signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error" })
      if (!transcriptResponse.ok) return NextResponse.json({ error: `Transcript read failed (${transcriptResponse.status})` }, { status: 502 })
      const transcript = transcriptText(await transcriptResponse.json())
      if (!transcript || transcript.length > 100000) return NextResponse.json({ error: "Usable transcript not available; no changes applied" }, { status: 409 })
      const previous = await prisma.callLog.findUnique({ where: { zohoCallId }, select: { accountId: true, updatedAt: true } })
      const preview: VoicePreview = { actorId, accountId, contactId, retellCallId, taskId, reason: reason.trim(), evidence, transcript,
        previousUpdatedAt: previous?.updatedAt.toISOString() || null, expiresAt: Date.now() + 5 * 60 * 1000 }
      return NextResponse.json({ preview, accountName: account.name, previousAccountId: previous?.accountId || null,
        associationBasis: "HUMAN_CONFIRMED", retellVerification: "REFERENCE_ONLY_NOT_PROVIDER_VERIFIED", token: signVoicePreview(preview, secret) })
    }
    if (input.mode !== "apply" || typeof input.token !== "string") return NextResponse.json({ error: "Expected preview or apply" }, { status: 400 })
    const preview = readVoicePreview(input.token, secret, actorId)
    const { evidence, accountId, contactId } = preview
    const key = `voice-manual-association:${evidence.zohoCallId}`
    const result = await prisma.$transaction(async tx => {
      const prior = await tx.operationalAction.findUnique({ where: { idempotencyKey: key } })
      if (prior) {
        if (prior.status !== "SUCCEEDED" || prior.accountId !== accountId) throw new Error("Call already has a different or incomplete audited association")
        const priorPayload = prior.payload as Record<string, unknown> | null
        if (priorPayload?.retellCallId !== preview.retellCallId || priorPayload?.taskId !== preview.taskId || priorPayload?.contactId !== contactId) throw new Error("Existing association differs; explicit review required")
        const saved = await tx.callLog.findUnique({ where: { zohoCallId: evidence.zohoCallId } })
        if (!saved || saved.id !== prior.entityId || saved.accountId !== accountId || saved.contactId !== contactId) throw new Error("Audited association no longer matches stored call; review required")
        return { replay: true, callId: prior.entityId }
      }
      const current = await tx.callLog.findUnique({ where: { zohoCallId: evidence.zohoCallId } })
      if ((current?.updatedAt.toISOString() || null) !== preview.previousUpdatedAt) throw new Error("Call changed after preview; preview again")
      const task = await tx.task.findUnique({ where: { zohoId: preview.taskId }, select: { accountId: true } })
      if (!task || task.accountId !== accountId) throw new Error("Task association changed after preview")
      if (contactId && !await tx.contact.findFirst({ where: { id: contactId, accountId }, select: { id: true } })) throw new Error("Contact association changed after preview")
      const data = { accountId, contactId, fromNumber: evidence.fromNumber, toNumber: evidence.toNumber, direction: evidence.direction,
        duration: evidence.duration, status: evidence.status, transcript: preview.transcript,
        createdAt: new Date(evidence.startedAt) }
      const call = await tx.callLog.upsert({ where: { zohoCallId: evidence.zohoCallId }, update: data,
        create: { ...data, zohoCallId: evidence.zohoCallId, authorId: actorId } })
      const metadata = { associationBasis: "HUMAN_CONFIRMED", zohoCallId: evidence.zohoCallId, retellCallId: preview.retellCallId,
        taskId: preview.taskId, recordingFilename: evidence.recordingFilename, reason: preview.reason }
      await tx.communicationEvent.updateMany({ where: { sourceId: call.id, sourceType: { in: ["CALL_LOG", "CallLog"] } }, data: { accountId, contactId } })
      await tx.communicationEvent.upsert({ where: { sourceType_sourceId_eventType: { sourceType: "CALL_LOG", sourceId: call.id, eventType: "CALL" } },
        update: { accountId, contactId, occurredAt: data.createdAt, metadata, summary: `Voice call: ${evidence.status}` },
        create: { accountId, contactId, actorId, sourceType: "CALL_LOG", sourceId: call.id, eventType: "CALL", channel: "VOICE", direction: data.direction,
          occurredAt: data.createdAt, metadata, summary: `Voice call: ${evidence.status}` } })
      await tx.operationalAction.create({ data: { idempotencyKey: key, actionType: "VOICE_MANUAL_ASSOCIATION", entityType: "CALL_LOG", entityId: call.id,
        accountId, status: "SUCCEEDED", actorId, completedAt: new Date(), payload: { ...metadata, contactId, previousAccountId: current?.accountId || null },
        result: { callId: call.id, nativeCrmCallSynced: false, taskPreserved: true } } })
      return { replay: false, callId: call.id }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ success: true, ...result, nativeCrmCallSynced: false, outboundActions: 0 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return NextResponse.json({ error: "Concurrent update; reconcile before retrying" }, { status: 409 })
    // Do not expose provider response bodies, tokens, or database details.
    return NextResponse.json({ error: "Voice reconciliation could not complete. Refresh the preview and review provider availability and current associations." }, { status: 409 })
  }
}
