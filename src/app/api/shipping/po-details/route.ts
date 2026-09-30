import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdministrator } from '@/lib/auth-helpers'
import { databaseReadHeaders, LOCAL_DATA_INCOMPLETE } from '@/lib/database-read-metadata'
import { financialZohoLineItems } from '@/lib/zoho-line-items'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from '@/lib/zoho-auth'

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
        trackingNumber: true, salesOrderId: true, poNumber: true, salesOrderNumber: true,
        referenceNumber: true, date: true, shippingAddress: true,
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
    let lineItems = financialZohoLineItems(items.line_items || items.lineItems).map((line) => ({
      name: line.name || line.item_name || line.description || '',
      sku: line.sku || '',
      quantity: line.quantity || 1,
      rate: line.rate || 0,
      amount: line.item_total || 0,
      item_id: line.item_id || '',
    }))

    // If local line items are missing, fetch on-demand from Zoho Books and cache
    if (!lineItems.length) {
      try {
        const token = await getZohoAccessToken()
        const dc = process.env.ZOHO_DC || ZOHO_DC || "com"
        const orgId = ZOHO_ORGANIZATION_ID
        const url = `https://www.zohoapis.${dc}/books/v3/purchaseorders/${poZohoId}?organization_id=${orgId}`
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Zoho-oauthtoken ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          if (data.purchaseorder) {
            const p = data.purchaseorder
            const fetchedLines = p.line_items || []
            lineItems = financialZohoLineItems(fetchedLines).map((line: any) => ({
              name: line.name || line.item_name || line.description || '',
              sku: line.sku || '',
              quantity: line.quantity || 1,
              rate: line.rate || 0,
              amount: line.item_total || (line.quantity * line.rate) || 0,
              item_id: line.item_id || '',
            }))

            const shipToName = p.delivery_customer_name || p.delivery_address?.attention || po.shipToName || null
            const poNumber = p.purchaseorder_number || po.poNumber || null
            const referenceNumber = p.reference_number || po.referenceNumber || null

            await prisma.purchaseOrder.update({
              where: { zohoId: poZohoId },
              data: {
                poNumber,
                shipToName,
                referenceNumber,
                items: { lineItems: fetchedLines, ...p }
              }
            })

            return NextResponse.json({
              success: true,
              poNumber: poNumber || po.poNumber,
              salesOrderNumber: po.salesOrderNumber || referenceNumber,
              lineItems,
              vendorName: p.vendor_name || po.vendorName,
              shipToName,
              total: p.total || po.total,
              status: p.status || po.status,
              shippingCharge: Number(p.shipping_charge || 0),
              trackingNumber: po.trackingNumber || '',
              deliveryCustomerId: String(p.delivery_customer_id || ''),
              salesOrderId: po.salesOrderId || '',
            })
          }
        }
      } catch (zohoErr) {
        console.warn('[po-details] Could not load PO details from Zoho fallback:', zohoErr)
      }

      return NextResponse.json({ success: false, error: LOCAL_DATA_INCOMPLETE }, {
        status: 409,
        headers: databaseReadHeaders(startedAt, 1),
      })
    }

    return NextResponse.json({
      success: true,
      poNumber: po.poNumber,
      salesOrderNumber: po.salesOrderNumber || po.referenceNumber,
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
