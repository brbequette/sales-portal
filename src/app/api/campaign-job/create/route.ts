import { handler } from "../../../../../netlify/functions/campaign-job-create"
import { NextRequest, NextResponse } from "next/server"

async function run(req: NextRequest) {
  const url = new URL(req.url)
  const event = {
    path: url.pathname,
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : null,
    isBase64Encoded: false,
  }
  try {
    const result: any = await handler(event as any, {} as any)
    if (!result) return new NextResponse("", { status: 200 })
    return new NextResponse(result.body || "", { status: result.statusCode || 200, headers: result.headers || { "Content-Type": "application/json" } })
  } catch (error: any) {
    console.error("campaign-job/create route error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return run(req) }
export async function OPTIONS(req: NextRequest) { return run(req) }
