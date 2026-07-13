import { NextRequest, NextResponse } from "next/server"
import { bulkSync } from "../../../../../netlify/functions/lib/bulk-sync"

export const maxDuration = 300 // 5 minutes max

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const fullSync = body.fullSync === true

    console.log(`Bulk sync started (${fullSync ? 'FULL' : 'INCREMENTAL'})...`)
    const stats = await bulkSync({ fullSync })

    return NextResponse.json({
      success: true,
      stats,
      message: `Synced ${stats.invoices.synced} invoices, ${stats.salesOrders.synced} sales orders, ${stats.quotes.synced} quotes in ${stats.totalApiCalls} API calls (${(stats.durationMs / 1000).toFixed(1)}s)`
    })
  } catch (error: any) {
    console.error("Bulk sync route error:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
