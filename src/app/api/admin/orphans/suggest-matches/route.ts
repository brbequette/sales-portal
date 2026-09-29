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
    const poIdsParam = searchParams.get("poIds")

    const poWhere: any = { invoiceId: null, isInventoryOrder: false }
    if (poId) {
      poWhere.OR = [{ id: poId }, { zohoId: poId }]
    } else if (poIdsParam) {
      const splitIds = poIdsParam.split(",").map(s => s.trim()).filter(Boolean)
      if (splitIds.length > 0) {
        poWhere.OR = [
          { id: { in: splitIds } },
          { zohoId: { in: splitIds } }
        ]
      }
    }

    const pos = await prisma.purchaseOrder.findMany({
      where: poWhere,
      take: (poId || poIdsParam) ? 50 : 25,
      orderBy: { date: "desc" }
    })

    if (pos.length === 0) {
      return NextResponse.json({ success: true, suggestions: {} })
    }

    const accountSelect = {
      id: true,
      name: true,
      shippingStreet: true,
      shippingCity: true,
      shippingState: true,
      shippingZip: true,
      billingStreet: true,
      billingCity: true,
      billingState: true,
      billingZip: true
    }

    // Fetch candidate sales documents across Invoices, Sales Orders, and Quotes (Estimates)
    const [candidateInvoices, candidateSalesOrders, candidateQuotes] = await Promise.all([
      prisma.invoice.findMany({
        take: 1500,
        orderBy: { issueDate: "desc" },
        include: { account: { select: accountSelect } }
      }),
      prisma.salesOrder.findMany({
        take: 800,
        orderBy: { orderDate: "desc" },
        include: { account: { select: accountSelect } }
      }),
      prisma.quote.findMany({
        take: 800,
        orderBy: { createdAt: "desc" },
        include: { account: { select: accountSelect } }
      })
    ])

    const suggestions: Record<string, any> = {}
    let autoApprovedCount = 0
    const autoApprovedSummary: any[] = []

    for (const po of pos) {
      const candidates: any[] = []

      // 1. Score against candidate Invoices
      for (const inv of candidateInvoices) {
        const { score, reasons, matchDetails } = computePOMatchScore(po, inv)
        if (score >= 30) {
          const invData: any = inv.items || {}
          const invNum = inv.invoiceNumber || invData.invoiceNumber || inv.zohoId
          candidates.push({
            docId: inv.zohoId,
            docType: "Invoice",
            docNumber: invNum,
            invoiceId: inv.zohoId,
            invoiceNumber: invNum,
            customerName: inv.account?.name || invData.customer_name || "Unknown Customer",
            issueDate: inv.issueDate,
            totalAmount: inv.amount || invData.total || 0,
            score,
            reasons,
            matchDetails
          })
        }
      }

      // 2. Score against candidate Sales Orders
      for (const so of candidateSalesOrders) {
        const { score, reasons, matchDetails } = computePOMatchScore(po, so)
        if (score >= 30) {
          const soData: any = so.items || {}
          const soNum = soData.salesorder_number || soData.so_number || so.zohoId
          candidates.push({
            docId: so.zohoId,
            docType: "SalesOrder",
            docNumber: `SO #${soNum}`,
            invoiceId: so.zohoId,
            invoiceNumber: String(soNum),
            customerName: so.account?.name || soData.customer_name || "Unknown Customer",
            issueDate: so.orderDate,
            totalAmount: so.amount || soData.total || 0,
            score,
            reasons,
            matchDetails
          })
        }
      }

      // 3. Score against candidate Estimates (Quotes)
      for (const qte of candidateQuotes) {
        const { score, reasons, matchDetails } = computePOMatchScore(po, qte)
        if (score >= 30) {
          const qData: any = qte.items || {}
          const qNum = qData.quote_number || qData.estimate_number || qData.number || qte.zohoId
          candidates.push({
            docId: qte.zohoId,
            docType: "Estimate",
            docNumber: `Est #${qNum}`,
            invoiceId: qte.zohoId,
            invoiceNumber: String(qNum),
            customerName: qte.account?.name || qData.customer_name || "Unknown Customer",
            issueDate: qte.createdAt,
            totalAmount: qte.amount || qData.total || 0,
            score,
            reasons,
            matchDetails
          })
        }
      }

      // Sort all candidate matches by score descending
      candidates.sort((a, b) => b.score - a.score)

      if (candidates.length > 0) {
        const topMatch = candidates[0]

        // 85%+ Match Auto Approve & Instant Link!
        if (topMatch.score >= 85) {
          const finalDocNum = topMatch.docNumber || topMatch.invoiceNumber
          let invoiceIdToSet = topMatch.docId || topMatch.invoiceId
          if (topMatch.docType === "SalesOrder") {
            const linkedInvoice = await prisma.invoice.findFirst({
              where: {
                OR: [
                  { salesOrderZohoId: topMatch.docId },
                  { salesorderNumber: String(finalDocNum) }
                ]
              }
            })
            if (linkedInvoice) {
              invoiceIdToSet = linkedInvoice.zohoId
            }
          }

          await prisma.purchaseOrder.update({
            where: { id: po.id },
            data: {
              invoiceId: invoiceIdToSet,
              invoiceNumber: String(finalDocNum),
              salesOrderId: topMatch.docType === "SalesOrder" ? topMatch.docId : po.salesOrderId,
              salesOrderNumber: topMatch.docType === "SalesOrder" ? String(finalDocNum) : po.salesOrderNumber
            }
          })

          autoApprovedCount++
          autoApprovedSummary.push({
            poZohoId: po.zohoId,
            docType: topMatch.docType,
            docNumber: finalDocNum,
            customerName: topMatch.customerName,
            score: topMatch.score
          })
          continue // Auto-approved! Remove from unlinked suggestions list.
        }

        suggestions[po.zohoId] = {
          bestMatch: topMatch,
          candidates: candidates, // Return ALL candidate matches for review!
          invoiceId: topMatch.invoiceId,
          invoiceNumber: topMatch.invoiceNumber,
          customerName: topMatch.customerName,
          issueDate: topMatch.issueDate,
          score: topMatch.score,
          reasons: topMatch.reasons
        }
      }
    }

    return NextResponse.json({
      success: true,
      suggestions,
      autoApprovedCount,
      autoApprovedSummary
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

