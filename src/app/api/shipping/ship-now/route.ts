import { recipientPhone, ShippingRecipientError } from "@/lib/shipping-recipient"
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createShipmentAndBuyLabel } from '@/lib/easyship'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from '@/lib/zoho-auth'
import { requireAdministrator } from '@/lib/auth-helpers'
import { refreshShippingRollupForSalesOrder } from '@/lib/shipping-rollup'

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const {
      packageId,        // local DB package ID
      packageZohoId,    // Zoho package ID
      salesOrderZohoId, // Zoho SO ID for updating
      easyshipShipmentId: bodyEasyshipId,  // existing Easyship shipment ID from frontend
      courierServiceId, // selected courier from rates
      originAddress,    // { line_1, city, state, postal_code, country_alpha2 }
      destinationAddress,
      destinationContactName,
      destinationContactPhone,
      weight,
      dimensions,       // { length, width, height }
      items,            // [{ description, quantity, declaredValue, weight }]
      parcels,          // optional multi-parcel array [{ weight, dimensions, items }]
      soNumber,         // SO number for reference
      packageNumber,    // Package number (e.g. PKG-25323) — EasyShip indexes by this
      selectedRateCost, // Cost from the rate the user selected (fallback)
    } = body

    if (!courierServiceId || !weight) {
      return NextResponse.json({ success: false, error: 'Missing required fields (courierServiceId, weight)' }, { status: 400 })
    }

    // The provider draft and label state are verified before mutation.
    const existingEasyshipId: string | undefined = bodyEasyshipId || undefined

    console.log(`[ship-now] Starting for pkg ${packageId}, weight: ${weight}, dims: ${JSON.stringify(dimensions)}, courier: ${courierServiceId}, parcels: ${parcels?.length || 1}`)

    // 1. Create shipment + buy label via Easyship (reuses existing if available)
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
        ...(destinationAddress?.line_2 !== undefined ? { line_2: destinationAddress.line_2 } : {}),
        city: destinationAddress?.city || '',
        state: destinationAddress?.state || '',
        postal_code: destinationAddress?.postal_code || destinationAddress?.zip || '',
        country_alpha2: destinationAddress?.country_alpha2 || destinationAddress?.country || 'US',
      },
      destinationContactName: destinationContactName || 'Customer',
      destinationContactPhone: recipientPhone(destinationContactPhone, destinationAddress?.contact_phone, destinationAddress?.phone),
      courierServiceId,
      expectedCharge: Number(selectedRateCost),
      weight: parseFloat(weight),
      dimensions: dimensions,
      items: items || [{ description: 'Order item', quantity: 1, declaredValue: 100, weight: parseFloat(weight) }],
      parcels: parcels && parcels.length > 0 ? parcels : undefined,
      // EasyShip indexes by package number (PKG-25323), not SO number
      platformOrderNumber: packageNumber || soNumber,
      existingEasyshipId,
    })

    // Use selected rate cost as fallback if Easyship label response didn't include charge
    const finalCost = result.totalCharge || selectedRateCost || 0
    console.log(`[ship-now] Label result — tracking: ${result.trackingNumber}, cost from API: ${result.totalCharge}, selected rate cost: ${selectedRateCost}, final: ${finalCost}`)

    // 2. Update local DB package with tracking info
    if (packageId) {
      try {
        console.log(`[ship-now] Updating DB package: ${packageId}`)
        await prisma.package.update({
          where: { id: packageId },
          data: {
            trackingNumber: result.trackingNumber,
            carrier: result.courierName,
            status: 'shipped',
            shippingCharge: finalCost,
            items: {
              ...(await prisma.package.findUnique({ where: { id: packageId } }).then(p => (p?.items as any) || {})),
              dimensions: dimensions,
              weight: parseFloat(weight),
              ...(body.boxPreset ? { boxPreset: body.boxPreset } : {}),
              easyshipShipmentId: result.easyshipShipmentId,
              labelUrl: result.labelUrl,
              trackingPageUrl: result.trackingPageUrl,
              labelState: result.labelState,
              shippingDocuments: result.shippingDocuments,
              minDeliveryTime: result.minDeliveryTime,
              maxDeliveryTime: result.maxDeliveryTime,
              childTrackingNumbers: result.childTrackingNumbers,
              parcelCount: result.parcelCount || 1,
              fuelSurcharge: result.fuelSurcharge || 0,
              residentialSurcharge: result.residentialSurcharge || 0,
              insuranceFee: result.insuranceFee || 0,
              discountAmount: result.discountAmount || 0,
              shippedAt: new Date().toISOString(),
              easyshipCost: finalCost,
              easyshipCurrency: result.currency || 'USD',
            },
          },
        })
        console.log(`[ship-now] DB package updated successfully: ${packageId}`)
        const rollup = await refreshShippingRollupForSalesOrder(salesOrderZohoId, soNumber)
        console.log(`[ship-now] Shipping rollup updated ${rollup.salesOrdersUpdated} sales order(s) and ${rollup.invoicesUpdated} invoice(s)`)
      } catch (dbErr: any) {
        console.error(`[ship-now] FAILED to update DB package ${packageId}:`, dbErr.message || dbErr)
      }
    } else {
      console.warn('[ship-now] No packageId provided — skipping DB update')
    }

    // 3. Push tracking info to Zoho Books package
    let targetPkgZohoId = packageZohoId
    let targetSoZohoId = salesOrderZohoId
    if ((!targetPkgZohoId || !targetSoZohoId) && packageId) {
      try {
        const dbPkg = await prisma.package.findUnique({
          where: { id: packageId },
        })
        if (dbPkg) {
          if (!targetPkgZohoId) targetPkgZohoId = dbPkg.zohoId
          if (!targetSoZohoId) targetSoZohoId = dbPkg.salesOrderId || undefined
        }
      } catch (lookupErr: any) {
        console.warn('[ship-now] DB package lookup for Zoho IDs fallback failed:', lookupErr?.message)
      }
    }

    if (targetPkgZohoId && targetSoZohoId) {
      try {
        const token = await getZohoAccessToken()
        const ZOHO_DC = process.env.ZOHO_DC || 'com'
        const orgId = ZOHO_ORGANIZATION_ID

        // Update the package in Zoho Books with delivery method and tracking
        const zohoUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/packages/${targetPkgZohoId}?organization_id=${orgId}`
        const zohoRes = await fetch(zohoUrl, { signal: AbortSignal.timeout(15000),
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
          await fetch(shipmentUrl, { signal: AbortSignal.timeout(15000),
            method: 'POST',
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              salesorder_id: targetSoZohoId,
              package_ids: [targetPkgZohoId],
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

    const warning = (!result.trackingNumber || !result.courierName)
      ? 'Label may still be processing — tracking and carrier info not yet available. Check Easyship dashboard.'
      : undefined

    return NextResponse.json({
      success: true,
      warning,
      ...result,
      totalCharge: finalCost,  // Override with selected rate cost if API returned 0
    })
  } catch (error: any) {
    console.error('Ship Now error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create shipment' },
      { status: error instanceof ShippingRecipientError ? 400 : 500 }
    )
  }
}
