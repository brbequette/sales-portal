import type { Handler, HandlerContext, HandlerEvent } from "@netlify/functions"
import { NextRequest, NextResponse } from "next/server"
import { getSessionScopedNetlifyUrl } from "@/lib/netlify-session-scope"
import { databaseReadHeaders, getDatabaseFreshness, LOCAL_DATA_INCOMPLETE } from "@/lib/database-read-metadata"

type ScopeOptions = Parameters<typeof getSessionScopedNetlifyUrl>[1] & { includeDatabaseFreshness?: boolean }

export async function executeSessionScopedNetlifyHandler(
  req: NextRequest,
  handler: Handler,
  scopeOptions: ScopeOptions = {},
) {
  const startedAt = performance.now()
  const scoped = await getSessionScopedNetlifyUrl(req, scopeOptions)
  if (scoped.errorResponse) return scoped.errorResponse

  const url = scoped.url!
  const event = {
    path: url.pathname,
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : null,
    isBase64Encoded: false,
  } as HandlerEvent

  try {
    const result = await handler(event, {} as HandlerContext)
    if (!result) return new NextResponse("", { status: 200 })

    const location = result.headers?.Location || result.headers?.location
    if ((result.statusCode === 301 || result.statusCode === 302) && location) {
      return NextResponse.redirect(String(location))
    }

    const headers = new Headers()
    for (const [key, value] of Object.entries(result.headers || {})) {
      if (value !== undefined) headers.set(key, String(value))
    }
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")

    let body: BodyInit = result.isBase64Encoded && typeof result.body === "string"
      ? Buffer.from(result.body, "base64")
      : result.body || ""

    if (req.method === "GET" && scopeOptions.includeDatabaseFreshness && typeof body === "string") {
      if ((result.statusCode || 200) >= 400) {
        body = JSON.stringify({ success: false, error: LOCAL_DATA_INCOMPLETE })
      } else {
        const payload = JSON.parse(body) as Record<string, unknown>
        payload.freshness = await getDatabaseFreshness()
        body = JSON.stringify(payload)
      }
      for (const [key, value] of Object.entries(databaseReadHeaders(startedAt, 'variable'))) headers.set(key, String(value))
    }

    return new NextResponse(body, { status: result.statusCode || 200, headers })
  } catch (error: unknown) {
    console.error("Netlify compatibility handler failed:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
