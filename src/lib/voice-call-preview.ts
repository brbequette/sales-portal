import { createHmac, timingSafeEqual } from "node:crypto"

export type VoiceCallEvidence = {
  zohoCallId: string
  fromNumber: string
  toNumber: string
  direction: "INBOUND" | "OUTBOUND"
  duration: number
  status: string
  startedAt: string
  recordingFilename: string | null
}

export function validateVoiceLog(payload: unknown, requestedId: string): VoiceCallEvidence {
  if (!payload || typeof payload !== "object") throw new Error("Invalid Voice response")
  const envelope = payload as Record<string, unknown>
  if (String(envelope.status).toUpperCase() === "ERROR" || !Array.isArray(envelope.logs)) throw new Error("Voice provider did not return call logs")
  const matches = envelope.logs.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && item.logid === requestedId))
  if (matches.length !== 1) throw new Error("Expected exactly one matching provider call ID")
  const log = matches[0]
  if (log.call_type !== "incoming" && log.call_type !== "outgoing") throw new Error("Unsupported call direction; review required")
  const started = Number(log.start_time)
  const date = new Date(started)
  if (!Number.isFinite(started) || started <= 0 || !Number.isFinite(date.getTime())) throw new Error("Invalid call timestamp")
  if (typeof log.caller_id_number !== "string" || !log.caller_id_number.trim() || typeof log.destination_number !== "string" || !log.destination_number.trim()) throw new Error("Missing call endpoints")
  const durationText = String(log.duration ?? "")
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(durationText)) throw new Error("Invalid provider duration")
  const parts = durationText.split(":").map(Number)
  if (parts.slice(1).some(part => part > 59)) throw new Error("Invalid provider duration")
  const duration = parts.reduce((total, part) => total * 60 + part, 0)
  const providerStatus = typeof log.hangup_cause_displayname === "string" ? log.hangup_cause_displayname.trim() : ""
  if (!providerStatus) throw new Error("Missing provider outcome")
  const filename = typeof log.recording_filename === "string" ? log.recording_filename : null
  // Only provider-returned single filenames are usable; never infer from log ID.
  const recordingFilename = filename && /^[a-zA-Z0-9_.-]{1,250}$/.test(filename) ? filename : null
  return { zohoCallId: requestedId, fromNumber: log.caller_id_number, toNumber: log.destination_number,
    direction: log.call_type === "incoming" ? "INBOUND" : "OUTBOUND", duration,
    status: providerStatus === "Successful call" ? "completed" : providerStatus,
    startedAt: date.toISOString(), recordingFilename }
}

export type VoicePreview = {
  actorId: string
  accountId: string
  contactId: string | null
  retellCallId: string
  taskId: string
  reason: string
  evidence: VoiceCallEvidence
  transcript: string
  previousUpdatedAt: string | null
  expiresAt: number
}

export function signVoicePreview(value: VoicePreview, secret: string) {
  if (!secret) throw new Error("Preview signing is not configured")
  const body = Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`
}

export function readVoicePreview(token: string, secret: string, actorId: string, now = Date.now()): VoicePreview {
  if (!secret || token.length > 250000) throw new Error("Invalid preview")
  const [body, signature, extra] = token.split(".")
  if (!body || !signature || extra) throw new Error("Invalid preview")
  const actual = Buffer.from(signature, "base64url")
  const expected = createHmac("sha256", secret).update(body).digest()
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid preview signature")
  const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as VoicePreview
  if (value.actorId !== actorId || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) throw new Error("Preview expired or belongs to another administrator")
  return value
}
