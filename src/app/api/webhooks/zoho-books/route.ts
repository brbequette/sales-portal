import { NextRequest, NextResponse } from "next/server"
import { handler as zohoBooksWebhook } from "../../../../../netlify/functions/zoho-books-webhook"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Run the complete Books webhook pipeline in the self-hosted Next app. */
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const rawBody = await req.text()
  const result = await zohoBooksWebhook({
    path: url.pathname,
    rawUrl: req.url,
    httpMethod: "POST",
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    multiValueQueryStringParameters: {},
    body: rawBody,
    isBase64Encoded: false,
  } as any, {} as any, () => undefined)

  if (!result) return NextResponse.json({ success: true })
  return new NextResponse(result.body || "", {
    status: result.statusCode || 200,
    headers: result.headers as HeadersInit,
  })
}

export async function OPTIONS(req: NextRequest) {
  const url = new URL(req.url)
  const result = await zohoBooksWebhook({
    path: url.pathname,
    rawUrl: req.url,
    httpMethod: "OPTIONS",
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    multiValueQueryStringParameters: {},
    body: "",
    isBase64Encoded: false,
  } as any, {} as any, () => undefined)
  if (!result) return new NextResponse(null, { status: 204 })
  return new NextResponse(result.body || "", {
    status: result.statusCode || 204,
    headers: result.headers as HeadersInit,
  })
}

export async function GET() {
  return NextResponse.json({
    status: "Zoho Books webhook active",
    behavior: "immediate import, line-item sync, cost calculation, conflict detection, and Zoho writeback",
  })
}
