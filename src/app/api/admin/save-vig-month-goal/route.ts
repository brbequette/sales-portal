import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/admin/save-vig-month-goal
 *
 * Upserts profitGoal, subtotalGoal, workingDays, metric for a specific rep+month.
 * Used by the editable historical VIG rate rows.
 *
 * Body:
 *   { repId, monthKey, profitGoal?, subtotalGoal?, workingDays?, metric?, manualVigRate? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { repId, monthKey } = body

    if (!repId || !monthKey) {
      return NextResponse.json({ success: false, error: "repId and monthKey are required" }, { status: 400 })
    }

    const data: Record<string, any> = {}
    if (body.profitGoal   !== undefined) data.profitGoal   = parseFloat(body.profitGoal)   || 0
    if (body.subtotalGoal !== undefined) data.subtotalGoal = parseFloat(body.subtotalGoal) || 0
    if (body.workingDays  !== undefined) data.workingDays  = parseInt(body.workingDays, 10) || null
    if (body.metric       !== undefined) data.metric       = body.metric
    if (body.manualVigRate !== undefined) {
      const v = parseFloat(body.manualVigRate)
      data.manualVigRate = isNaN(v) || v <= 0 ? null : v
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 })
    }

    const result = await prisma.monthlyVigGoal.upsert({
      where:  { repId_monthKey: { repId, monthKey } },
      create: { repId, monthKey, ...data },
      update: data,
      select: { id: true, repId: true, monthKey: true, profitGoal: true, subtotalGoal: true, workingDays: true, metric: true, manualVigRate: true, lastSyncedVigRate: true }
    })

    return NextResponse.json({ success: true, record: result })
  } catch (e: any) {
    console.error("[save-vig-month-goal] Error:", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
