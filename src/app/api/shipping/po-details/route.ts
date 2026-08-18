import { NextResponse } from 'next/server'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from '@/lib/zoho-auth'
import { prisma } from '@/lib/prisma'

const ZOHO_DC = process.env.ZOHO_DC || 'com'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const poZohoId = searchParams.get('poZohoId')

    if (!poZohoId) {
      return NextResponse.json({ error: 'Missing poZohoId' }, { status: 400 })
    }

    const token = await getZohoAccessToken()

    // Fetch individual PO details from Zoho Books
    const res = await fetch(
      `https://www.zohoapis.${ZOHO_DC}/books/v3/purchaseorders/${poZohoId}?organization_id=${ZOHO_ORGANIZATION_ID}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('Zoho PO detail error:', res.status, errText.substring(0, 200))
      return NextResponse.json({ error: `Zoho API returned ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    const po = data.purchaseorder || {}

    const lineItems = (po.line_items || []).map((li: any) => ({
      name: li.name || li.item_name || li.description || '',
      sku: li.sku || '',
      quantity: li.quantity || 1,
      rate: li.rate || 0,
      amount: li.item_total || 0,
      item_id: li.item_id || '',
    }))

    // Update the PO in our database with the full details including line_items
    await prisma.purchaseOrder.updateMany({
      where: { zohoId: poZohoId },
      data: {
        items: po as any, // Store full PO response
        vendorName: po.vendor_name || undefined,
        shipToName: po.delivery_customer_name || po.customer_name || undefined,
        salesOrderId: po.salesorder_id || undefined,
        salesOrderNumber: po.salesorder_number || po.reference_number || undefined,
        isDropshipment: !!(po.delivery_customer_id || po.salesorder_id || po.delivery_customer_name),
        trackingNumber: po.tracking_number || undefined,
      }
    })

    return NextResponse.json({
      success: true,
      lineItems,
      vendorName: po.vendor_name,
      shipToName: po.delivery_customer_name || po.customer_name,
      total: po.total,
      status: po.status,
      shippingCharge: po.shipping_charge || 0,
      trackingNumber: po.tracking_number || '',
      deliveryCustomerId: po.delivery_customer_id || '',
      salesOrderId: po.salesorder_id || '',
    })
  } catch (error: any) {
    console.error('PO detail fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
