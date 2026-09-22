import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdministrator } from '@/lib/auth-helpers'
import { databaseReadHeaders, LOCAL_DATA_INCOMPLETE } from '@/lib/database-read-metadata'
import { financialZohoLineItems } from '@/lib/zoho-line-items'

export async function GET(req: Request) {
  const startedAt = performance.now()
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const poZohoId = new URL(req.url).searchParams.get('poZohoId')
    if (!poZohoId) return NextResponse.json({ error: 'Missing poZohoId' }, { status: 400 })

    const po = await prisma.purchaseOrder.findFirst({
      where: { zohoId: poZohoId },
      select: {
        items: true, vendorName: true, shipToName: true, total: true, status: true,
        trackingNumber: true, salesOrderId: true,
      },
    })
    if (!po) {
      return NextResponse.json({ success: false, error: LOCAL_DATA_INCOMPLETE }, {
        status: 409,
        headers: databaseReadHeaders(startedAt, 1),
      })
    }
    const items = po.items && typeof po.items === 'object' && !Array.isArray(po.items)
      ? po.items as Record<string, any>
      : {}
    const lineItems = financialZohoLineItems(items.line_items || items.lineItems).map((line) => ({
      name: line.name || line.item_name || line.description || '',
      sku: line.sku || '',
      quantity: line.quantity || 1,
      rate: line.rate || 0,
      amount: line.item_total || 0,
      item_id: line.item_id || '',
    }))
    if (!lineItems.length) {
      return NextResponse.json({ success: false, error: LOCAL_DATA_INCOMPLETE }, {
        status: 409,
        headers: databaseReadHeaders(startedAt, 1),
      })
    }
    return NextResponse.json({
      success: true,
      lineItems,
      vendorName: po.vendorName,
      shipToName: po.shipToName,
      total: po.total,
      status: po.status,
      shippingCharge: Number(items.shipping_charge || 0),
      trackingNumber: po.trackingNumber || '',
      deliveryCustomerId: String(items.delivery_customer_id || ''),
      salesOrderId: po.salesOrderId || '',
    }, { headers: databaseReadHeaders(startedAt, 1) })
  } catch (error) {
    console.error('Local PO detail read error:', error)
    return NextResponse.json({ success: false, error: LOCAL_DATA_INCOMPLETE }, {
      status: 500,
      headers: databaseReadHeaders(startedAt, 0),
    })
  }
}
