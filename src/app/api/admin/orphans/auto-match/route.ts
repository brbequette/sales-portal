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

    // Extract targeting parameters across all POs in this batch
    const poDates = unassociatedPOs.map(p => p.date ? new Date(p.date) : null).filter((d): d is Date => d !== null && !isNaN(d.getTime()))
    const customerTokens = new Set<string>()
    const refNumbers = new Set<string>()

    for (const p of unassociatedPOs) {
      const pItems: any = p.items || {}
      const cust = String(p.shipToName || pItems.delivery_customer_name || pItems.customer_name || pItems.attention || "").trim()
      if (cust && !isTitanWarehouse(cust)) {
        tokenizeClean(cust).forEach(t => customerTokens.add(t))
      }
      const ref = String(p.salesOrderNumber || p.referenceNumber || (pItems.salesorders && pItems.salesorders[0]?.salesorder_number) || p.poNumber || "").trim().replace(/[^a-zA-Z0-9]/g, "")
      if (ref && ref.length >= 3) {
        refNumbers.add(ref)
      }
    }

    const invOr: any[] = []
    const soOr: any[] = []
    const qteOr: any[] = []

    if (poDates.length > 0) {
      const minTime = Math.min(...poDates.map(d => d.getTime())) - 45 * 24 * 3600 * 1000
      const maxTime = Math.max(...poDates.map(d => d.getTime())) + 60 * 24 * 3600 * 1000
      invOr.push({ issueDate: { gte: new Date(minTime), lte: new Date(maxTime) } })
      soOr.push({ orderDate: { gte: new Date(minTime), lte: new Date(maxTime) } })
      qteOr.push({ createdAt: { gte: new Date(minTime), lte: new Date(maxTime) } })
    }

    for (const token of Array.from(customerTokens).slice(0, 50)) {
      invOr.push({ account: { name: { contains: token, mode: "insensitive" } } })
      soOr.push({ account: { name: { contains: token, mode: "insensitive" } } })
      qteOr.push({ account: { name: { contains: token, mode: "insensitive" } } })
    }

    for (const ref of Array.from(refNumbers).slice(0, 30)) {
      invOr.push({ invoiceNumber: { contains: ref, mode: "insensitive" } })
      invOr.push({ salesorderNumber: { contains: ref, mode: "insensitive" } })
      soOr.push({ salesorderNumber: { contains: ref, mode: "insensitive" } })
    }

    const [candidateInvoices, candidateSalesOrders, candidateQuotes] = await Promise.all([
      prisma.invoice.findMany({
        where: invOr.length > 0 ? { OR: invOr } : undefined,
        take: 1500,
        orderBy: { issueDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      }),
      prisma.salesOrder.findMany({
        where: soOr.length > 0 ? { OR: soOr } : undefined,
        take: 800,
        orderBy: { orderDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      }),
      prisma.quote.findMany({
        where: qteOr.length > 0 ? { OR: qteOr } : undefined,
        take: 800,
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

