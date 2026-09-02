import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { syncEnabledMicrosoftMailboxes, syncMicrosoftMailbox } from "@/lib/microsoft-graph-mail"

export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const body = await req.json().catch(() => ({})) as { mailboxId?: string; lookbackDays?: number; maxPerFolder?: number }
    if (body.mailboxId) {
      const result = await syncMicrosoftMailbox(body)
      return NextResponse.json({ success: true, results: [result], processed: result.processed, createdEvents: result.createdEvents })
    }
    const results = await syncEnabledMicrosoftMailboxes({ maxPerFolder: body.maxPerFolder })
    return NextResponse.json({ success: true, results, processed: results.reduce((sum, item) => sum + item.processed, 0), createdEvents: results.reduce((sum, item) => sum + item.createdEvents, 0) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
