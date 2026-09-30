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

    // Collect direct identifiers and clustered date windows across the batch of POs
    const directInvs: string[] = []
    const soNums: string[] = []
    const dateWindows: { start: Date; end: Date }[] = []

    for (const po of unassociatedPOs) {
      const pItems: any = po.items || {}
      const directInv = extractDirectInvoiceNumber(po)
      if (directInv) directInvs.push(directInv)
      const soNum = String(po.salesOrderNumber || (pItems.salesorders && pItems.salesorders[0]?.salesorder_number) || "").trim()
      if (soNum && soNum.length >= 3) soNums.push(soNum)

      const poDate = po.date ? new Date(po.date) : null
      if (poDate && !isNaN(poDate.getTime())) {
        const start = new Date(poDate.getTime() - 45 * 24 * 3600 * 1000)
        const end = new Date(poDate.getTime() + 45 * 24 * 3600 * 1000)
        const existing = dateWindows.find(w => !(end < w.start || start > w.end))
        if (existing) {
          if (start < existing.start) existing.start = start
          if (end > existing.end) existing.end = end
        } else {
          dateWindows.push({ start, end })
        }
      }
    }

    if (dateWindows.length === 0) {
      dateWindows.push({
        start: new Date(Date.now() - 180 * 24 * 3600 * 1000),
        end: new Date(Date.now() + 30 * 24 * 3600 * 1000)
      })
    }

    // Parallel fetch across all relevant windows
    const invoiceQueries = dateWindows.map(w =>
      prisma.invoice.findMany({
        where: { issueDate: { gte: w.start, lte: w.end } },
        take: 500,
        orderBy: { issueDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      })
    )

    if (directInvs.length > 0 || soNums.length > 0) {
      const directOr: any[] = []
      if (directInvs.length > 0) directOr.push({ invoiceNumber: { in: directInvs } })
      if (soNums.length > 0) directOr.push({ salesorderNumber: { in: soNums } })
      invoiceQueries.push(
        prisma.invoice.findMany({
          where: { OR: directOr },
          take: 200,
          include: { account: { select: accountSelect }, lineItems: true }
        })
      )
    }

    const soQueries = dateWindows.map(w =>
      prisma.salesOrder.findMany({
        where: { orderDate: { gte: w.start, lte: w.end } },
        take: 300,
        orderBy: { orderDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      })
    )

    const quoteQueries = dateWindows.map(w =>
      prisma.quote.findMany({
        where: { createdAt: { gte: w.start, lte: w.end } },
        take: 300,
        orderBy: { createdAt: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      })
    )

    const [invBatches, soBatches, qteBatches] = await Promise.all([
      Promise.all(invoiceQueries),
      Promise.all(soQueries),
      Promise.all(quoteQueries)
    ])

    const invMap = new Map<string, any>()
    for (const batch of invBatches) {
      for (const inv of batch) invMap.set(inv.id, inv)
    }
    const candidateInvoices = Array.from(invMap.values())

    const soMap = new Map<string, any>()
    for (const batch of soBatches) {
      for (const so of batch) soMap.set(so.id, so)
    }
    const candidateSalesOrders = Array.from(soMap.values())

    const qteMap = new Map<string, any>()
    for (const batch of qteBatches) {
      for (const q of batch) qteMap.set(q.id, q)
    }
    const candidateQuotes = Array.from(qteMap.values())

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
