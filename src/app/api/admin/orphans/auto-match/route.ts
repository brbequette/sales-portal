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

    // -------------------------------------------------------------
    // AUTO-MATCH UNASSOCIATED PURCHASE ORDERS ACROSS ENTIRE DATASET
    // -------------------------------------------------------------
    const limitParam = searchParams.get("limit")
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 60) : 35

    const unassociatedPOs = await prisma.purchaseOrder.findMany({
      where: {
        invoiceId: null,
        isInventoryOrder: false
      },
      take: limit,
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

    // 1. Identify and archive internal warehouse stock orders (not customer dropshipments)
    const warehousePoIds: string[] = []
    const dropshipCandidates: typeof unassociatedPOs = []

    for (const po of unassociatedPOs) {
      const pItems: any = po.items || {}
      const shipTo = String(po.shipToName || pItems.delivery_customer_name || pItems.customer_name || "").trim()
      const shipAddr = String(po.shippingAddress || pItems.delivery_address?.address || "").trim()

      if (isTitanWarehouse(shipTo) || isTitanWarehouse(shipAddr) || shipTo.toLowerCase().includes('rowley')) {
        warehousePoIds.push(po.id)
      } else {
        dropshipCandidates.push(po)
      }
    }

    if (warehousePoIds.length > 0) {
      await prisma.purchaseOrder.updateMany({
        where: { id: { in: warehousePoIds } },
        data: { isInventoryOrder: true }
      })
    }

    if (dropshipCandidates.length === 0) {
      return NextResponse.json({
        success: true,
        linkedCount: 0,
        warehouseCount: warehousePoIds.length,
        linkedSummary: [],
        message: `Identified and archived ${warehousePoIds.length} internal warehouse stock orders as Inventory Orders.`
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

      const docs = items.documents || []
      if (Array.isArray(docs)) {
        for (const doc of docs) {
          const fn = doc.file_name || ''
          const m = fn.match(/(?:inv|invoice|packingslip|slip|#)[_\s-]*(\d{4,6})/i) || fn.match(/(\d{4,6})/)
          if (m && m[1] && m[1] !== po.poNumber) return m[1]
        }
      }

      const att = items.attachment_name || ''
      const match = att.match(/(?:inv|invoice|packingslip|slip|#)[_\s-]*(\d{4,6})/i) || att.match(/(\d{4,6})/)
      if (match && match[1] && match[1] !== po.poNumber) return match[1]

      const ref = po.referenceNumber || items.reference_number || ''
      const refMatch = ref.match(/(?:inv|invoice|#)?\s*(\d{4,6})/i)
      if (refMatch && refMatch[1] && refMatch[1] !== po.poNumber) return refMatch[1]

      return null
    }

    // 2. Fetch candidate Sales Orders
    const candidateSOs = await prisma.salesOrder.findMany({
      take: 300,
      orderBy: { orderDate: "desc" },
      select: {
        id: true,
        zohoId: true,
        accountId: true,
        amount: true,
        orderDate: true,
        items: true,
        account: {
          select: { id: true, name: true }
        }
      }
    })

    const soByNumber = new Map<string, any>()
    for (const so of candidateSOs) {
      if (so.zohoId) soByNumber.set(so.zohoId, so)
      const sData = (so.items as any) || {}
      const soNum = String(sData.salesorder_number || '').trim()
      if (soNum) {
        soByNumber.set(soNum, so)
        const digits = soNum.replace(/\D/g, '')
        if (digits) {
          soByNumber.set(digits, so)
          soByNumber.set(`SO #${digits}`, so)
          soByNumber.set(`SO#${digits}`, so)
        }
      }
    }

    // 3. Load candidate invoices (lean select, no heavy JSON items, active window)
    const candidateInvoices = await prisma.invoice.findMany({
      take: 800,
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
        salesOrderZohoId: true,
        account: {
          select: {
            id: true,
            name: true,
            shippingStreet: true,
            shippingCity: true,
            shippingState: true,
            shippingZip: true
          }
        }
      }
    })

    const invByNumber = new Map<string, any>()
    const invBySoNumber = new Map<string, any>()
    const invByAccountId = new Map<string, any[]>()

    for (const inv of candidateInvoices) {
      const num = String(inv.computedInvoiceNumber || inv.invoiceNumber || '').trim()
      if (num) {
        invByNumber.set(num, inv)
        const digits = num.replace(/\D/g, '')
        if (digits) invByNumber.set(digits, inv)
      }

      const soNum = String(inv.salesorderNumber || '').trim()
      if (soNum) {
        invBySoNumber.set(soNum, inv)
        const digits = soNum.replace(/\D/g, '')
        if (digits) {
          invBySoNumber.set(digits, inv)
          invBySoNumber.set(`SO #${digits}`, inv)
        }
      }

      if (inv.accountId) {
        if (!invByAccountId.has(inv.accountId)) invByAccountId.set(inv.accountId, [])
        invByAccountId.get(inv.accountId)!.push(inv)
      }
    }

    let linkedCount = 0
    const linkedSummary: any[] = []
    const updatePromises: Promise<any>[] = []

    for (const po of dropshipCandidates) {
      const pItems: any = po.items || {}
      const shipTo = String(po.shipToName || pItems.delivery_customer_name || pItems.customer_name || "").trim()

      let matchedInv: any = null
      let matchedSO: any = null
      let maxScore = 0
      let matchReasons: string[] = []

      // A. Direct Invoice Number
      const directInvNum = extractDirectInvoiceNumber(po)
      if (directInvNum && invByNumber.has(directInvNum)) {
        matchedInv = invByNumber.get(directInvNum)
        maxScore = 100
        matchReasons = [`Direct Invoice Number (#${directInvNum})`]
      }

      // B. Direct Sales Order on Invoice
      if (!matchedInv) {
        const soNum = String(po.salesOrderNumber || (pItems.salesorders && pItems.salesorders[0]?.salesorder_number) || "").trim()
        if (soNum && invBySoNumber.has(soNum)) {
          matchedInv = invBySoNumber.get(soNum)
          maxScore = 100
          matchReasons = [`Direct Sales Order Number on Invoice (#${soNum})`]
        } else if (soNum) {
          const digits = soNum.replace(/\D/g, '')
          if (digits && invBySoNumber.has(digits)) {
            matchedInv = invBySoNumber.get(digits)
            maxScore = 100
            matchReasons = [`Direct Sales Order Number on Invoice (#${digits})`]
          }
        }
      }

      // C. Direct Sales Order on SalesOrder table (even if not yet invoiced)
      if (!matchedInv && !matchedSO) {
        const soNum = String(po.salesOrderNumber || (pItems.salesorders && pItems.salesorders[0]?.salesorder_number) || "").trim()
        if (soNum && soByNumber.has(soNum)) {
          matchedSO = soByNumber.get(soNum)
          maxScore = 100
          matchReasons = [`Direct Sales Order Record (#${soNum})`]
        } else if (soNum) {
          const digits = soNum.replace(/\D/g, '')
          if (digits && soByNumber.has(digits)) {
            matchedSO = soByNumber.get(digits)
            maxScore = 100
            matchReasons = [`Direct Sales Order Record (#${digits})`]
          }
        }
      }

      // D. Reference Number match
      if (!matchedInv && !matchedSO) {
        const ref = String(po.referenceNumber || pItems.reference_number || "").trim()
        const refDigits = ref.replace(/\D/g, '')
        if (ref && invByNumber.has(ref)) {
          matchedInv = invByNumber.get(ref)
          maxScore = 95
          matchReasons = [`Reference matches Invoice #${ref}`]
        } else if (refDigits && invByNumber.has(refDigits)) {
          matchedInv = invByNumber.get(refDigits)
          maxScore = 95
          matchReasons = [`Reference matches Invoice #${refDigits}`]
        } else if (ref && invBySoNumber.has(ref)) {
          matchedInv = invBySoNumber.get(ref)
          maxScore = 95
          matchReasons = [`Reference matches SO #${ref}`]
        } else if (ref && soByNumber.has(ref)) {
          matchedSO = soByNumber.get(ref)
          maxScore = 95
          matchReasons = [`Reference matches SO #${ref}`]
        } else if (refDigits && soByNumber.has(refDigits)) {
          matchedSO = soByNumber.get(refDigits)
          maxScore = 95
          matchReasons = [`Reference matches SO #${refDigits}`]
        }
      }

      // E. Account + Date Scoring
      if (!matchedInv && !matchedSO && po.date && shipTo.length > 2) {
        const shipToLower = shipTo.toLowerCase()
        for (const inv of candidateInvoices) {
          const accName = (inv.account?.name || '').toLowerCase()
          if (accName && (accName === shipToLower || accName.includes(shipToLower) || shipToLower.includes(accName))) {
            const { score, reasons } = computePOMatchScore(po, inv)
            if (score > maxScore) {
              maxScore = score
              matchedInv = inv
              matchReasons = reasons
            }
          }
        }
      }

      if (matchedInv && maxScore >= 85) {
        const finalDocNum = matchedInv.computedInvoiceNumber || matchedInv.invoiceNumber || matchedInv.zohoId

        updatePromises.push(
          prisma.purchaseOrder.update({
            where: { id: po.id },
            data: {
              invoiceId: matchedInv.zohoId,
              invoiceNumber: String(finalDocNum),
              salesOrderId: matchedInv.salesOrderZohoId || undefined,
              salesOrderNumber: matchedInv.salesorderNumber || undefined
            }
          })
        )

        linkedCount++
        linkedSummary.push({
          poZohoId: po.zohoId,
          poTotal: po.total,
          docType: "Invoice",
          docNumber: finalDocNum,
          customer: matchedInv.account?.name,
          score: maxScore,
          reasons: matchReasons
        })
      } else if (matchedSO && maxScore >= 85) {
        const sData = (matchedSO.items as any) || {}
        const finalDocNum = sData.salesorder_number || matchedSO.zohoId

        updatePromises.push(
          prisma.purchaseOrder.update({
            where: { id: po.id },
            data: {
              invoiceId: matchedSO.zohoId,
              invoiceNumber: String(finalDocNum),
              salesOrderId: matchedSO.zohoId,
              salesOrderNumber: String(finalDocNum)
            }
          })
        )

        linkedCount++
        linkedSummary.push({
          poZohoId: po.zohoId,
          poTotal: po.total,
          docType: "SalesOrder",
          docNumber: finalDocNum,
          customer: matchedSO.account?.name,
          score: maxScore,
          reasons: matchReasons
        })
      }
    }

    if (updatePromises.length > 0) {
      for (let i = 0; i < updatePromises.length; i += 25) {
        await Promise.all(updatePromises.slice(i, i + 25))
      }
    }

    const remainingCount = await prisma.purchaseOrder.count({
      where: {
        invoiceId: null,
        isInventoryOrder: false
      }
    })

    const warehouseMsg = warehousePoIds.length > 0 ? ` Archived ${warehousePoIds.length} internal warehouse stock orders.` : ''
    return NextResponse.json({
      success: true,
      linkedCount,
      warehouseCount: warehousePoIds.length,
      remainingCount,
      hasMore: remainingCount > 0 && linkedCount > 0,
      linkedSummary,
      message: `Successfully auto-matched and linked ${linkedCount} Purchase Orders to Invoices.${warehouseMsg}`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
