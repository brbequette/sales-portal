import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken, ZOHO_DC } from "@/lib/zoho-auth"
import { withVoiceCallLock } from "@/lib/voice-call-lock"

type Row = Record<string, unknown>
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const providerId = (value: unknown) => typeof value === "string" && /^\d{15,25}$/.test(value)
export type CrmVoiceInput = { zohoCallId: string; retellCallId: string; taskId: string; reason: string; crmAccountId: string; crmContactId: string | null; direction: string; duration: number; status: string; startedAt: Date; transcript: string }
export function crmVoicePayload(input: CrmVoiceInput) {
  if (!providerId(input.crmAccountId) || (input.crmContactId !== null && !providerId(input.crmContactId))) throw new Error("Authoritative CRM mappings required")
  if (!/^[a-f0-9-]{36}$/i.test(input.zohoCallId) || !/^call_[a-zA-Z0-9]+$/.test(input.retellCallId) || !providerId(input.taskId)) throw new Error("Valid provider references required")
  if (input.status.toLowerCase() !== "completed" || !["INBOUND", "OUTBOUND"].includes(input.direction) || !Number.isInteger(input.duration) || input.duration <= 0 || input.duration > 86400) throw new Error("Only verified completed calls with positive duration are supported")
  if (!Number.isFinite(input.startedAt.getTime()) || input.startedAt.getTime() > Date.now()) throw new Error("Invalid completed-call time")
  if (!input.transcript.trim()) throw new Error("Transcript required")
  const description = `Human-confirmed association; not automated caller matching.\nZoho Voice: ${input.zohoCallId}\nRetell reference: ${input.retellCallId}\nExisting CRM task: ${input.taskId}\nReason: ${input.reason}\n\nProvider transcript (retain uncertain specifications):\n${input.transcript}`
  if (description.length > 30000) throw new Error("Transcript exceeds safe CRM description size; no truncation performed")
  return { Subject: `Voice ${input.zohoCallId}`, What_Id: { id: input.crmAccountId }, $se_module: "Accounts",
    ...(input.crmContactId ? { Who_Id: { id: input.crmContactId } } : {}),
    Call_Type: input.direction === "INBOUND" ? "Inbound" : "Outbound",
    Call_Start_Time: input.startedAt.toISOString().replace(".000Z", "+00:00"),
    // The live CRM form identifies these components as minutes and seconds.
    Call_Duration: `${String(Math.floor(input.duration / 60)).padStart(2, "0")}:${String(input.duration % 60).padStart(2, "0")}`,
    ...(input.direction === "OUTBOUND" ? { Outbound_Call_Status: "Completed" } : {}), Description: description }
}
export function verifyCrmVoiceRecord(value: unknown, expected: ReturnType<typeof crmVoicePayload>) {
  const row = record(value)
  if (!providerId(row.id) || row.Subject !== expected.Subject || row.Description !== expected.Description || row.Call_Type !== expected.Call_Type ||
      record(row.What_Id).id !== expected.What_Id.id || (record(row.Who_Id).id || null) !== (expected.Who_Id?.id || null) ||
      new Date(String(row.Call_Start_Time)).getTime() !== new Date(expected.Call_Start_Time).getTime() || row.Call_Duration !== expected.Call_Duration) return null
  if (expected.Call_Type === "Outbound" && row.Outgoing_Call_Status !== "Completed") return null
  const parts = expected.Call_Duration.split(":").map(Number)
  if (row.Call_Duration_in_seconds !== undefined && Number(row.Call_Duration_in_seconds) !== parts[0] * 60 + parts[1]) return null
  return String(row.id)
}

