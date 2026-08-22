import type { NextRequest } from "next/server"
import { handler } from "../../../../netlify/functions/get-invoice-details"
import { executeSessionScopedNetlifyHandler } from "@/lib/netlify-route-adapter"

export async function GET(req: NextRequest) {
  return executeSessionScopedNetlifyHandler(req, handler)
}
