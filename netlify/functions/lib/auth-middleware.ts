import { getToken } from "next-auth/jwt"
import { Handler, HandlerEvent } from "@netlify/functions"
import crypto from "crypto"

interface AuthOptions {
  requireAdmin?: boolean
  allowWebhook?: boolean
}

function secretsMatch(supplied: string | undefined, expected: string | undefined) {
  if (!supplied || !expected) return false
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expected)
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
}

export async function authenticateFunction(event: HandlerEvent, options: AuthOptions = {}) {
  if (options.allowWebhook && event.queryStringParameters?.token) {
    if (secretsMatch(event.queryStringParameters.token, process.env.ZOHO_WEBHOOK_SECRET)) {
      return { userId: "webhook", role: "webhook" }
    }
  }

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set")
  }

  const cookieHeader = event.headers.cookie || event.headers.Cookie || ""
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=")
        if (separator < 0) return [part, ""]
        return [part.slice(0, separator), part.slice(separator + 1)]
      })
  )

  // Netlify supplies a plain header map rather than NextRequest's cookie API.
  // Parse it into the shape expected by NextAuth's JWT session store.
  const req = {
    headers: event.headers,
    cookies,
  } as any

  const token = await getToken({ req, secret })

  if (!token) {
    const error: any = new Error("Unauthorized")
    error.statusCode = 401
    throw error
  }

  const role = token.role as string

  if (options.requireAdmin && !String(role || "").toLowerCase().includes("admin")) {
    const error: any = new Error("Forbidden: Admin required")
    error.statusCode = 403
    throw error
  }

  return {
    userId: token.id as string,
    dbId: token.dbId as string,
    email: token.email as string,
    role,
  }
}

export function authErrorResponse(error: unknown, headers: Record<string, string>) {
  const statusCode = typeof (error as any)?.statusCode === "number"
    ? (error as any).statusCode
    : 500
  const message = statusCode === 401
    ? "Unauthorized"
    : statusCode === 403
      ? "Forbidden"
      : "Authentication failed"

  return {
    statusCode,
    headers,
    body: JSON.stringify({ error: message }),
  }
}

export function withFunctionAuth(handler: Handler, options: AuthOptions = {}): Handler {
  return async (event, context) => {
    if (event.httpMethod === "OPTIONS") {
      const response = await handler(event, context)
      return response || { statusCode: 204, body: "" }
    }

    try {
      await authenticateFunction(event, options)
    } catch (error) {
      return authErrorResponse(error, { "Content-Type": "application/json" })
    }

    const response = await handler(event, context)
    return response || { statusCode: 204, body: "" }
  }
}

export async function authenticateRequest(request: Request, options: AuthOptions = {}) {
  const headers = Object.fromEntries(request.headers.entries())
  return authenticateFunction({
    httpMethod: request.method,
    headers,
    body: null,
    path: new URL(request.url).pathname,
    queryStringParameters: Object.fromEntries(new URL(request.url).searchParams.entries()),
    isBase64Encoded: false,
    rawUrl: request.url,
    rawQuery: new URL(request.url).searchParams.toString(),
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  } as HandlerEvent, options)
}

export function authenticateWebhookToken(
  event: HandlerEvent,
  secretNames: string[],
  headerNames: string[] = []
) {
  const expected = secretNames.map((name) => process.env[name]).find(Boolean)
  if (!expected) {
    const error: any = new Error("Webhook secret is not configured")
    error.statusCode = 503
    throw error
  }

  const supplied = event.queryStringParameters?.token
    || headerNames.map((name) => event.headers[name.toLowerCase()]).find(Boolean)
    || event.headers["x-webhook-token"]

  if (!secretsMatch(supplied, expected)) {
    const error: any = new Error("Unauthorized")
    error.statusCode = 401
    throw error
  }

  return true
}
