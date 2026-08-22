import crypto from "crypto"

/** Constant-time shared-secret verification for providers without HMAC support. */
export function hasValidWebhookToken(req: Request, configuredSecret?: string): boolean {
  const secret = String(configuredSecret || "").trim().replace(/^(["'])(.*)\1$/, "$2")
  if (!secret) return false

  const url = new URL(req.url)
  const authorization = req.headers.get("authorization") || ""
  const supplied =
    req.headers.get("x-zoho-webhook-token") ||
    req.headers.get("x-webhook-token") ||
    authorization.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    ""

  const expectedBuffer = Buffer.from(secret)
  const suppliedBuffer = Buffer.from(supplied)
  return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
}
