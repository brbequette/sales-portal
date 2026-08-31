import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { calculateDocumentCosts } from "../../../../../netlify/functions/lib/cost-calculations"
import { requireAdministrator } from "@/lib/auth-helpers"
import { CANCELLED_INVOICE_STATUS_VARIANTS } from "@/lib/document-status"

/**
 * POST /api/admin/fix-vig-rate
 *
 * Recalculates and re-pushes the correct VIG rate for one or many invoices.
 *
 * Body:
 *   { invoiceIds: string[], repId: string, monthKey: string, newVigRate: number }
 *   OR
 *   { fixAll: true, repId: string, monthKey: string, newVigRate: number }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { invoiceIds, fixAll, repId, monthKey, newVigRate } = body

    if (!repId || !monthKey) {
      return NextResponse.json({ success: false, error: "repId and monthKey are required" }, { status: 400 })
    }

    const vigRate = parseFloat(newVigRate) || 1.3

    // Build the list of invoice IDs to fix
    let targetIds: string[] = invoiceIds || []

    if (fixAll && targetIds.length === 0) {
      const [yyyy, mm] = monthKey.split('-').map(Number)
      const monthStart = new Date(yyyy, mm - 1, 1)
      const monthEnd = new Date(yyyy, mm, 0, 23, 59, 59)

      // PERF: scope query to this rep's accounts, not all invoices
      const allInvoices = await prisma.invoice.findMany({
        where: {
          issueDate: { gte: monthStart, lte: monthEnd },
          // Drafts are real sales here, so their VIG/costs must be recomputed too.
          status: { notIn: CANCELLED_INVOICE_STATUS_VARIANTS },
          account: { ownerId: repId }
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

    // Apply recalculation directly — no internal HTTP self-call needed
    const targetInvoices = await prisma.invoice.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, items: true, status: true }
    })

    // Build all update promises
    const updates = targetInvoices.map(async (inv: any) => {
      const items = (inv.items as any) || {}
      const itemsForCalc = { ...items, cf_salesperson_vig: vigRate }
      const calcResult = await calculateDocumentCosts(itemsForCalc)
      const updatedItems = {
        ...items,
        vigRate,
        cf_salesperson_vig: vigRate,
        deadCostTotal: calcResult.deadCostTotal,
        deadCostPlusVig: calcResult.deadCostPlusVig,
        deadProfit: calcResult.deadProfitActual,
        profit: calcResult.profit,
        salesCommission: calcResult.salesCommission
      }
      return prisma.invoice.update({ where: { id: inv.id }, data: { items: updatedItems } })
    })

    // Execute in batches of 20 to avoid DB connection saturation
    for (let i = 0; i < updates.length; i += 20) {
      await Promise.all(updates.slice(i, i + 20))
    }

    return NextResponse.json({
      success: true,
      updatedCount: targetIds.length,
      message: `Fixed ${targetIds.length} invoice(s).`
    })

  } catch (err: any) {
    console.error("[fix-vig-rate] Error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
