import { NextResponse } from 'next/server'
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * GET /api/document-lifecycle?zohoId=xxx&type=Invoice|SalesOrder|Quote
 *
 * Returns the full document lifecycle chain for a given document:
 *   Quote → SalesOrder → PurchaseOrders → Packages → Invoice(s) → Payments
 *
 * All lookups are indexed DB queries (no full-table scans).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const zohoId = searchParams.get('zohoId')
  const type   = searchParams.get('type') || 'Invoice'

  if (!zohoId) {
    return NextResponse.json({ success: false, error: 'Missing zohoId' }, { status: 400 })
  }

  try {
    let quote:          any     = null
    let salesOrder:     any     = null
    let purchaseOrders: any[]   = []
    let packages:       any[]   = []
    let invoices:       any[]   = []
    let payments:       any[]   = []

    // ── Resolve the starting document ──────────────────────────────────────
    let soZohoId:       string | null = null
    let soNumber:       string | null = null
    let invoiceZohoId:  string | null = null

    if (type === 'Invoice') {
      const inv = await prisma.invoice.findUnique({ where: { zohoId } })
      if (!inv) throw new Error('Invoice not found locally')
      invoices.push(inv)
      invoiceZohoId = zohoId

      const items: any = inv.items || {}
      soNumber  = items.salesorder_number || items.salesOrderNumber || null
      const soId = items.salesorder_id || null

      // Find Sales Order by zohoId or salesorder_number stored on the invoice
      if (soId) {
        salesOrder = await prisma.salesOrder.findUnique({ where: { zohoId: soId } })
      }
      if (!salesOrder && soNumber) {
        salesOrder = await prisma.salesOrder.findFirst({
          where: {
            OR: [
              { items: { path: ['salesorder_number'], equals: soNumber } },
              { items: { path: ['salesOrderNumber'],  equals: soNumber } },
            ]
          }
        })
      }
      if (salesOrder) soZohoId = salesOrder.zohoId

      // Find Quote from invoice items or via SO
      const estimateId = items.estimate_id || (salesOrder ? (salesOrder.items as any)?.estimate_id : null)
      if (estimateId) {
        quote = await prisma.quote.findFirst({ where: { zohoId: estimateId } })
      }

      // Payments on this invoice
      payments = await prisma.payment.findMany({
        where: { OR: [{ invoiceId: zohoId }, { invoiceNumber: items.invoice_number || items.invoiceNumber }].filter(Boolean) as any[] }
      })

    } else if (type === 'SalesOrder') {
      salesOrder = await prisma.salesOrder.findUnique({ where: { zohoId } })
      if (!salesOrder) throw new Error('SalesOrder not found locally')
      soZohoId = zohoId

      const soItems: any = salesOrder.items || {}
      soNumber = soItems.salesorder_number || soItems.salesOrderNumber || null

      // Find Quote
      const estimateId = soItems.estimate_id || null
      if (estimateId) {
        quote = await prisma.quote.findFirst({ where: { zohoId: estimateId } })
      }

      // Find linked Invoices by salesorder_number
      if (soNumber) {
        invoices = await prisma.invoice.findMany({
          where: {
            OR: [
              { items: { path: ['salesorder_number'], equals: soNumber } },
              { items: { path: ['salesOrderNumber'],  equals: soNumber } },
              { items: { path: ['salesorder_id'],     equals: zohoId   } },
            ]
          },
          orderBy: { issueDate: 'desc' }
        })
      }

      // Payments on all linked invoices
      for (const inv of invoices) {
        const pmts = await prisma.payment.findMany({ where: { invoiceId: inv.zohoId } })
        payments.push(...pmts)
      }

    } else if (type === 'Quote') {
      quote = await prisma.quote.findUnique({ where: { zohoId } })
      if (!quote) throw new Error('Quote not found locally')

      const qItems: any = quote.items || {}
      const estimateNum = qItems.estimate_number || qItems.estimateNumber || null

      // Find SO linked to this quote
      salesOrder = await prisma.salesOrder.findFirst({
        where: {
          OR: [
            { items: { path: ['estimate_id'],     equals: zohoId      } },
            { items: { path: ['estimate_number'], equals: estimateNum  } },
          ].filter(x => x && Object.values(x)[0]) as any[]
        }
      })
      if (salesOrder) {
        soZohoId = salesOrder.zohoId
        const soItems: any = salesOrder.items || {}
        soNumber = soItems.salesorder_number || soItems.salesOrderNumber || null

        // Invoices linked to SO
        if (soNumber) {
          invoices = await prisma.invoice.findMany({
            where: {
              OR: [
                { items: { path: ['salesorder_number'], equals: soNumber } },
                { items: { path: ['salesOrderNumber'],  equals: soNumber } },
                ...(soZohoId ? [{ items: { path: ['salesorder_id'], equals: soZohoId } }] : []),
              ]
            },
            orderBy: { issueDate: 'desc' }
          })
        }

        for (const inv of invoices) {
          const pmts = await prisma.payment.findMany({ where: { invoiceId: inv.zohoId } })
          payments.push(...pmts)
        }
      }
    }

    // ── POs and Packages — linked by SO zohoId or soNumber ─────────────────
    if (soZohoId || soNumber) {
      purchaseOrders = await prisma.purchaseOrder.findMany({
        where: {
          OR: [
            soZohoId ? { salesOrderId: soZohoId }           : undefined,
            soNumber ? { salesOrderNumber: soNumber }        : undefined,
          ].filter(Boolean) as any[]
        },
        orderBy: { createdAt: 'desc' }
      })

      packages = await prisma.package.findMany({
        where: {
          OR: [
            soZohoId ? { salesOrderId:     soZohoId } : undefined,
            soNumber ? { salesOrderNumber: soNumber }  : undefined,
          ].filter(Boolean) as any[]
        },
        orderBy: { createdAt: 'desc' }
      })
    }

    return NextResponse.json({
      success: true,
      lifecycle: { quote, salesOrder, purchaseOrders, packages, invoices, payments }
    })

  } catch (error: any) {
    console.error('Lifecycle Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
