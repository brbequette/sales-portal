import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { computePOMatchScore, computePaymentMatchScore, isTitanWarehouse, tokenizeClean } from "./match-score"

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

    // 1. Gather all direct identifiers and clustered date windows across the POs
    const directInvs: string[] = []
    const soNums: string[] = []
    const dateWindows: { start: Date; end: Date }[] = []

    for (const po of pos) {
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

    // 2. Fetch candidate documents across all relevant windows in parallel
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

    // 3. Process each PO with strict customer isolation and scoring
    for (const po of pos) {
      const candidates: any[] = []

      // 1. Score against candidate Invoices
      for (const inv of candidateInvoices) {
        const { score, reasons, matchDetails } = computePOMatchScore(po, inv)
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
        const { score, reasons, matchDetails } = computePOMatchScore(po, so)
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
        const { score, reasons, matchDetails } = computePOMatchScore(po, qte)
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

      // Sort all candidate matches by score descending
      candidates.sort((a, b) => b.score - a.score)

      if (candidates.length > 0) {
        const topMatch = candidates[0]
        const suggestionPayload = {
          bestMatch: topMatch,
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

