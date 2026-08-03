import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { computePOMatchScore } from "../suggest-matches/route"

export async function POST() {
  try {
    const unassociatedPOs = await prisma.purchaseOrder.findMany({
      where: {
        invoiceId: null,
        isInventoryOrder: false
      },
      take: 1000,
      orderBy: { date: "desc" }
    })

    const candidateInvoices = await prisma.invoice.findMany({
      take: 1000,
      orderBy: { issueDate: "desc" },
      include: { account: { select: { id: true, name: true } } }
    })

    let linkedCount = 0
    const linkedSummary: any[] = []

    for (const po of unassociatedPOs) {
      let bestMatch: any = null
      let maxScore = 0
      let matchReasons: string[] = []

      for (const inv of candidateInvoices) {
        const { score, reasons } = computePOMatchScore(po, inv)
        if (score > maxScore) {
          maxScore = score
          bestMatch = inv
          matchReasons = reasons
        }
      }

      // High confidence threshold for automatic linking (>= 75%)
      if (bestMatch && maxScore >= 75) {
        const invData = bestMatch.items as any || {}
        const finalInvoiceNum = invData.invoiceNumber || bestMatch.zohoId

        await prisma.purchaseOrder.update({
          where: { id: po.id },
          data: {
            invoiceId: bestMatch.zohoId,
            invoiceNumber: finalInvoiceNum
          }
        })

        linkedCount++
        linkedSummary.push({
          poZohoId: po.zohoId,
          poTotal: po.total,
          invoiceNumber: finalInvoiceNum,
          customer: bestMatch.account?.name || invData.customer_name,
          score: maxScore,
          reasons: matchReasons
        })
      }
    }

    return NextResponse.json({
      success: true,
      linkedCount,
      linkedSummary,
      message: `Successfully auto-matched and linked ${linkedCount} Purchase Orders to Invoices with high confidence.`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
