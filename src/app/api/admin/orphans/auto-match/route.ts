import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { computePOMatchScore, computePaymentMatchScore, isTitanWarehouse } from "../suggest-matches/match-score"
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
      billingZip: true
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

      // Fetch candidate invoices (prioritizing grand total matching)
      const candidateInvoices = await prisma.invoice.findMany({
        take: 1200,
        orderBy: { issueDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
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

    // -------------------------------------------------------------
    // AUTO-MATCH UNASSOCIATED PURCHASE ORDERS
    // -------------------------------------------------------------
    const unassociatedPOs = await prisma.purchaseOrder.findMany({
      where: {
        invoiceId: null,
        isInventoryOrder: false
      },
      take: 250,
      orderBy: { date: "desc" }
    })

    if (unassociatedPOs.length === 0) {
      return NextResponse.json({
        success: true,
        linkedCount: 0,
        linkedSummary: [],
        message: "No unassociated Purchase Orders found."
      })
    }

    function extractDirectInvoiceNumber(po: any): string | null {
      const items = po.items || {}
      const cfHash = items.custom_field_hash || {}
      if (cfHash.cf_invoice_number_formatted) return String(cfHash.cf_invoice_number_formatted).trim()
      if (cfHash.cf_invoice_number && String(cfHash.cf_invoice_number).length < 10) return String(cfHash.cf_invoice_number).trim()

      const cfs = items.custom_fields || []
      if (Array.isArray(cfs)) {
        const invField = cfs.find((f: any) => f.api_name === 'cf_invoice_number' || f.label?.toLowerCase().includes('invoice'))
        if (invField) {
          const val = invField.value_formatted || invField.value
          if (val && String(val).length < 10) return String(val).trim()
        }
      }

      const att = items.attachment_name || ''
      const match = att.match(/(\d{4,6})/)
      if (match) return match[1]

      const ref = po.referenceNumber || items.reference_number || ''
      const refMatch = ref.match(/(?:inv|invoice|#)?\s*(\d{4,6})/i)
      if (refMatch) return refMatch[1]

      return null
    }

    // Collect direct identifiers and date bounds across the batch of POs
    let minDate: Date | null = null
    let maxDate: Date | null = null
    const directInvs: string[] = []
    const soNums: string[] = []

    for (const po of unassociatedPOs) {
      const pItems: any = po.items || {}
      const directInv = extractDirectInvoiceNumber(po)
      if (directInv) directInvs.push(directInv)
      const soNum = String(po.salesOrderNumber || (pItems.salesorders && pItems.salesorders[0]?.salesorder_number) || "").trim()
      if (soNum && soNum.length >= 3) soNums.push(soNum)

      const poDate = po.date ? new Date(po.date) : null
      if (poDate && !isNaN(poDate.getTime())) {
        if (!minDate || poDate < minDate) minDate = poDate
        if (!maxDate || poDate > maxDate) maxDate = poDate
      }
    }

    const queryMin = minDate ? new Date(minDate.getTime() - 60 * 24 * 3600 * 1000) : new Date(Date.now() - 180 * 24 * 3600 * 1000)
    const queryMax = maxDate ? new Date(maxDate.getTime() + 60 * 24 * 3600 * 1000) : new Date(Date.now() + 30 * 24 * 3600 * 1000)

    const invOr: any[] = [
      { issueDate: { gte: queryMin, lte: queryMax } }
    ]
    if (directInvs.length > 0) {
      invOr.push({ invoiceNumber: { in: directInvs } })
    }
    if (soNums.length > 0) {
      invOr.push({ salesorderNumber: { in: soNums } })
    }

    // Fast parallel fetch of candidate documents across the target range
    const [candidateInvoices, candidateSalesOrders, candidateQuotes] = await Promise.all([
      prisma.invoice.findMany({
        where: { OR: invOr },
        take: 1000,
        orderBy: { issueDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      }),
      prisma.salesOrder.findMany({
        where: { orderDate: { gte: queryMin, lte: queryMax } },
        take: 400,
        orderBy: { orderDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      }),
      prisma.quote.findMany({
        where: { createdAt: { gte: queryMin, lte: queryMax } },
        take: 400,
        orderBy: { createdAt: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      })
    ])

    let linkedCount = 0
    const linkedSummary: any[] = []
    const updatePromises: Promise<any>[] = []

    for (const po of unassociatedPOs) {
      let bestMatch: any = null
      let maxScore = 0
      let matchReasons: string[] = []
      let matchType: "Invoice" | "SalesOrder" | "Estimate" = "Invoice"

      // 1. Score candidate Invoices
      for (const inv of candidateInvoices) {
        const { score, reasons } = computePOMatchScore(po, inv)
        if (score > maxScore) {
          maxScore = score
          bestMatch = inv
          matchReasons = reasons
          matchType = "Invoice"
        }
      }

      // 2. Score candidate Sales Orders
      for (const so of candidateSalesOrders) {
        const { score, reasons } = computePOMatchScore(po, so)
        if (score > maxScore) {
          maxScore = score
          bestMatch = so
          matchReasons = reasons
          matchType = "SalesOrder"
        }
      }

      // 3. Score candidate Estimates
      for (const qte of candidateQuotes) {
        const { score, reasons } = computePOMatchScore(po, qte)
        if (score > maxScore) {
          maxScore = score
          bestMatch = qte
          matchReasons = reasons
          matchType = "Estimate"
        }
      }

      // Direct SO/Ref match or 85%+ score threshold
      const poSO = (po.salesOrderNumber || po.referenceNumber || "").trim()
      const isDirectMatch = bestMatch && poSO && (
        (bestMatch.salesorderNumber && bestMatch.salesorderNumber === poSO) ||
        (bestMatch.items?.salesorder_number && bestMatch.items.salesorder_number === poSO) ||
        (bestMatch.items?.reference_number && bestMatch.items.reference_number === poSO) ||
        (bestMatch.items?.estimate_number && bestMatch.items.estimate_number === poSO) ||
        (bestMatch.items?.quote_number && bestMatch.items.quote_number === poSO)
      )

      if (bestMatch && (maxScore >= 85 || isDirectMatch)) {
        const docData = bestMatch.items as any || {}
        const finalDocNum = docData.invoiceNumber || docData.salesorder_number || docData.estimate_number || docData.quote_number || bestMatch.zohoId

        // Resolve invoice link
        let invoiceIdToSet = bestMatch.zohoId
        if (matchType === "SalesOrder") {
          const linkedInvoice = candidateInvoices.find(inv =>
            inv.salesOrderZohoId === bestMatch.zohoId || inv.salesorderNumber === String(finalDocNum)
          )
          if (linkedInvoice) {
            invoiceIdToSet = linkedInvoice.zohoId
          }
        }

        updatePromises.push(
          prisma.purchaseOrder.update({
            where: { id: po.id },
            data: {
              invoiceId: invoiceIdToSet,
              invoiceNumber: String(finalDocNum),
              salesOrderId: matchType === "SalesOrder" ? bestMatch.zohoId : po.salesOrderId,
              salesOrderNumber: matchType === "SalesOrder" ? String(finalDocNum) : po.salesOrderNumber
            }
          })
        )

        linkedCount++
        linkedSummary.push({
          poZohoId: po.zohoId,
          poTotal: po.total,
          docType: matchType,
          docNumber: finalDocNum,
          customer: bestMatch.account?.name || docData.customer_name,
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
      message: `Successfully auto-matched and linked ${linkedCount} Purchase Orders (85%+ score across Invoices, Sales Orders & Estimates).`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
