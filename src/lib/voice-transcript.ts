// Zoho documents transcribeObj as serialized JSON containing transcriptJson.
// Never store analysis objects or provider errors as spoken transcript text.
export function transcriptText(payload: unknown, depth = 0): string {
  if (depth > 12 || payload == null) return ""
  if (typeof payload === "string") {
    const value = payload.trim()
    if (!value) return ""
    try { return transcriptText(JSON.parse(value), depth + 1) }
    catch { return /^[{\[]/.test(value) ? "" : value }
  }
  if (Array.isArray(payload)) return payload.map(item => transcriptText(item, depth + 1)).filter(Boolean).join("\n")
  if (typeof payload !== "object") return ""
  const record = payload as Record<string, unknown>
  if (String(record.status || "").toUpperCase() === "ERROR") return ""
  for (const key of ["transcribeObj", "transcriptJson", "transcription", "transcript", "transcripts", "segments", "text", "data"]) {
    if (record[key] != null) {
      const result = transcriptText(record[key], depth + 1)
      if (result) return result
    }
  }
  return ""
}
