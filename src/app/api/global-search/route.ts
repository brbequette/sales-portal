import { handler } from "../../../../netlify/functions/global-search"
import { executeSessionScopedNetlifyHandler } from "@/lib/netlify-route-adapter"
import type { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim()
  if (!query || query.length < 2) return Response.json({ results: [] })
  return executeSessionScopedNetlifyHandler(req, handler)
}

const execute = (req: NextRequest) => executeSessionScopedNetlifyHandler(req, handler)
export const POST = execute
export const PUT = execute
export const DELETE = execute
export const OPTIONS = execute
