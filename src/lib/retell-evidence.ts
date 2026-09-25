import { createHash } from "node:crypto"

export const row = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}
// Retell documents opaque IDs as well as the call_ IDs used by this account.
export const validRetellId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
export const RETELL_EVENTS = ["call_started", "call_ended", "call_analyzed", "transfer_started", "transfer_bridged", "transfer_cancelled", "transfer_ended"]

// Store only necessary evidence. Never persist signed recording URLs, arbitrary
// provider metadata, model analysis, or inferred customer identity.
export function retellEvidence(value: unknown, expectedId: string, allowSparseEvent = false) {
  const call = row(value)
  if (!validRetellId(expectedId) || call.call_id !== expectedId || (!allowSparseEvent && typeof call.agent_id !== "string")) throw new Error("Retell identity mismatch")
  const transcript = typeof call.transcript === "string" ? call.transcript : null
  if (transcript && transcript.length > 100000) throw new Error("Transcript exceeds limit")
  return {
    callId: expectedId, agentId: typeof call.agent_id === "string" ? call.agent_id : null,
    status: typeof call.call_status === "string" ? call.call_status.slice(0, 60) : "unknown",
    transcript, transcriptAvailable: !!transcript?.trim(),
    fromNumber: typeof call.from_number === "string" ? call.from_number.slice(0, 50) : null,
    toNumber: typeof call.to_number === "string" ? call.to_number.slice(0, 50) : null,
    startedAt: typeof call.start_timestamp === "number" && Number.isSafeInteger(call.start_timestamp) ? call.start_timestamp : null,
    endedAt: typeof call.end_timestamp === "number" && Number.isSafeInteger(call.end_timestamp) ? call.end_timestamp : null,
    disconnectionReason: typeof call.disconnection_reason === "string" ? call.disconnection_reason.slice(0, 100) : null,
    recordingAvailable: typeof call.recording_url === "string" && !!call.recording_url,
  }
}

export function transferOutcome(events: string[], reason: string | null) {
  const bridged = events.includes("transfer_bridged") || reason === "transfer_bridged"
  const cancelled = events.includes("transfer_cancelled") || reason === "transfer_cancelled"
  // Multiple attempts cannot be ordered from arrival order. Conflicting terminal
  // evidence remains unresolved instead of falsely reporting a successful call.
  if (bridged && cancelled) return "CONFLICTING_ATTEMPTS"
  if (bridged) return "DESTINATION_CONNECTED_NOT_HUMAN_VERIFIED"
  if (cancelled) return "CANCELLED"
  if (events.includes("transfer_started")) return "ATTEMPTED_OUTCOME_UNKNOWN"
  return "UNKNOWN"
}

export function evidenceHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex") }

export async function readRetellCall(callId: string) {
  if (!validRetellId(callId)) throw new Error("Invalid Retell ID")
  const key = process.env.RETELL_API_KEY
  if (!key) throw new Error("Retell configuration unavailable")
  const response = await fetch(`https://api.retellai.com/v2/get-call/${encodeURIComponent(callId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error("Retell read failed")
  const body = await response.text()
  if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error("Retell response exceeds limit")
  return retellEvidence(JSON.parse(body), callId)
}
