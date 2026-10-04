import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"
import { financialZohoLineItems } from "@/lib/zoho-line-items"
import { isPioneerCalifornia, validateDirectDropshipEvidence } from "@/lib/dropship-policy"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"

export async function POST(req: NextRequest) {
  const startedAt = performance.now()
  try {
    const actor = await getAuthenticatedDbUser()
    if (!actor) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { action = "preview", salesOrderIds = [], vendorOverrides = {} } = body

    if (!Array.isArray(salesOrderIds) || salesOrderIds.length === 0) {
      return NextResponse.json({ error: "salesOrderIds array is required" }, { status: 400 })
    }

    // 1. Fetch Sales Orders with Accounts
    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        OR: [
          { id: { in: salesOrderIds } },
          { zohoId: { in: salesOrderIds } }
        ]
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            shippingStreet: true,
            shippingCity: true,
            shippingState: true,
            shippingZip: true
          }
        }
      }
    })

    if (salesOrders.length === 0) {
      return NextResponse.json({ error: "No matching sales orders found" }, { status: 404 })
    }

    // 2. Fetch Active Authoritative Vendors
    const activeVendors = await prisma.vendor.findMany({
      where: { status: { equals: "active", mode: "insensitive" } },
      select: {
        id: true,
        zohoId: true,
        contactName: true,
        companyName: true
      }
    })

    const vendorMap = new Map<string, any>()
    for (const v of activeVendors) {
      vendorMap.set(v.zohoId, v)
      vendorMap.set(v.id, v)
      if (v.companyName) vendorMap.set(v.companyName.toLowerCase().trim(), v)
      if (v.contactName) vendorMap.set(v.contactName.toLowerCase().trim(), v)
    }

    // 3. Analyze each Sales Order and organize by Vendor Dropship Groups
    const previews: any[] = []
    const readyGroups: any[] = []
    const blockedGroups: any[] = []

    for (const so of salesOrders) {
      const itemsRaw = (so.items as any) || {}
      const rawLines = itemsRaw.line_items || itemsRaw.lineItems || (Array.isArray(itemsRaw) ? itemsRaw : [])
      const financialLines = financialZohoLineItems(rawLines)

      const shippingState = (
        so.account?.shippingState ||
        itemsRaw.shipping_address?.state ||
        itemsRaw.shipping_address?.state_code ||
        ""
      ).trim().toUpperCase()

      // Group items on this SO by Vendor
      const soVendorBuckets = new Map<string, any[]>()

      for (const line of financialLines) {
        const booksItemId = String(line.item_id || "").trim()
        const sku = String(line.sku || line.name || "").trim()
        const qty = parseFloat(line.quantity || 1)
        const dropshippedQty = parseFloat(line.quantity_dropshipped || 0)
        const remainingQty = Math.max(0, qty - dropshippedQty)

        if (remainingQty <= 0) continue

        // Check product mapping
        let dbProd: any = null
        if (booksItemId) {
          dbProd = await prisma.product.findUnique({ where: { booksItemId } }).catch(() => null)
        }
        if (!dbProd && sku) {
          dbProd = await prisma.product.findFirst({ where: { sku } }).catch(() => null)
        }

        // Determine vendor
        let vendorId = vendorOverrides[line.line_item_id] || (dbProd?.vendor ? String(dbProd.vendor).trim() : "")
        let matchedVendor = vendorMap.get(vendorId) || null

        const bucketKey = matchedVendor?.zohoId || vendorId || "unassigned"
        if (!soVendorBuckets.has(bucketKey)) {
          soVendorBuckets.set(bucketKey, [])
        }

        soVendorBuckets.get(bucketKey)!.push({
          lineItemId: line.line_item_id,
          itemId: line.item_id,
          name: line.name || line.item_name || sku,
          sku: sku,
          quantity: remainingQty,
          unitCost: dbProd ? parseFloat(dbProd.unitCost || 0) : 0,
          canDropship: dbProd?.canDropship ?? true,
          suggestedVendorId: matchedVendor?.zohoId || vendorId || null,
          suggestedVendorName: matchedVendor?.companyName || matchedVendor?.contactName || "Unassigned Vendor"
        })
      }

      // Convert SO buckets to preview items
      for (const [vendorKey, bucketItems] of soVendorBuckets.entries()) {
        const vendor = vendorMap.get(vendorKey)
        const vendorName = vendor?.companyName || vendor?.contactName || "Unassigned Vendor"
        const totalEstimatedCost = bucketItems.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0)

        // Policy check: Pioneer CA
        let isBlocked = false
        let blockReason = ""

        if (vendorKey === "unassigned" || !vendor?.zohoId) {
          isBlocked = true
          blockReason = "No authoritative active vendor assigned to SKU"
        } else if (isPioneerCalifornia(vendorName, shippingState)) {
          isBlocked = true
          blockReason = "Pioneer California shipments cannot be direct-dropshipped; must ship via Titan hub."
        }

        const soNum = (itemsRaw.salesorder_number || itemsRaw.salesOrderNumber || so.id.slice(-6))
        const groupPayload = {
          salesOrderId: so.zohoId || so.id,
          salesOrderNumber: soNum,
          customerName: so.account?.name || itemsRaw.customer_name || "Customer",
          destination: `${so.account?.shippingCity || ''}, ${shippingState}`,
          vendorId: vendor?.zohoId || null,
          vendorName,
          items: bucketItems,
          totalEstimatedCost,
          isBlocked,
          blockReason
        }

        if (isBlocked) {
          blockedGroups.push(groupPayload)
        } else {
          readyGroups.push(groupPayload)
        }
        previews.push(groupPayload)
      }
    }

    // If action is preview, return analysis
    if (action === "preview") {
      return NextResponse.json({
        success: true,
        action: "preview",
        totalOrders: salesOrders.length,
        readyGroupsCount: readyGroups.length,
        blockedGroupsCount: blockedGroups.length,
        totalEstimatedCost: readyGroups.reduce((s, g) => s + g.totalEstimatedCost, 0),
        groups: previews,
        readyGroups,
        blockedGroups
      })
    }

    // 4. Action: EXECUTE BATCH DISPATCH
    if (action === "execute") {
      const token = await getZohoAccessToken()
      const ZOHO_DC = process.env.ZOHO_DC || 'com'
      const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
      const ORG_ID = ZOHO_ORGANIZATION_ID

      const dispatchResults: any[] = []
      let successCount = 0
      let failureCount = 0

      for (const group of readyGroups) {
        try {
          // Prepare Zoho Books Purchase Order Payload for Dropshipment
          const poLineItems = group.items.map((i: any) => ({
            item_id: i.itemId,
            name: i.name,
            rate: i.unitCost > 0 ? i.unitCost : undefined,
            quantity: i.quantity,
            salesorder_item_id: i.lineItemId
          }))

          const poPayload: any = {
            vendor_id: group.vendorId,
            salesorder_id: group.salesOrderId,
            is_drop_shipment: true,
            line_items: poLineItems,
            notes: `Automated Vendor Dropship PO for Sales Order #${group.salesOrderNumber}. Dispatched via Titan Diamond Shipping Center.`
          }

          const zohoRes = await fetch(`${baseUrl}/purchaseorders?organization_id=${ORG_ID}`, {
            method: "POST",
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(poPayload),
            signal: AbortSignal.timeout(15000)
          })

          const zohoData = await zohoRes.json()
          if (!zohoRes.ok || zohoData.code !== 0) {
            throw new Error(zohoData.message || `Zoho Books PO Error code ${zohoData.code}`)
          }

          const createdPo = zohoData.purchaseorder || {}
          const poId = createdPo.purchaseorder_id
          const poNumber = createdPo.purchaseorder_number

          // Persist PO in PostgreSQL database
          await prisma.purchaseOrder.upsert({
            where: { zohoId: poId },
            update: {
              poNumber: poNumber || null,
              salesOrderId: group.salesOrderId,
              salesOrderNumber: group.salesOrderNumber,
              vendorName: group.vendorName,
              total: parseFloat(createdPo.total || group.totalEstimatedCost || 0),
              status: createdPo.status || "open",
              isDropshipment: true,
              date: createdPo.date ? new Date(createdPo.date) : new Date(),
              items: { lineItems: group.items }
            },
            create: {
              zohoId: poId,
              poNumber: poNumber || null,
              salesOrderId: group.salesOrderId,
              salesOrderNumber: group.salesOrderNumber,
              vendorName: group.vendorName,
              total: parseFloat(createdPo.total || group.totalEstimatedCost || 0),
              status: createdPo.status || "open",
              isDropshipment: true,
              date: createdPo.date ? new Date(createdPo.date) : new Date(),
              items: { lineItems: group.items }
            }
          }).catch(err => console.warn(`[batch-dropship] DB upsert warning for PO ${poId}:`, err.message))

          successCount++
          dispatchResults.push({
            success: true,
            salesOrderId: group.salesOrderId,
            salesOrderNumber: group.salesOrderNumber,
            vendorName: group.vendorName,
            poId,
            poNumber,
            total: createdPo.total || group.totalEstimatedCost
          })
        } catch (err: any) {
          failureCount++
          dispatchResults.push({
            success: false,
            salesOrderId: group.salesOrderId,
            salesOrderNumber: group.salesOrderNumber,
            vendorName: group.vendorName,
            error: err.message
          })
        }
      }

      const durationMs = Math.round(performance.now() - startedAt)

      return NextResponse.json({
        success: true,
        action: "execute",
        totalProcessed: readyGroups.length,
        successCount,
        failureCount,
        durationMs,
        dispatches: dispatchResults,
        blocked: blockedGroups
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("Error in batch-dropship route:", error)
    return NextResponse.json({ error: error.message || "Failed to process batch dropship" }, { status: 500 })
  }
}
