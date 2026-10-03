import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from 'crypto'

// POST -- Webhook handler for shipping & carrier tracking status updates
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-easyship-signature')
    const secret = process.env.EASYSHIP_WEBHOOK_SECRET
    
    if (!secret || !signature) {
      return NextResponse.json({ error: "Missing signature or secret" }, { status: 401 })
    }

    const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const hashBuffer = Buffer.from(hash, 'hex')
    const sigBuffer = Buffer.from(signature, 'hex')
    if (hashBuffer.length !== sigBuffer.length || !crypto.timingSafeEqual(hashBuffer, sigBuffer)) {
      return new Response('Invalid signature', { status: 401 })
    }

    const body = JSON.parse(rawBody)
    const eventType = body.event_type || body.type || ''
    const eventData = body.data || body.shipment || body

    const trackingNumber = body.trackingNumber 
      || eventData.trackingNumber 
      || eventData.trackings?.[0]?.tracking_number 
      || eventData.tracking_number 
      || ''

    const packageId = body.packageId || eventData.packageId || ''
    const easyshipShipmentId = body.easyshipShipmentId 
      || eventData.easyship_shipment_id 
      || eventData.id 
      || ''

    const platformOrderNumber = body.platformOrderNumber 
      || eventData.platform_order_number 
      || ''

    const rawStatus = body.status 
      || eventData.status 
      || eventData.delivery_status 
      || eventData.trackings?.[0]?.status 
      || eventType
      || ''

    const carrier = body.carrier 
      || eventData.carrier 
      || eventData.trackings?.[0]?.carrier 
      || eventData.courier?.name 
      || ''

    console.log(`[shipping-webhook] Event: ${eventType || 'direct'}, tracking: ${trackingNumber}, status: ${rawStatus}, shipment: ${easyshipShipmentId}`)

    if (!trackingNumber && !packageId && !easyshipShipmentId && !platformOrderNumber) {
      return NextResponse.json({ error: "Missing tracking, package, or shipment identifiers" }, { status: 400 })
    }

    // Find package by tracking number, local packageId, easyshipShipmentId in items, or packageNumber
    const pkg = await prisma.package.findFirst({
      where: {
        OR: [
          ...(packageId ? [{ id: packageId }] : []),
          ...(trackingNumber ? [{ trackingNumber: trackingNumber }] : []),
          ...(platformOrderNumber ? [{ packageNumber: platformOrderNumber }] : []),
        ],
      },
    })

    if (!pkg) {
      console.warn(`[shipping-webhook] Package record not found for tracking: ${trackingNumber}, platformOrder: ${platformOrderNumber}`)
      return NextResponse.json({ message: "Package record not found, webhook acknowledged" }, { status: 200 })
    }

    // Map carrier / webhook status to normalized status
    let normalizedStatus = pkg.status
    const lowerStatus = (rawStatus || "").toLowerCase()
    
    if (lowerStatus.includes("deliver") || lowerStatus.includes("completed")) {
      normalizedStatus = "delivered"
    } else if (lowerStatus.includes("exception") || lowerStatus.includes("fail") || lowerStatus.includes("issue") || lowerStatus.includes("undeliverable")) {
      normalizedStatus = "exception"
    } else if (lowerStatus.includes("transit") || lowerStatus.includes("out for delivery") || lowerStatus.includes("shipped") || lowerStatus.includes("in_transit")) {
      normalizedStatus = "shipped"
    }

    const currentItems = (pkg.items as any) || {}
    const updatedItems = {
      ...currentItems,
      lastWebhookAt: new Date().toISOString(),
      lastWebhookEvent: eventType || 'tracking_update',
      carrierStatus: rawStatus,
      ...(lowerStatus.includes("exception") || lowerStatus.includes("fail") ? {
        exceptionDetails: eventData.exception || eventData.checkpoint?.description || 'Carrier reported exception or delivery attempt failure',
      } : {}),
    }

    // Update Package status in Prisma
    const updatedPkg = await prisma.package.update({
      where: { id: pkg.id },
      data: {
        status: normalizedStatus,
        carrier: carrier || pkg.carrier,
        trackingNumber: trackingNumber || pkg.trackingNumber,
        items: updatedItems,
      },
    })

    // If marked delivered, update sales order shipping rollup and optionally update Zoho shipment status
    if (normalizedStatus === 'delivered' && pkg.salesOrderId) {
      try {
        const { refreshShippingRollupForSalesOrder } = await import('@/lib/shipping-rollup')
        await refreshShippingRollupForSalesOrder(pkg.salesOrderId, pkg.salesOrderNumber || undefined)
        console.log(`[shipping-webhook] Delivered rollup updated for SO ${pkg.salesOrderNumber || pkg.salesOrderId}`)
      } catch (rollupErr) {
        console.warn('[shipping-webhook] Failed to run rollup for delivered pkg:', rollupErr)
      }

      // If package has a Zoho package ID, update Zoho package delivery status
      if (pkg.zohoId) {
        try {
          const { getZohoAccessToken, ZOHO_ORGANIZATION_ID } = await import('@/lib/zoho-auth')
          const token = await getZohoAccessToken()
          const ZOHO_DC = process.env.ZOHO_DC || 'com'
          const zohoUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/packages/${pkg.zohoId}?organization_id=${ZOHO_ORGANIZATION_ID}`
          await fetch(zohoUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              notes: `Delivered on ${new Date().toLocaleDateString()} via ${carrier || pkg.carrier}. Tracking: ${trackingNumber || pkg.trackingNumber}`,
            }),
          })
        } catch (zohoErr) {
          console.warn('[shipping-webhook] Zoho delivery note update failed (non-critical):', zohoErr)
        }
      }

      // Stage Automated POD Check & Rep Notification
      try {
        const so = await prisma.salesOrder.findUnique({
          where: { id: pkg.salesOrderId },
          include: {
            account: {
              include: {
                owner: true,
                contacts: true
              }
            }
          }
        })

        if (so?.account) {
          const acc = so.account
          const primaryContact = acc.contacts?.find(c => c.isPrimary) || acc.contacts?.[0]
          
          if (acc.ownerId) {
            await prisma.notification.create({
              data: {
                userId: acc.ownerId,
                title: `📦 Delivered: ${acc.name} (Pkg #${pkg.packageNumber || pkg.trackingNumber})`,
                body: `Carrier confirmed delivery (${carrier || pkg.carrier || 'Carrier'}). 1-Click POD follow-up ready in Communicator.`,
                url: `/display?accountId=${acc.id}`
              }
            })
          }

          await prisma.communicationEvent.upsert({
            where: {
              sourceType_sourceId_eventType: {
                sourceType: "PACKAGE",
                sourceId: pkg.id,
                eventType: "DELIVERED_POD_FOLLOWUP"
              }
            },
            create: {
              accountId: acc.id,
              contactId: primaryContact?.id || null,
              actorId: acc.ownerId || null,
              channel: "SMS",
              direction: "OUTBOUND_STAGED",
              eventType: "DELIVERED_POD_FOLLOWUP",
              sourceType: "PACKAGE",
              sourceId: pkg.id,
              subject: `Delivered: ${carrier || pkg.carrier || 'Carrier'} #${trackingNumber || pkg.trackingNumber}`,
              summary: `Package delivered. Staged 1-click blade wear and arbor accessory check-in.`,
              occurredAt: new Date(),
              metadata: {
                trackingNumber: trackingNumber || pkg.trackingNumber,
                carrier: carrier || pkg.carrier,
                packageNumber: pkg.packageNumber,
                salesOrderNumber: pkg.salesOrderNumber
              }
            },
            update: {
              occurredAt: new Date()
            }
          })
        }
      } catch (commsErr) {
        console.warn('[shipping-webhook] Failed to stage delivery POD notification / event:', commsErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Package status updated successfully",
      package: {
        id: updatedPkg.id,
        trackingNumber: updatedPkg.trackingNumber,
        status: updatedPkg.status,
        normalizedStatus,
      },
    })
  } catch (err: any) {
    console.error("Shipping Webhook Error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
