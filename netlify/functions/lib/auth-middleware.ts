import { getToken } from "next-auth/jwt"
import { HandlerEvent } from "@netlify/functions"

interface AuthOptions {
  requireAdmin?: boolean
  allowWebhook?: boolean
}

export async function authenticateFunction(event: HandlerEvent, options: AuthOptions = {}) {
  if (options.allowWebhook && event.queryStringParameters?.token) {
    if (event.queryStringParameters.token === process.env.ZOHO_WEBHOOK_SECRET) {
      return { userId: "webhook", role: "webhook" }
    }
  }

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set")
  }

  // getToken expects a request object with headers
  // For Next.js/NextAuth, headers need to be available. We can mock it.
  const req = {
    headers: event.headers,
    cookies: {},
  } as any

  const token = await getToken({ req, secret })

  if (!token) {
    const error: any = new Error("Unauthorized")
    error.statusCode = 401
    throw error
  }

  const role = token.role as string

  if (options.requireAdmin && role !== "Administrator" && role !== "ADMIN") {
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
