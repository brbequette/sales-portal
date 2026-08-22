import type { NextRequest } from "next/server"
import { handler } from "../../../../netlify/functions/process-salesorder-costs"
import { executeSessionScopedNetlifyHandler } from "@/lib/netlify-route-adapter"

export async function POST(req: NextRequest) {
  return executeSessionScopedNetlifyHandler(req, handler)
}
