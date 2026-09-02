type ZohoSmsResponse = {
  accepted: boolean
  errorMessage: string
  providerId: string | null
}

const POSITIVE_VALUES = new Set(["success", "successful", "ok", "accepted", "queued", "sent", "200", "201", "202"])
const NEGATIVE_VALUES = new Set(["error", "failed", "failure", "rejected", "denied", "invalid", "400", "401", "403", "404", "409", "422", "429", "500"])

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

export function evaluateZohoSmsResponse(response: Response, responseText: string): ZohoSmsResponse {
  const trimmed = responseText.trim()
  let payload: Record<string, any> | null = null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === "object") payload = parsed
  } catch {}

  const status = normalized(payload?.status)
  const code = normalized(payload?.code)
  const nestedStatus = normalized(payload?.data?.status || payload?.result?.status)
  const providerId = payload?.smsId || payload?.messageId || payload?.data?.smsId || payload?.data?.messageId || payload?.result?.id || null
  const explicitFailure = [status, code, nestedStatus].some((value) => NEGATIVE_VALUES.has(value))
  const explicitSuccess = [status, code, nestedStatus].some((value) => POSITIVE_VALUES.has(value)) || Boolean(providerId)

  if (response.ok && !explicitFailure && explicitSuccess) {
    return { accepted: true, errorMessage: "", providerId: providerId ? String(providerId) : null }
  }

  const providerMessage = normalized(payload?.message || payload?.error?.message)
  const fallback = !response.ok
    ? `Zoho Voice HTTP ${response.status}`
    : !trimmed
      ? "Zoho Voice returned an empty response and did not confirm acceptance"
      : "Zoho Voice did not explicitly confirm that the SMS was accepted"

  return {
    accepted: false,
    errorMessage: providerMessage || fallback,
    providerId: providerId ? String(providerId) : null,
  }
}
