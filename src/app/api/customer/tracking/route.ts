import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCustomerToken } from '@/lib/customer-auth'

export async function GET(req: NextRequest) {
  try {
    const customer = await verifyCustomerToken(req)
    if (!customer?.accountId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get all invoices and sales orders for this account
    const invoices = await prisma.invoice.findMany({
      where: { accountId: customer.accountId },
      select: { zohoId: true, invoiceNumber: true, salesOrderZohoId: true }
    })

    const salesOrders = await prisma.salesOrder.findMany({
      where: { accountId: customer.accountId },
      select: { zohoId: true }
    })

    // Collect all sales order IDs to find packages
    const salesOrderZohoIds = salesOrders.map(s => s.zohoId).filter(Boolean) as string[]
    const invoiceSalesOrderZohoIds = invoices.map(i => i.salesOrderZohoId).filter(Boolean) as string[]
    const allSoIds = Array.from(new Set([...salesOrderZohoIds, ...invoiceSalesOrderZohoIds]))

    if (allSoIds.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const packages = await prisma.package.findMany({
      where: { salesOrderId: { in: allSoIds } }
    })

    const shipments = packages.map(pkg => {
      const inv = invoices.find(i => i.salesOrderZohoId === pkg.salesOrderId)
      const orderNumber = inv?.invoiceNumber || pkg.salesOrderNumber || pkg.salesOrderId || 'Unknown'

      return {
        id: pkg.id,
        orderNumber,
        packageNumber: pkg.packageNumber,
        carrier: pkg.carrier || 'Unknown',
        trackingNumber: pkg.trackingNumber,
        status: pkg.status || 'Processing',
        date: pkg.date,
        items: pkg.items
      }
    })

    return NextResponse.json({ success: true, data: shipments })
  } catch (error) {
    console.error('Customer tracking error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
