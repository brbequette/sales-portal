import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createShipmentAndBuyLabel } from '@/lib/easyship'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from '@/lib/zoho-auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      packageId,        // local DB package ID
      packageZohoId,    // Zoho package ID
      salesOrderZohoId, // Zoho SO ID for updating
      courierServiceId, // selected courier from rates
      originAddress,    // { line_1, city, state, postal_code, country_alpha2 }
      destinationAddress,
      destinationContactName,
      destinationContactPhone,
      weight,
      dimensions,       // { length, width, height }
      items,            // [{ description, quantity, declaredValue, weight }]
      soNumber,         // SO number for reference
    } = body

    if (!courierServiceId || !weight) {
      return NextResponse.json({ success: false, error: 'Missing required fields (courierServiceId, weight)' }, { status: 400 })
    }

    // 1. Create shipment + buy label via Easyship
    const result = await createShipmentAndBuyLabel({
      originAddress: originAddress ? {
        line_1: originAddress.line_1 || originAddress.address,
        city: originAddress.city,
        state: originAddress.state,
        postal_code: originAddress.postal_code || originAddress.zip,
        country_alpha2: originAddress.country_alpha2 || originAddress.country || 'US',
      } : undefined,
      destinationAddress: {
        line_1: destinationAddress?.line_1 || destinationAddress?.address || '',
        city: destinationAddress?.city || '',
        state: destinationAddress?.state || '',
        postal_code: destinationAddress?.postal_code || destinationAddress?.zip || '',
        country_alpha2: destinationAddress?.country_alpha2 || 'US',
      },
      destinationContactName: destinationContactName || 'Customer',
      destinationContactPhone,
      courierServiceId,
      weight: parseFloat(weight) || 5,
      dimensions: dimensions || { length: 15, width: 15, height: 4 },
      items: items || [{ description: 'Diamond concrete blade', quantity: 1, declaredValue: 100, weight: parseFloat(weight) || 5 }],
      platformOrderNumber: soNumber,
    })

    // 2. Update local DB package with tracking info
    if (packageId) {
      await prisma.package.update({
        where: { id: packageId },
        data: {
          trackingNumber: result.trackingNumber,
          carrier: result.courierName,
          status: 'shipped',
          items: {
            ...(await prisma.package.findUnique({ where: { id: packageId } }).then(p => (p?.items as any) || {})),
            easyshipShipmentId: result.easyshipShipmentId,
            labelUrl: result.labelUrl,
            trackingPageUrl: result.trackingPageUrl,
            shippedAt: new Date().toISOString(),
          },
        },
      })
    }

    // 3. Push tracking info to Zoho Books package
    if (packageZohoId && salesOrderZohoId) {
      try {
        const token = await getZohoAccessToken()
        const ZOHO_DC = process.env.ZOHO_DC || 'com'
        const orgId = ZOHO_ORGANIZATION_ID

        // Update the package in Zoho Books with delivery method and tracking
        const zohoUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/packages/${packageZohoId}?organization_id=${orgId}`
        const zohoRes = await fetch(zohoUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            delivery_method: result.courierName,
            tracking_number: result.trackingNumber,
            notes: `Shipped via Easyship — ${result.courierName}. Label: ${result.labelUrl}. Tracking: ${result.trackingPageUrl}`,
          }),
        })

        if (!zohoRes.ok) {
          const errText = await zohoRes.text().catch(() => '')
          console.error('Zoho package update failed:', zohoRes.status, errText.substring(0, 200))
        }

        // Also try to create a shipment order in Zoho if possible
        try {
          const shipmentUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/shipmentorders?organization_id=${orgId}`
          await fetch(shipmentUrl, {
            method: 'POST',
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              salesorder_id: salesOrderZohoId,
              package_ids: [packageZohoId],
              delivery_method: result.courierName,
              tracking_number: result.trackingNumber,
              shipping_date: new Date().toISOString().split('T')[0],
              notes: `Shipped via Easyship. Tracking: ${result.trackingPageUrl}`,
            }),
          })
        } catch (shipErr) {
          console.error('Zoho shipment order creation failed (non-critical):', shipErr)
        }

      } catch (zohoErr) {
        console.error('Zoho update failed (shipment still created):', zohoErr)
        // Don't fail the whole request — the label is already purchased
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error('Ship Now error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create shipment' },
      { status: 500 }
    )
  }
}
