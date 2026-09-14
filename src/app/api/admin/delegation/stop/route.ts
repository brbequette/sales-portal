import { NextResponse } from "next/server"
import { requireMasterAdministrator } from "@/lib/auth-helpers"
import { stopDelegatedSession } from "@/lib/master-admin"

export async function POST(request: Request) {
  const auth = await requireMasterAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await request.json().catch(() => ({}))
  try {
    await stopDelegatedSession(String(body.delegationId || ""), auth.session!.user.dbId || auth.session!.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "DELEGATION_FAILED" }, { status: 400 })
  }
}
