import { NextRequest, NextResponse } from "next/server"
import { bulkSyncPage } from "../../../../../netlify/functions/lib/bulk-sync"
import { requireAdministrator } from "@/lib/auth-helpers"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json().catch(() => ({}))
    const entity = body.entity || 'invoices'
    const page = parseInt(body.page || '1', 10)

    console.log(`Bulk sync: ${entity} page ${page}`)
    const result = await bulkSyncPage(entity, page)

    return NextResponse.json({ success: !result.error, ...result })
  } catch (error: any) {
    console.error("Bulk sync route error:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
