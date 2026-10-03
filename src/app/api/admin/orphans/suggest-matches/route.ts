import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { computePOMatchScore, computePaymentMatchScore } from "./match-score"

export async function GET(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") || "po"
    const poId = searchParams.get("poId")
    const poIdsParam = searchParams.get("poIds")
    const paymentId = searchParams.get("paymentId")
    const paymentIdsParam = searchParams.get("paymentIds")

    const isPaymentMode = type === "payment" || !!paymentId || !!paymentIdsParam

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

    const suggestions: Record<string, any> = {}
    let autoApprovedCount = 0
    const autoApprovedSummary: any[] = []

    if (isPaymentMode) {
      const payWhere: any = { invoiceId: null }
      if (paymentId) {
        payWhere.OR = [{ id: paymentId }, { zohoId: paymentId }]
      } else if (paymentIdsParam) {
        const splitIds = paymentIdsParam.split(",").map(s => s.trim()).filter(Boolean)
        if (splitIds.length > 0) {
          payWhere.OR = [
            { id: { in: splitIds } },
            { zohoId: { in: splitIds } }
          ]
        }
      }

      const payments = await prisma.payment.findMany({
        where: payWhere,
        take: (paymentId || paymentIdsParam) ? 50 : 25,
        orderBy: { date: "desc" }
      })

      const candidateInvoices = await prisma.invoice.findMany({
        take: 1200,
        orderBy: { issueDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      })

      for (const p of payments) {
        const candidates: any[] = []
        for (const inv of candidateInvoices) {
          const { score, reasons, matchDetails } = computePaymentMatchScore(p, inv)
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

        candidates.sort((a, b) => b.score - a.score)

        if (candidates.length > 0) {
          const topMatch = candidates[0]

          suggestions[p.zohoId] = {
            bestMatch: topMatch,
            candidates,
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
    }

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
      return NextResponse.json({
        success: true,
        suggestions: {},
        autoApprovedCount: 0,
        autoApprovedSummary: []
      })
    }

    // Full pools include old/prefixed references and preserve duplicate candidates for review.
    const [candidateInvoices, candidateSalesOrders, candidateQuotes] = await Promise.all([
      prisma.invoice.findMany({ include: { account: { select: accountSelect }, lineItems: true } }),
      prisma.salesOrder.findMany({ include: { account: { select: accountSelect }, lineItems: true } }),
      prisma.quote.findMany({ include: { account: { select: accountSelect }, lineItems: true } }),
    ])

    // 3. Process each PO with strict customer isolation and scoring
    for (const po of pos) {
      const candidates: any[] = []

      // 1. Score against candidate Invoices
      for (const inv of candidateInvoices) {
        const { score, reasons, matchDetails, referenceStatus } = computePOMatchScore(po, inv)
        if (score >= 30) {
          const invData: any = inv.items || {}
          const invNum = inv.invoiceNumber || invData.invoiceNumber || inv.zohoId
          const lineItems = (Array.isArray(inv.lineItems) && inv.lineItems.length > 0)
            ? inv.lineItems.map((li: any) => ({ name: li.sku || li.description || "Item", sku: li.sku || "", quantity: Number(li.quantity || 1) }))
            : (Array.isArray(invData.line_items) ? invData.line_items : (Array.isArray(invData.lineItems) ? invData.lineItems : [])).map((li: any) => ({
                name: li.name || li.sku || li.description || "Item",
                sku: li.sku || "",
                quantity: Number(li.quantity || 1)
              }))

          candidates.push({
            docId: inv.zohoId,
            docType: "Invoice",
            referenceStatus,
            docNumber: invNum,
            invoiceId: inv.zohoId,
            invoiceNumber: invNum,
            customerName: inv.account?.name || invData.customer_name || "Unknown Customer",
            issueDate: inv.issueDate,
            totalAmount: inv.amount || invData.total || 0,
            score,
            reasons,
            matchDetails,
            lineItems
          })
        }
      }

      // 2. Score against candidate Sales Orders
      for (const so of candidateSalesOrders) {
        const { score, reasons, matchDetails, referenceStatus } = computePOMatchScore(po, so)
        if (score >= 30) {
          const soData: any = so.items || {}
          const soNum = soData.salesorder_number || soData.so_number || so.zohoId
          const lineItems = (Array.isArray(so.lineItems) && so.lineItems.length > 0)
            ? so.lineItems.map((li: any) => ({ name: li.sku || li.description || "Item", sku: li.sku || "", quantity: Number(li.quantity || 1) }))
            : (Array.isArray(soData.line_items) ? soData.line_items : (Array.isArray(soData.lineItems) ? soData.lineItems : [])).map((li: any) => ({
                name: li.name || li.sku || li.description || "Item",
                sku: li.sku || "",
                quantity: Number(li.quantity || 1)
              }))

          candidates.push({
            docId: so.zohoId,
            docType: "SalesOrder",
            referenceStatus,
            docNumber: `SO #${soNum}`,
            invoiceId: so.zohoId,
            invoiceNumber: String(soNum),
            customerName: so.account?.name || soData.customer_name || "Unknown Customer",
            issueDate: so.orderDate,
            totalAmount: so.amount || soData.total || 0,
            score,
            reasons,
            matchDetails,
            lineItems
          })
        }
      }

      // 3. Score against candidate Estimates (Quotes)
      for (const qte of candidateQuotes) {
        const { score, reasons, matchDetails, referenceStatus } = computePOMatchScore(po, qte)
        if (score >= 30) {
          const qData: any = qte.items || {}
          const qNum = qData.quote_number || qData.estimate_number || qData.number || qte.zohoId
          const lineItems = (Array.isArray(qte.lineItems) && qte.lineItems.length > 0)
            ? qte.lineItems.map((li: any) => ({ name: li.sku || li.description || "Item", sku: li.sku || "", quantity: Number(li.quantity || 1) }))
            : (Array.isArray(qData.line_items) ? qData.line_items : (Array.isArray(qData.lineItems) ? qData.lineItems : [])).map((li: any) => ({
                name: li.name || li.sku || li.description || "Item",
                sku: li.sku || "",
                quantity: Number(li.quantity || 1)
              }))

          candidates.push({
            docId: qte.zohoId,
            docType: "Estimate",
            referenceStatus,
            docNumber: `Est #${qNum}`,
            invoiceId: qte.zohoId,
            invoiceNumber: String(qNum),
            customerName: qte.account?.name || qData.customer_name || "Unknown Customer",
            issueDate: qte.createdAt,
            totalAmount: qte.amount || qData.total || 0,
            score,
            reasons,
            matchDetails,
            lineItems
          })
        }
      }

      candidates.sort((a, b) => Number(b.referenceStatus === 'exact') - Number(a.referenceStatus === 'exact') || b.score - a.score)

      if (candidates.length > 0) {
        const topMatch = candidates[0]
        const suggestionPayload = {
          bestMatch: topMatch,
          requiresReview: true,
          autoWriteEligible: false,
          ambiguous: candidates.filter(c => c.referenceStatus === 'exact').length > 1,
          candidates: candidates, // Return ALL candidate matches for review!
          invoiceId: topMatch.invoiceId,
          invoiceNumber: topMatch.invoiceNumber,
          customerName: topMatch.customerName,
          issueDate: topMatch.issueDate,
          score: topMatch.score,
          reasons: topMatch.reasons,
          lineItems: topMatch.lineItems || []
        }

        if (po.zohoId) suggestions[po.zohoId] = suggestionPayload
        if (po.id) suggestions[po.id] = suggestionPayload
        if (po.poNumber) suggestions[po.poNumber] = suggestionPayload
      } else {
        const review = { bestMatch: null, candidates: [], requiresReview: true, autoWriteEligible: false,
          score: 0, reasons: ['No compatible document; explicit references must be resolved without fuzzy substitution'] }
        for (const key of [po.id, po.zohoId, po.poNumber]) if (key) suggestions[key] = review
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

