import { NextRequest, NextResponse } from "next/server"
import { bulkSyncEntity } from "../../../../../netlify/functions/lib/bulk-sync"

export const maxDuration = 300 // 5 minutes max

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const entity = body.entity || 'invoices' // 'invoices' | 'salesorders' | 'estimates'

    console.log(`Bulk sync started for: ${entity}...`)
    const stats = await bulkSyncEntity(entity)

    return NextResponse.json({
      success: true,
      stats,
      message: `Synced ${stats.synced} ${entity} in ${stats.apiCalls} API calls (${(stats.durationMs / 1000).toFixed(1)}s). ${stats.skipped} skipped.`
    })
  } catch (error: any) {
    console.error("Bulk sync route error:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
