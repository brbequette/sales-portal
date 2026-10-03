import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rankPOMatches, computePaymentMatchScore, isTitanWarehouse } from "../suggest-matches/match-score"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") || "pos"

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
      billingZip: true,
      contacts: {
        select: {
          firstName: true,
          lastName: true
        }
      }
    }

    if (type === "payments") {
      // -------------------------------------------------------------
      // AUTO-MATCH UNASSOCIATED PAYMENTS
      // -------------------------------------------------------------
      const unassociatedPayments = await prisma.payment.findMany({
        where: { invoiceId: null },
        take: 200,
        orderBy: { date: "desc" }
      })

      if (unassociatedPayments.length === 0) {
        return NextResponse.json({
          success: true,
          linkedCount: 0,
          linkedSummary: [],
          message: "No unassociated Payments found."
        })
      }

      // Fetch candidate invoices (prioritizing grand total matching, lean select)
      const candidateInvoices = await prisma.invoice.findMany({
        take: 1200,
        orderBy: { issueDate: "desc" },
        select: {
          id: true,
          zohoId: true,
          accountId: true,
          amount: true,
          issueDate: true,
          computedInvoiceNumber: true,
          invoiceNumber: true,
          salesorderNumber: true,
          items: true,
          account: {
            select: accountSelect
          }
        }
      })

      let linkedCount = 0
      const linkedSummary: any[] = []
      const updatePromises: Promise<any>[] = []

      for (const p of unassociatedPayments) {
        let bestMatch: any = null
        let maxScore = 0
        let matchReasons: string[] = []

        for (const inv of candidateInvoices) {
          const { score, reasons } = computePaymentMatchScore(p, inv)
          if (score > maxScore) {
            maxScore = score
            bestMatch = inv
            matchReasons = reasons
          }
        }

        if (bestMatch && maxScore >= 85) {
          const invData: any = bestMatch.items || {}
          const invNum = bestMatch.invoiceNumber || invData.invoiceNumber || bestMatch.zohoId

          updatePromises.push(
            prisma.payment.update({
              where: { id: p.id },
              data: {
                invoiceId: bestMatch.zohoId,
                invoiceDbId: bestMatch.id,
                invoiceNumber: String(invNum)
              }
            })
          )

          linkedCount++
          linkedSummary.push({
            paymentZohoId: p.zohoId,
            amount: p.amount,
            invoiceNumber: invNum,
            customer: bestMatch.account?.name || invData.customer_name,
            score: maxScore,
            reasons: matchReasons
          })
        }
      }

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises)
      }

      return NextResponse.json({
        success: true,
        linkedCount,
        linkedSummary,
        message: `Successfully auto-matched and linked ${linkedCount} Payments to Invoices (85%+ score on Grand Total & Customer).`
      })
    }

    // PO matching is read-only: a score is not authorization to change financial lineage.
    const parsedLimit = Number(searchParams.get('limit') || 35)
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(Math.floor(parsedLimit), 60)) : 35
    const pos = await prisma.purchaseOrder.findMany({
      where: { invoiceId: null, salesOrderId: null, isInventoryOrder: false }, take: limit, orderBy: { date: 'desc' }
    })
    // Complete candidate pools prevent a recent-record cap from hiding explicit references or duplicates.
    const [invoices, orders] = await Promise.all([
      prisma.invoice.findMany({ include: { account: { select: accountSelect }, lineItems: true } }),
      prisma.salesOrder.findMany({ include: { account: { select: accountSelect }, lineItems: true } }),
    ])
    const documents = [...invoices.map(doc => ({ ...doc, docType: 'Invoice' })), ...orders.map(doc => ({ ...doc, docType: 'SalesOrder' }))]
    const proposals = pos.map(po => {
      const matches = rankPOMatches(po, documents)
      const exact = matches.filter(match => match.referenceStatus === 'exact')
      return { poZohoId: po.zohoId, poNumber: po.poNumber, requiresReview: true,
        ambiguous: exact.length > 1, candidates: matches.slice(0, 10).map(({ doc, ...result }) => ({
          ...result, docId: doc.zohoId, docType: doc.docType,
          docNumber: doc.invoiceNumber || doc.items?.salesorder_number, reasons: result.reasons,
        })) }
    })
    return NextResponse.json({ success: true, dryRun: true, linkedCount: 0, linkedSummary: [],
      warehouseCount: pos.filter(po => isTitanWarehouse(po.shipToName) || isTitanWarehouse(po.shippingAddress)).length,
      hasMore: false, proposals,
      message: 'PO proposals require review and fresh corroborated provider evidence. No links or inventory flags were changed.' })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
