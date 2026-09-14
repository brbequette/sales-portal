import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { computePOMatchScore } from "./match-score"

export async function GET(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const poId = searchParams.get("poId")

    const poWhere: any = { invoiceId: null, isInventoryOrder: false }
    if (poId) poWhere.OR = [{ id: poId }, { zohoId: poId }]

    const pos = await prisma.purchaseOrder.findMany({
      where: poWhere,
      take: poId ? 1 : 50,
      orderBy: { date: "desc" }
    })

    if (pos.length === 0) {
      return NextResponse.json({ success: true, matches: {} })
    }

    // Fetch recent candidate invoices
    const candidateInvoices = await prisma.invoice.findMany({
      take: 200,
      orderBy: { issueDate: "desc" },
      include: { account: { select: { id: true, name: true } } }
    })

    const suggestions: Record<string, any> = {}

    for (const po of pos) {
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

      if (bestMatch && maxScore >= 40) {
        const invData = bestMatch.items as any || {}
        suggestions[po.zohoId] = {
          invoiceId: bestMatch.zohoId,
          invoiceNumber: invData.invoiceNumber || bestMatch.zohoId,
          customerName: bestMatch.account?.name || invData.customer_name || "Unknown Customer",
          issueDate: bestMatch.issueDate,
          score: maxScore,
          reasons: matchReasons
        }
      }
    }

    return NextResponse.json({
      success: true,
      suggestions
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
