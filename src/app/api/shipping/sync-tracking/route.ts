import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"
import { refreshShippingRollupForSalesOrder } from "@/lib/shipping-rollup"

export async function POST(req: NextRequest) {
  const startedAt = performance.now()
  try {
    const actor = await getAuthenticatedDbUser()
    if (!actor) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { packageIds, maxPackages = 25 } = body

    const EASYSHIP_URL = (process.env.EASYSHIP_API_URL || 'https://enterprise-api.easyship.com').replace(/\/+$/, '')
    const API_URL = EASYSHIP_URL.match(/\/\d{4}-\d{2}$/) ? EASYSHIP_URL : EASYSHIP_URL + '/2024-09'
    const apiKey = process.env.EASYSHIP_API_KEY?.replace(/^["']|["']$/g, '')

    // Select active packages that need tracking sync
    const whereClause: any = packageIds && Array.isArray(packageIds) && packageIds.length > 0
      ? { id: { in: packageIds } }
      : {
          status: { in: ['packaged', 'shipped', 'not_shipped', 'in_transit', 'out_for_delivery'] },
          OR: [
            { trackingNumber: { not: null } },
            { trackingNumber: { not: '' } }
          ]
        }

    const packagesToSync = await prisma.package.findMany({
      where: whereClause,
      take: Math.min(50, maxPackages),
      orderBy: { updatedAt: 'asc' }
    })

    let syncedCount = 0
    let updatedCount = 0
    let deliveredCount = 0
    const syncResults: any[] = []

    for (const pkg of packagesToSync) {
      syncedCount++
      const pkgItems = (pkg.items as any) || {}
      let targetShipmentId = pkgItems.easyshipShipmentId || null
      const targetTracking = (pkg.trackingNumber || '').trim()

      let newStatus: string | null = null
      let newCarrier: string | null = null
      let deliveryState: string | null = null
      let checkpointDesc: string | null = null

      // Attempt sync via Easyship if apiKey exists
      if (apiKey) {
        try {
          let shipmentData: any = null

          if (targetShipmentId) {
            const res = await fetch(`${API_URL}/shipments/${targetShipmentId}`, {
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(8000)
            })
            if (res.ok) {
              const data = await res.json()
              shipmentData = data.shipment || data
            }
          }

          if (!shipmentData && targetTracking) {
            const searchRes = await fetch(`${API_URL}/shipments?tracking_number=${encodeURIComponent(targetTracking)}`, {
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(8000)
            })
            if (searchRes.ok) {
              const data = await searchRes.json()
              shipmentData = data.shipments?.find((s: any) =>
                s.trackings?.some((t: any) => t.tracking_number === targetTracking) ||
                s.tracking_number === targetTracking
              )
            }
          }

          if (shipmentData) {
            deliveryState = (shipmentData.delivery_state || shipmentData.status || '').toLowerCase()
            newCarrier = shipmentData.courier?.name || shipmentData.selected_courier?.name || null
            const trackings = shipmentData.trackings || []
            const primaryTracking = trackings[0]?.tracking_number || shipmentData.tracking_number || targetTracking
            
            // Check checkpoints
            const checkpoints = shipmentData.checkpoints || shipmentData.trackings?.[0]?.checkpoints || []
            if (checkpoints.length > 0) {
              checkpointDesc = checkpoints[checkpoints.length - 1]?.message || checkpoints[checkpoints.length - 1]?.description || null
            }

            if (deliveryState) {
              if (deliveryState === 'delivered') {
                newStatus = 'delivered'
              } else if (deliveryState === 'out_for_delivery') {
                newStatus = 'out_for_delivery'
              } else if (deliveryState === 'in_transit' || deliveryState === 'shipped') {
                newStatus = 'shipped'
              } else if (deliveryState.includes('exception') || deliveryState.includes('fail')) {
                newStatus = 'exception'
              }
            }

            const updatedItems = {
              ...pkgItems,
              lastTrackingSyncAt: new Date().toISOString(),
              easyshipShipmentId: shipmentData.easyship_shipment_id || targetShipmentId,
              courierName: newCarrier || pkgItems.courierName,
              latestCheckpoint: checkpointDesc || pkgItems.latestCheckpoint,
              deliveryState: deliveryState || pkgItems.deliveryState
            }

            const hasChanged = (newStatus && newStatus !== pkg.status) || (newCarrier && newCarrier !== pkg.carrier)
            if (hasChanged || !pkgItems.lastTrackingSyncAt) {
              await prisma.package.update({
                where: { id: pkg.id },
                data: {
                  status: newStatus || pkg.status,
                  carrier: newCarrier || pkg.carrier,
                  trackingNumber: primaryTracking || pkg.trackingNumber,
                  items: updatedItems,
                  updatedAt: new Date()
                }
              })
              updatedCount++

              // If newly delivered, trigger POD rollup and staged follow-up
              if (newStatus === 'delivered' && pkg.status !== 'delivered') {
                deliveredCount++
                if (pkg.salesOrderId) {
                  await refreshShippingRollupForSalesOrder(pkg.salesOrderId, pkg.salesOrderNumber || undefined).catch(() => null)
                }

                // Stage POD notification & communication event
                let acc: any = null
                if (pkg.salesOrderId) {
                  const so = await prisma.salesOrder.findFirst({
                    where: {
                      OR: [
                        { id: pkg.salesOrderId },
                        { zohoId: pkg.salesOrderId }
                      ]
                    },
                    include: {
                      account: {
                        include: {
                          contacts: true
                        }
                      }
                    }
                  })
                  acc = so?.account
                }

                if (acc) {
                  const primaryContact = acc.contacts?.find((c: any) => c.isPrimary) || acc.contacts?.[0]
                  if (acc.ownerId) {
                    await prisma.notification.create({
                      data: {
                        userId: acc.ownerId,
                        title: `📦 Delivered: ${acc.name} (Pkg #${pkg.packageNumber || pkg.trackingNumber})`,
                        body: `Tracking #${primaryTracking} confirmed DELIVERED. Arbor check-in staged.`,
                        url: `/display?accountId=${acc.id}`
                      }
                    }).catch(() => null)
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
                      subject: `Delivered: ${newCarrier || pkg.carrier || 'Carrier'} #${primaryTracking}`,
                      summary: `Carrier confirmed delivery. 1-click blade wear and arbor accessory check-in staged.`,
                      occurredAt: new Date(),
                      metadata: {
                        trackingNumber: primaryTracking,
                        carrier: newCarrier || pkg.carrier,
                        packageNumber: pkg.packageNumber
                      }
                    },
                    update: {
                      occurredAt: new Date(),
                      metadata: {
                        trackingNumber: primaryTracking,
                        carrier: newCarrier || pkg.carrier,
                        packageNumber: pkg.packageNumber
                      }
                    }
                  }).catch(() => null)
                }
              }

              syncResults.push({
                packageId: pkg.id,
                trackingNumber: primaryTracking,
                previousStatus: pkg.status,
                newStatus: newStatus || pkg.status,
                carrier: newCarrier || pkg.carrier,
                checkpoint: checkpointDesc
              })
            }
          }
        } catch (err: any) {
          console.warn(`[sync-tracking] Error syncing pkg ${pkg.id}:`, err.message)
        }
      }
    }

    const durationMs = Math.round(performance.now() - startedAt)

    return NextResponse.json({
      success: true,
      syncedCount,
      updatedCount,
      deliveredCount,
      durationMs,
      results: syncResults
    })
  } catch (error: any) {
    console.error("Error in sync-tracking route:", error)
    return NextResponse.json({ error: error.message || "Failed to sync tracking" }, { status: 500 })
  }
}
