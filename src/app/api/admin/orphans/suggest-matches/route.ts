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
      billingZip: true
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

          if (topMatch.score >= 85) {
            const finalDocNum = topMatch.docNumber || topMatch.invoiceNumber
            await prisma.payment.update({
              where: { id: p.id },
              data: {
                invoiceId: topMatch.docId,
                invoiceNumber: String(finalDocNum)
              }
            })

            autoApprovedCount++
            autoApprovedSummary.push({
              paymentZohoId: p.zohoId,
              docNumber: finalDocNum,
              customerName: topMatch.customerName,
              score: topMatch.score
            })
            continue
          }

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

    // Extract targeting parameters across all POs in this request
    const poDates = pos.map(p => p.date ? new Date(p.date) : null).filter((d): d is Date => d !== null && !isNaN(d.getTime()))
    const customerTokens = new Set<string>()
    const refNumbers = new Set<string>()

    for (const p of pos) {
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

    for (const token of Array.from(customerTokens).slice(0, 35)) {
      invOr.push({ account: { name: { contains: token, mode: "insensitive" } } })
      soOr.push({ account: { name: { contains: token, mode: "insensitive" } } })
      qteOr.push({ account: { name: { contains: token, mode: "insensitive" } } })
    }

    for (const ref of Array.from(refNumbers).slice(0, 25)) {
      invOr.push({ invoiceNumber: { contains: ref, mode: "insensitive" } })
      invOr.push({ salesorderNumber: { contains: ref, mode: "insensitive" } })
      soOr.push({ salesorderNumber: { contains: ref, mode: "insensitive" } })
    }

    // Fetch candidate sales documents targeted to this batch of POs
    const [candidateInvoices, candidateSalesOrders, candidateQuotes] = await Promise.all([
      prisma.invoice.findMany({
        where: invOr.length > 0 ? { OR: invOr } : undefined,
        take: 1200,
        orderBy: { issueDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      }),
      prisma.salesOrder.findMany({
        where: soOr.length > 0 ? { OR: soOr } : undefined,
        take: 600,
        orderBy: { orderDate: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      }),
      prisma.quote.findMany({
        where: qteOr.length > 0 ? { OR: qteOr } : undefined,
        take: 600,
        orderBy: { createdAt: "desc" },
        include: { account: { select: accountSelect }, lineItems: true }
      })
    ])

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

