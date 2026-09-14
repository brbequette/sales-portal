import { NextResponse } from "next/server"
import { requireMasterAdministrator } from "@/lib/auth-helpers"
import { startDelegatedSession } from "@/lib/master-admin"

export async function POST(request: Request) {
  const auth = await requireMasterAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await request.json().catch(() => ({}))
  try {
    const delegation = await startDelegatedSession({
      actorUserId: auth.session!.user.dbId || auth.session!.user.id,
      subjectUserId: String(body.subjectUserId || ""),
      reason: String(body.reason || ""),
      sessionId: request.headers.get("x-request-id") || undefined,
    })
    return NextResponse.json({ success: true, delegation })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "DELEGATION_FAILED" }, { status: 400 })
  }
}
