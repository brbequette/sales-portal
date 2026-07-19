import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const zohoId = searchParams.get('zohoId')
  const type = searchParams.get('type') // 'Invoice', 'SalesOrder', 'Quote'

  if (!zohoId || !type) {
    return NextResponse.json({ success: false, error: 'Missing zohoId or type' }, { status: 400 })
  }

  try {
    let quote = null
    let salesOrder = null
    let purchaseOrders: any[] = []
    let packages: any[] = []
    let invoices: any[] = []
    let payments: any[] = []

    if (type === 'Invoice') {
      const inv = await prisma.invoice.findUnique({ where: { zohoId } })
      if (!inv) throw new Error("Invoice not found locally")
      invoices.push(inv)
      
      const items = inv.items as any
      if (items?.salesorder_id || items?.salesorder_number) {
        salesOrder = await prisma.salesOrder.findFirst({ 
          where: { OR: [{ zohoId: items.salesorder_id }, { items: { path: ['salesOrderNumber'], equals: items.salesorder_number } }] } 
        })
      }
      
      if (items?.estimate_id) {
        quote = await prisma.quote.findFirst({ where: { zohoId: items.estimate_id } })
      } else if (salesOrder) {
        const soItems = salesOrder.items as any
        if (soItems?.estimate_id) {
          quote = await prisma.quote.findFirst({ where: { zohoId: soItems.estimate_id } })
        }
      }

      payments = await prisma.payment.findMany({ where: { invoiceId: zohoId } })
    } 
    else if (type === 'SalesOrder') {
      salesOrder = await prisma.salesOrder.findUnique({ where: { zohoId } })
      if (!salesOrder) throw new Error("SalesOrder not found locally")
      
      const soItems = salesOrder.items as any
      if (soItems?.estimate_id) {
        quote = await prisma.quote.findFirst({ where: { zohoId: soItems.estimate_id } })
      }

      const invs = await prisma.invoice.findMany()
      invoices = invs.filter((i: any) => i.items?.salesorder_id === zohoId || i.items?.salesorder_number === soItems?.salesOrderNumber)
      
      for (const inv of invoices) {
        const pmts = await prisma.payment.findMany({ where: { invoiceId: inv.zohoId } })
        payments.push(...pmts)
      }
    }
    else if (type === 'Quote') {
      quote = await prisma.quote.findUnique({ where: { zohoId } })
      if (!quote) throw new Error("Quote not found locally")
      
      const sos = await prisma.salesOrder.findMany()
      salesOrder = sos.find((s: any) => s.items?.estimate_id === zohoId)

      if (salesOrder) {
        const invs = await prisma.invoice.findMany()
        invoices = invs.filter((i: any) => i.items?.salesorder_id === salesOrder.zohoId || i.items?.estimate_id === zohoId)
        for (const inv of invoices) {
          const pmts = await prisma.payment.findMany({ where: { invoiceId: inv.zohoId } })
          payments.push(...pmts)
        }
      } else {
        const invs = await prisma.invoice.findMany()
        invoices = invs.filter((i: any) => i.items?.estimate_id === zohoId)
      }
    }

    if (salesOrder) {
      purchaseOrders = await prisma.purchaseOrder.findMany({
         where: { items: { path: ['salesorder_id'], equals: salesOrder.zohoId } }
      })
      packages = await prisma.package.findMany({
         where: { OR: [{ salesOrderId: salesOrder.zohoId }, { salesOrderNumber: (salesOrder.items as any)?.salesOrderNumber }] }
      })
    }

    return NextResponse.json({ 
      success: true, 
      lifecycle: { quote, salesOrder, purchaseOrders, packages, invoices, payments }
    })
  } catch (error: any) {
    console.error('Lifecycle Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
