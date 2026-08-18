import { handler } from "../../../../../netlify/functions/vig-history"
import { NextRequest, NextResponse } from "next/server"

async function run(req: NextRequest) {
  const url = new URL(req.url)
  const event = {
    path: url.pathname,
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: null,
    isBase64Encoded: false,
  }
  try {
    const result: any = await handler(event as any, {} as any)
    return new NextResponse(result.body || "", { status: result.statusCode || 200, headers: result.headers || { "Content-Type": "application/json" } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return run(req) }
