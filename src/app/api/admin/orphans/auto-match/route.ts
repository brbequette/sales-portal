import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { computePOMatchScore, isTitanWarehouse, tokenizeClean } from "../suggest-matches/match-score"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    
    // Take up to 300 unassociated POs per batch for ultra-fast performance under serverless timeouts
    const unassociatedPOs = await prisma.purchaseOrder.findMany({
      where: {
        invoiceId: null,
        isInventoryOrder: false
      },
      take: 300,
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

    let linkedCount = 0
    const linkedSummary: any[] = []
    const updatePromises: Promise<any>[] = []

    for (const po of unassociatedPOs) {
      const pItems: any = po.items || {}
      const directInv = extractDirectInvoiceNumber(po)
      const cust = String(po.shipToName || pItems.delivery_customer_name || pItems.customer_name || pItems.attention || "").trim()
      const isWarehouse = isTitanWarehouse(cust) || isTitanWarehouse(po.shippingAddress)
      const tokens = !isWarehouse ? tokenizeClean(cust) : []
      const soNum = String(po.salesOrderNumber || (pItems.salesorders && pItems.salesorders[0]?.salesorder_number) || "").trim().replace(/[^a-zA-Z0-9]/g, "")

      const poDate = po.date ? new Date(po.date) : null
      let minDate: Date | null = null
      let maxDate: Date | null = null
      if (poDate && !isNaN(poDate.getTime())) {
        minDate = new Date(poDate.getTime() - 45 * 24 * 3600 * 1000)
        maxDate = new Date(poDate.getTime() + 60 * 24 * 3600 * 1000)
      }

      const invOr: any[] = []
      const soOr: any[] = []
      const qteOr: any[] = []

      if (!isWarehouse && tokens.length > 0) {
        // Strict Customer Account Scope: Only fetch candidate documents for this verified customer!
        const customerClause = {
          account: {
            OR: tokens.slice(0, 3).map(token => ({
              name: { contains: token, mode: "insensitive" as const }
            }))
          }
        }

        // 1. Direct Invoice Number (if found on PO)
        if (directInv) {
          invOr.push({
            invoiceNumber: directInv,
            ...customerClause
          })
          // Also fetch exact invoice number alone in case account name spelling differs slightly in CRM
          invOr.push({ invoiceNumber: directInv })
        }

        // 2. Sales Order within this verified customer
        if (soNum && soNum.length >= 3) {
          invOr.push({
            OR: [
              { salesorderNumber: { contains: soNum, mode: "insensitive" as const } },
              { invoiceNumber: { contains: soNum, mode: "insensitive" as const } }
            ],
            ...customerClause
          })
          soOr.push({
            salesorderNumber: { contains: soNum, mode: "insensitive" as const },
            ...customerClause
          })
        }

        // 3. Customer documents within date window (±45 days)
        invOr.push({
          ...customerClause,
          ...(minDate && maxDate ? { issueDate: { gte: minDate, lte: maxDate } } : {})
        })
        soOr.push({
          ...customerClause,
          ...(minDate && maxDate ? { orderDate: { gte: minDate, lte: maxDate } } : {})
        })
        qteOr.push({
          ...customerClause,
          ...(minDate && maxDate ? { createdAt: { gte: minDate, lte: maxDate } } : {})
        })
      } else if (isWarehouse) {
        // Internal stock PO to Titan Warehouse - only query if explicit PO reference exists
        const poNum = String(po.poNumber || "").trim()
        if (poNum && poNum.length >= 3) {
          invOr.push({ referenceNumber: { contains: poNum, mode: "insensitive" as const } })
          soOr.push({ referenceNumber: { contains: poNum, mode: "insensitive" as const } })
        }
      }

      if (invOr.length === 0 && soOr.length === 0 && qteOr.length === 0) {
        continue
      }

      const [candidateInvoices, candidateSalesOrders, candidateQuotes] = await Promise.all([
        invOr.length > 0 ? prisma.invoice.findMany({
          where: { OR: invOr },
          take: 15,
          orderBy: { issueDate: "desc" },
          include: { account: { select: accountSelect }, lineItems: true }
        }) : Promise.resolve([]),
        soOr.length > 0 ? prisma.salesOrder.findMany({
          where: { OR: soOr },
          take: 10,
          orderBy: { orderDate: "desc" },
          include: { account: { select: accountSelect }, lineItems: true }
        }) : Promise.resolve([]),
        qteOr.length > 0 ? prisma.quote.findMany({
          where: { OR: qteOr },
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { account: { select: accountSelect }, lineItems: true }
        }) : Promise.resolve([])
      ])

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

