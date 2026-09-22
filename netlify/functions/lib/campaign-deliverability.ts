export function normalizeE164(value: string): string | null {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`
  return null
}

export type DeliveryClassification = { deliverability: string; suppression: string; permanent: boolean; reason: string }

export function classifyProviderOutcome(code: string | null, status: string | null, message: string | null): DeliveryClassification {
  const value = `${code || ""} ${status || ""} ${message || ""}`.toLowerCase()
  if (/stop|opt.?out|unsubscribe/.test(value)) return { deliverability: "OPTED_OUT", suppression: "OPT_OUT_SUPPRESSED", permanent: true, reason: "Explicit provider opt-out" }
  if (/landline|not sms capable|non.?mobile/.test(value)) return { deliverability: "LANDLINE_NON_MOBILE", suppression: "TECHNICAL_SUPPRESSED", permanent: true, reason: "Number is not SMS capable" }
  if (/invalid|nonexistent|not exist/.test(value)) return { deliverability: "INVALID", suppression: "TECHNICAL_SUPPRESSED", permanent: true, reason: "Invalid or nonexistent number" }
  if (/zvsms-4027|unsupported.*country/.test(value)) return { deliverability: "UNSUPPORTED_COUNTRY", suppression: "TECHNICAL_SUPPRESSED", permanent: true, reason: "Unsupported destination country" }
  if (/blocked|permanent.*reject/.test(value)) return { deliverability: "CARRIER_BLOCKED", suppression: "TECHNICAL_SUPPRESSED", permanent: true, reason: "Carrier permanently blocked destination" }
  if (/timeout|rate.?limit|429|temporar|unavailable|500|502|503|504|authentication/.test(value)) return { deliverability: "TEMPORARILY_UNAVAILABLE", suppression: "ELIGIBLE", permanent: false, reason: "Temporary provider failure" }
  return { deliverability: "MANUAL_REVIEW", suppression: "ELIGIBLE", permanent: false, reason: "Unclassified provider outcome" }
}

export function normalizeDeliveryStatus(value: unknown): string {
  const status = String(value || "unknown").trim().toLowerCase()
  return new Set(["submitted", "queued", "sent", "delivered", "undeliverable", "rejected", "blocked", "expired", "unknown"]).has(status) ? status : "unknown"
}
