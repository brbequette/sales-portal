import { prisma } from "@/lib/prisma"
import { withVoiceCallLock } from "@/lib/voice-call-lock"
import { evidenceHash, readRetellCall, row, transferOutcome, type retellEvidence } from "@/lib/retell-evidence"

type Evidence = ReturnType<typeof retellEvidence>
export async function confirmedRetellAssociation(retellCallId: string) {
  const matches = await prisma.operationalAction.findMany({ where: { actionType: "VOICE_MANUAL_ASSOCIATION", status: "SUCCEEDED", payload: { path: ["retellCallId"], equals: retellCallId } }, take: 2 })
  if (matches.length !== 1) return null
  const audit = matches[0]
  const zohoId = row(audit.payload).zohoCallId
  if (typeof zohoId !== "string") throw new Error("Zoho source required")
  return { audit, zohoId }
}

export async function persistRetellEvidence(evidence: Evidence, source: "API_READ" | string, actorId: string | null, deliveryFingerprint: string | null = null) {
  const match = await confirmedRetellAssociation(evidence.callId)
  if (!match) throw new Error("Unique human-confirmed association required")
  const { audit, zohoId } = match
  return withVoiceCallLock(zohoId, async tx => {
    const current = await tx.operationalAction.findUnique({ where: { id: audit.id } })
    const call = await tx.callLog.findUnique({ where: { id: audit.entityId } })
    const association = row(current?.payload)
    if (current?.status !== "SUCCEEDED" || !call || call.zohoCallId !== zohoId || call.accountId !== current.accountId || call.contactId !== association.contactId || association.retellCallId !== evidence.callId) throw new Error("Association changed")
    const hash = evidenceHash({ source, evidence, deliveryFingerprint })
    const idempotencyKey = `retell-evidence:${evidence.callId}:${hash}`
    const old = await tx.operationalAction.findUnique({ where: { idempotencyKey } })
    // Immutable evidence versions make late/duplicate events harmless. Neither
    // the existing Zoho transcript nor call/task/provider-write records change.
    if (!old) await tx.operationalAction.create({ data: {
      idempotencyKey, actionType: "RETELL_CALL_EVIDENCE", entityType: "CALL_LOG", entityId: call.id,
      accountId: call.accountId, status: "SUCCEEDED", actorId, completedAt: new Date(),
      payload: { source, evidence, deliveryFingerprint, associationBasis: "HUMAN_CONFIRMED", associationAuditId: audit.id },
      result: { providerReadVerified: source === "API_READ", existingTaskPreserved: true },
    } })
    const stored = await tx.operationalAction.findMany({ where: { actionType: "RETELL_CALL_EVIDENCE", entityId: call.id }, take: 501 })
    if (stored.length > 500) throw new Error("Evidence history requires review")
    const events = stored.map(x => String(row(x.payload).source))
    return { replay: !!old, callId: call.id, retellCallId: evidence.callId, transcript: evidence.transcript,
      transcriptAvailable: evidence.transcriptAvailable, recordingAvailable: evidence.recordingAvailable,
      associationBasis: "HUMAN_CONFIRMED", transferOutcome: transferOutcome(events, evidence.disconnectionReason),
      crmTranscript: "EXISTING_ZOHO_TRANSCRIPT_PRESERVED", recordingAccess: "EXISTING_PROTECTED_ZOHO_PLAYER", outboundActions: 0 }
  })
}

export async function reconcileRetellCall(retellCallId: string, actorId: string) {
  if (!await confirmedRetellAssociation(retellCallId)) throw new Error("Unique human-confirmed association required")
  return persistRetellEvidence(await readRetellCall(retellCallId), "API_READ", actorId)
}