export async function syncCrmVoiceCall(callId: string) {
  const source = await prisma.callLog.findUnique({ where: { id: callId }, select: { zohoCallId: true } })
  if (!source?.zohoCallId) throw new Error("Provider call required")
  const prepared = await withVoiceCallLock(source.zohoCallId, async tx => {
    const call = await tx.callLog.findUnique({ where: { id: callId }, include: { account: true, contact: true } })
    const audit = await tx.operationalAction.findUnique({ where: { idempotencyKey: `voice-manual-association:${source.zohoCallId}` } })
    if (!call || audit?.status !== "SUCCEEDED" || audit.entityId !== call.id || audit.accountId !== call.accountId) throw new Error("Confirmed audited association required")
    const evidence = record(audit.payload)
    if (evidence.contactId !== call.contactId || (call.contact && call.contact.accountId !== call.accountId)) throw new Error("Contact association changed")
    const task = await tx.task.findUnique({ where: { zohoId: String(evidence.taskId) }, select: { accountId: true } })
    if (task?.accountId !== call.accountId) throw new Error("Preserved task association changed")
    const payload = crmVoicePayload({ zohoCallId: source.zohoCallId!, retellCallId: String(evidence.retellCallId), taskId: String(evidence.taskId), reason: String(evidence.reason),
      crmAccountId: call.account.crmAccountId || "", crmContactId: call.contactId ? call.contact?.crmContactId || "" : null,
      direction: call.direction, duration: call.duration, status: call.status, startedAt: call.createdAt, transcript: call.transcript || "" })
    const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex")
    const operationKey = `crm:voice-call:create:${source.zohoCallId}`
    const operation = await tx.providerWriteOperation.upsert({ where: { operationKey }, update: {}, create: {
      operationKey, provider: "ZOHO_CRM", entityType: "CALL_LOG", entityId: call.id, operation: "CREATE_CALL", requestFingerprint: fingerprint,
    } })
    if (operation.requestFingerprint !== fingerprint) throw new Error("CRM call evidence changed; explicit reconciliation required")
    return { operation, payload, operationKey }
  })
  const { operation, payload, operationKey } = prepared
  const token = await getZohoAccessToken()
  if (!token) throw new Error("CRM connection unavailable")
  if (!["com", "eu", "in", "com.au", "jp", "ca", "com.cn", "sa"].includes(ZOHO_DC)) throw new Error("Unsupported CRM data center")
  const base = `https://www.zohoapis.${ZOHO_DC}/crm/v8/Calls`
  const headers = { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" }
  const get = async (url: string) => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store" })
    if (response.status === 204) return { data: [] } as Row
    if (!response.ok) throw new Error("CRM verification read failed")
    return record(await response.json())
  }
  const savedId = record(operation.providerRecordIds).callId
  // Reconciliation is read-only for every non-PENDING operation, including
  // rejected requests. A missing search result never authorizes resubmission.
  const found = await get(providerId(savedId) ? `${base}/${savedId}` : `${base}/search?criteria=${encodeURIComponent(`(Subject:equals:${payload.Subject})`)}`)
  if (!Array.isArray(found.data) || record(found.info).more_records === true) throw new Error("Incomplete CRM reconciliation result")
  if (found.data.length) {
    const id = found.data.length === 1 ? verifyCrmVoiceRecord(found.data[0], payload) : null
    if (!id || (providerId(savedId) && id !== savedId)) {
      await prisma.providerWriteOperation.updateMany({ where: { operationKey, state: "PENDING" }, data: { state: "AMBIGUOUS", lastError: "Existing CRM call mismatch or multiple candidates" } })
      return { state: "AMBIGUOUS", nativeCrmCallSynced: false, message: "Existing CRM call differs or multiple candidates exist; manual review required" }
    }
    await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "SUCCEEDED", providerRecordIds: { callId: id }, completedAt: new Date(), lastError: null } })
    return { state: "SUCCEEDED", nativeCrmCallSynced: true, crmCallId: id }
  }
  if (operation.state !== "PENDING") return { state: operation.state, nativeCrmCallSynced: false, message: "No verified CRM record found. No resubmission performed." }
  const claimed = await prisma.providerWriteOperation.updateMany({ where: { operationKey, state: "PENDING" }, data: { state: "SYNCING", attemptCount: { increment: 1 }, lastAttemptAt: new Date() } })
  if (claimed.count !== 1) return { state: "SYNCING", nativeCrmCallSynced: false, message: "Another request owns this operation" }
  let id: string | null = null
  try {
    const response = await fetch(base, { method: "POST", headers, signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store", body: JSON.stringify({ data: [payload], trigger: [] }) })
    const result = record(await response.json())
    const row = Array.isArray(result.data) && result.data.length === 1 ? record(result.data[0]) : {}
    const details = record(row.details)
    if (response.ok && row.status === "success" && providerId(details.id)) id = String(details.id)
    if (!id) {
      // Only an explicit per-record rejection is a definitive failure. HTTP
      // status, malformed success, timeout and proxy errors remain ambiguous.
      const state = row.status === "error" && typeof row.code === "string" && response.status < 500 ? "FAILED" : "AMBIGUOUS"
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state, providerCode: typeof row.code === "string" ? row.code : `HTTP_${response.status}`, lastError: "CRM call not verified; do not automatically resend" } })
      return { state, nativeCrmCallSynced: false }
    }
    await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", providerRecordIds: { callId: id }, providerCode: "ACCEPTED_AWAITING_VERIFICATION" } })
    const verified = await get(`${base}/${id}`)
    if (!Array.isArray(verified.data) || verified.data.length !== 1 || verifyCrmVoiceRecord(verified.data[0], payload) !== id) throw new Error("CRM record readback mismatch")
    await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "SUCCEEDED", completedAt: new Date(), lastError: null } })
    return { state: "SUCCEEDED", nativeCrmCallSynced: true, crmCallId: id }
  } catch {
    await prisma.providerWriteOperation.updateMany({ where: { operationKey, state: { in: ["SYNCING", "AMBIGUOUS"] } }, data: { state: "AMBIGUOUS", lastError: "Provider outcome or persistence uncertain; reconcile without resending", ...(id ? { providerRecordIds: { callId: id } } : {}) } })
    return { state: "AMBIGUOUS", nativeCrmCallSynced: false, ...(id ? { crmCallId: id } : {}) }
  }
}
