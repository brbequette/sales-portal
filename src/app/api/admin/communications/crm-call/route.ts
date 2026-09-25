import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { syncCrmVoiceCall } from "@/lib/zoho-crm-voice"

export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const input = await req.json()
    if (typeof input.callId !== "string" || !input.callId || input.callId.length > 100) return NextResponse.json({ error: "Portal call ID required" }, { status: 400 })
    const result = await syncCrmVoiceCall(input.callId)
    return NextResponse.json(result, { status: result.nativeCrmCallSynced ? 200 : 409 })
  } catch {
    return NextResponse.json({ error: "CRM call synchronization could not be verified. Check mappings and operation status before retrying; uncertain writes are never automatically resent." }, { status: 409 })
  }
}
