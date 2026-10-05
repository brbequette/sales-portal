import { NextResponse } from "next/server"
import { getAuthenticatedDbUser } from "@/lib/session-user"
import { isAdministratorRole } from "@/lib/roles"
import { sameOriginEmailRequest } from "@/lib/email-intelligence-guards"
import { syncEnabledMicrosoftMailboxes, syncMicrosoftMailbox } from "@/lib/microsoft-graph-mail"

export async function POST(req: Request) {
  if (!sameOriginEmailRequest(req)) return NextResponse.json({ error: "Same-origin request required" }, { status: 403 })
  const auth = await getAuthenticatedDbUser()
  if (!auth || !isAdministratorRole(auth.user.role)) return NextResponse.json({ error: "Administrator access required" }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({})) as { mailboxId?: string; lookbackDays?: number; maxPerFolder?: number }
    if (body.mailboxId) {
      const result = await syncMicrosoftMailbox(body)
      return NextResponse.json({ success: result.errors.length === 0, results: [result], processed: result.processed, createdEvents: result.createdEvents })
    }
    const results = await syncEnabledMicrosoftMailboxes({ maxPerFolder: body.maxPerFolder })
    return NextResponse.json({ success: results.every(result => !result.errors.length), results, processed: results.reduce((sum, item) => sum + item.processed, 0), createdEvents: results.reduce((sum, item) => sum + item.createdEvents, 0) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
