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
      take: poId ? 1 : 100,
      orderBy: { date: "desc" }
    })

    if (pos.length === 0) {
      return NextResponse.json({ success: true, suggestions: {} })
    }

    // Fetch recent candidate invoices
    const candidateInvoices = await prisma.invoice.findMany({
      take: 300,
      orderBy: { issueDate: "desc" },
      include: { account: { select: { id: true, name: true } } }
    })

    const suggestions: Record<string, any> = {}

    for (const po of pos) {
      const candidates: any[] = []

      for (const inv of candidateInvoices) {
        const { score, reasons, matchDetails } = computePOMatchScore(po, inv)
        if (score >= 30) {
          const invData = inv.items as any || {}
          candidates.push({
            invoiceId: inv.zohoId,
            invoiceNumber: invData.invoiceNumber || inv.zohoId,
            customerName: inv.account?.name || invData.customer_name || "Unknown Customer",
            issueDate: inv.issueDate,
            totalAmount: inv.amount || invData.total || 0,
            score,
            reasons,
            matchDetails
          })
        }
      }

      // Sort candidates by score descending
      candidates.sort((a, b) => b.score - a.score)

      if (candidates.length > 0) {
        // Keep top 5 candidates
        const topCandidates = candidates.slice(0, 5)
        suggestions[po.zohoId] = {
          bestMatch: topCandidates[0],
          candidates: topCandidates,
          // Legacy backwards compatibility keys
          invoiceId: topCandidates[0].invoiceId,
          invoiceNumber: topCandidates[0].invoiceNumber,
          customerName: topCandidates[0].customerName,
          issueDate: topCandidates[0].issueDate,
          score: topCandidates[0].score,
          reasons: topCandidates[0].reasons
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
