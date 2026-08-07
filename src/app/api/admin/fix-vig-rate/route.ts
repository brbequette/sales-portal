import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/admin/fix-vig-rate
 *
 * Recalculates and re-pushes the correct VIG rate for one or many invoices.
 *
 * Body:
 *   { invoiceIds: string[], repId: string, monthKey: string, newVigRate: number }
 *   OR
 *   { fixAll: true, repId: string, monthKey: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { invoiceIds, fixAll, repId, monthKey, newVigRate } = body

    if (!repId || !monthKey) {
      return NextResponse.json({ success: false, error: "repId and monthKey are required" }, { status: 400 })
    }

    const vigRate = parseFloat(newVigRate) || 1.3

    // If fixAll, find all mismatched invoices for this rep+month
    let targetIds: string[] = invoiceIds || []

    if (fixAll && targetIds.length === 0) {
      // Find all invoices in this month for this rep where stored vig != vigRate
      const [yyyy, mm] = monthKey.split('-').map(Number)
      const monthStart = new Date(yyyy, mm - 1, 1)
      const monthEnd = new Date(yyyy, mm, 0, 23, 59, 59)

      const user = await prisma.user.findUnique({
        where: { id: repId },
        select: { name: true }
      })

      const allInvoices = await prisma.invoice.findMany({
        where: {
          issueDate: { gte: monthStart, lte: monthEnd },
          NOT: { status: { in: ['Void', 'Draft'] } },
          ...(user ? {
            OR: [
              { account: { owner: { id: repId } } },
              { items: { path: ['salesperson'], string_contains: user.name || '' } }
            ]
          } : {})
        },
        select: { id: true, items: true }
      })

      targetIds = allInvoices
        .filter((inv: any) => {
          const items = (inv.items as any) || {}
          const storedVig = parseFloat(items.cf_salesperson_vig ?? items.vigRate ?? 0) || 1.3
          return Math.abs(storedVig - vigRate) > 0.01
        })
        .map((inv: any) => inv.id)
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ success: true, updatedCount: 0, message: "No invoices needed fixing." })
    }

    // Trigger recalculation via the existing recalculate-vig-documents endpoint
    const res = await fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/admin/recalculate-vig-documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceIds: targetIds, repId, monthKey, newVigRate: vigRate })
    })
    const data = await res.json()

    return NextResponse.json({
      success: data.success ?? res.ok,
      updatedCount: data.updatedCount ?? targetIds.length,
      message: data.message || `Fixed ${targetIds.length} invoice(s).`,
      error: data.error
    })

  } catch (err: any) {
    console.error("[fix-vig-rate] Error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
