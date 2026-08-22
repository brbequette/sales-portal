import { NextRequest } from "next/server"
import { handler } from "../../../../netlify/functions/send-sms"
import { executeSessionScopedNetlifyHandler } from "@/lib/netlify-route-adapter"

export async function POST(request: NextRequest) {
  return executeSessionScopedNetlifyHandler(request, handler)
}

export async function OPTIONS(request: NextRequest) {
  return executeSessionScopedNetlifyHandler(request, handler)
}
