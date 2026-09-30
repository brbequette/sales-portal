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

    // Process each PO with its own targeted candidates strictly scoped to verified customer
    for (const po of pos) {
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

      const [candidateInvoices, candidateSalesOrders, candidateQuotes] = await Promise.all([
        invOr.length > 0 ? prisma.invoice.findMany({
          where: { OR: invOr },
          take: 20,
          orderBy: { issueDate: "desc" },
          include: { account: { select: accountSelect }, lineItems: true }
        }) : Promise.resolve([]),
        soOr.length > 0 ? prisma.salesOrder.findMany({
          where: { OR: soOr },
          take: 15,
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

