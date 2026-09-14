export type MailContentFailureCode = "URL_RULE_NOT_CONFIGURED" | "NOT_FOUND" | "TRANSIENT_HTTP" | "HTTP_FAILURE"

export type MailContentResponse = { ok: boolean; status: number; json(): Promise<unknown> }
export type MailContentPayload = { data?: { content?: string } }

export function buildMailContentUrl(baseUrl: string, accountId: string, folderId: string, messageId: string) {
  if (!accountId || !folderId || !messageId) throw new Error("MAIL_CONTENT_ROUTE_IDENTIFIERS_MISSING")
  return `${baseUrl}/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/content`
}

export function classifyMailContentFailure(status: number, body: unknown): { code: MailContentFailureCode; retryable: boolean } {
  const code = typeof body === "object" && body !== null && "data" in body && typeof (body as { data?: unknown }).data === "object"
    ? String(((body as { data?: { errorCode?: unknown } }).data)?.errorCode || "")
    : typeof body === "object" && body !== null && "errorCode" in body ? String((body as { errorCode?: unknown }).errorCode || "") : ""
  if (status === 404 && code === "URL_RULE_NOT_CONFIGURED") return { code, retryable: false }
  if (status === 404) return { code: "NOT_FOUND", retryable: false }
  if (status === 408 || status === 429 || status >= 500) return { code: "TRANSIENT_HTTP", retryable: true }
  return { code: "HTTP_FAILURE", retryable: false }
}

export async function requestMailContent(input: {
  baseUrl: string
  accountId: string
  folderId: string
  messageId: string
  token: string
  fetchImpl: (url: string, init: { headers: Record<string, string> }) => Promise<MailContentResponse>
}) {
  const url = buildMailContentUrl(input.baseUrl, input.accountId, input.folderId, input.messageId)
  const response = await input.fetchImpl(url, { headers: { Authorization: `Zoho-oauthtoken ${input.token}` } })
  if (response.ok) return await response.json() as MailContentPayload
  let body: unknown = null
  try { body = await response.json() } catch { /* classification does not require a body */ }
  const failure = classifyMailContentFailure(response.status, body)
  const error = Object.assign(new Error(failure.code), failure)
  throw error
}
