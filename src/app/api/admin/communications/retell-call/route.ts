import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { validRetellId } from "@/lib/retell-evidence"
import { reconcileRetellCall } from "@/lib/retell-sync"

export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const actor = auth.session.user.dbId
  if (!actor) return NextResponse.json({ error: "Local administrator required" }, { status: 403 })
  try {
    const input = await req.json()
    if (!validRetellId(input.retellCallId)) return NextResponse.json({ error: "Valid Retell call ID required" }, { status: 400 })
    return NextResponse.json(await reconcileRetellCall(input.retellCallId, actor), { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Retell read/import not verified. Check credential availability and the unique audited association. Existing records were not replaced." }, { status: 409 })
  }
}
