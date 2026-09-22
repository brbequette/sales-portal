import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
import { requireAdministrator } from "@/lib/auth-helpers"
import { financialZohoLineItems } from "@/lib/zoho-line-items"

const ORG_ID = ZOHO_ORGANIZATION_ID

// PUT -- Update package tracking or status
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse

    const body = await req.json()
    const { action, packageId, carrier, trackingNumber, status, salesOrderId } = body

    if (action === "syncSalesOrder") {
      if (!salesOrderId) {
        return NextResponse.json({ error: "Missing salesOrderId" }, { status: 400 })
      }

      let token = await getZohoAccessToken()
      const ZOHO_DC = process.env.ZOHO_DC || "com"
      const url = `https://www.zohoapis.${ZOHO_DC}/books/v3/salesorders/${salesOrderId}?organization_id=${ORG_ID}`

      let res = await fetch(url, { signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })

      // Retry once if 401 Unauthorized
      if (res.status === 401) {
        console.log("[shipping-api] syncSalesOrder returned 401. Force refreshing token...");
        token = await getZohoAccessToken(true)
        res = await fetch(url, { signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Zoho-oauthtoken ${token}` }
        })
      }

      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch from Zoho: ${res.status}` }, { status: 500 })
      }

      let data = await res.json()
      // Retry if Zoho error code indicates auth/permission issue
      if (data.code === 57 || data.code === 5 || data.message?.toLowerCase().includes("auth") || data.message?.toLowerCase().includes("permission") || data.message?.toLowerCase().includes("not authorized")) {
        console.log(`[shipping-api] Auth issue detected in response code ${data.code}. Force refreshing token...`);
        token = await getZohoAccessToken(true)
        res = await fetch(url, { signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Zoho-oauthtoken ${token}` }
        })
        if (!res.ok) {
          return NextResponse.json({ error: `Failed to fetch from Zoho: ${res.status}` }, { status: 500 })
        }
        data = await res.json()
      }

      if (data.code !== 0 || !data.salesorder) {
        return NextResponse.json({ error: data.message || "Failed to load SO from Zoho" }, { status: 500 })
      }

      const doc = data.salesorder
      const dbDoc = await prisma.salesOrder.findFirst({ where: { zohoId: salesOrderId } })
      const currentItems = dbDoc ? (dbDoc.items as any || {}) : {}

      const updatedItems = {
        ...currentItems,
        salesOrderNumber: doc.salesorder_number || currentItems.salesOrderNumber,
        sub_total: parseFloat(doc.sub_total || 0),
        balance: doc.balance ?? 0,
        shippingCharge: parseFloat(doc.shipping_charge || 0),
        customer_id: doc.customer_id || currentItems.customer_id,
        customer_name: doc.customer_name || currentItems.customer_name,
        shipping_address: doc.shipping_address || currentItems.shipping_address,
        billing_address: doc.billing_address || currentItems.billing_address,
        salesperson: doc.salesperson_name ? doc.salesperson_name.toUpperCase().trim() : currentItems.salesperson,
        line_items: doc.line_items || currentItems.line_items || [],
        custom_fields: doc.custom_fields || currentItems.custom_fields || [],
        lastSyncedAt: new Date().toISOString(),
      }

      if (dbDoc) {
        await prisma.salesOrder.update({
          where: { id: dbDoc.id },
          data: {
            amount: parseFloat(doc.sub_total || doc.total || 0),
            status: doc.status || dbDoc.status,
            items: updatedItems
          }
        })

        if (dbDoc.accountId && doc.shipping_address && (doc.shipping_address.address || doc.shipping_address.city)) {
          await prisma.account.update({
            where: { id: dbDoc.accountId },
            data: {
              shippingStreet: doc.shipping_address.address || doc.shipping_address.street2 || undefined,
              shippingCity: doc.shipping_address.city || undefined,
              shippingState: doc.shipping_address.state || undefined,
              shippingZip: doc.shipping_address.zip || undefined,
              billingStreet: doc.billing_address?.address || undefined,
              billingCity: doc.billing_address?.city || undefined,
              billingState: doc.billing_address?.state || undefined,
              billingZip: doc.billing_address?.zip || undefined,
            }
          }).catch((e: any) => console.warn('Account address update error:', e.message))
        }
      }

      // Sync packages for this sales order to ensure package line items are cached
      if (doc.packages && Array.isArray(doc.packages)) {
        for (const p of doc.packages) {
          const zohoPkgId = p.package_id
          if (!zohoPkgId) continue

          try {
            // Check if package is already cached with items
            const cachedPkg = await prisma.package.findUnique({ where: { zohoId: zohoPkgId } })
            const hasItems = cachedPkg?.items && (cachedPkg.items as any).lineItems?.length > 0

            if (!hasItems) {
              console.log(`[syncSalesOrder] Fetching details for package ${zohoPkgId} (${p.package_number})`);
              const pkgUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/packages/${zohoPkgId}?organization_id=${ORG_ID}`
              const pkgRes = await fetch(pkgUrl, { signal: AbortSignal.timeout(15000),
                headers: { Authorization: `Zoho-oauthtoken ${token}` }
              })
              if (pkgRes.ok) {
                const pkgData = await pkgRes.json()
                const detail = pkgData.package
                if (detail) {
                  await prisma.package.upsert({
                    where: { zohoId: zohoPkgId },
                    update: {
                      packageNumber: detail.package_number || p.package_number || null,
                      salesOrderId: salesOrderId,
                      salesOrderNumber: doc.salesorder_number || null,
                      date: detail.date ? new Date(detail.date) : (p.date ? new Date(p.date) : new Date()),
                      status: detail.status || p.status || null,
                      carrier: detail.delivery_method || p.delivery_method || null,
                      trackingNumber: detail.tracking_number || p.tracking_number || null,
                      shippingCharge: detail.shipping_charge || 0,
                      items: detail.line_items ? { lineItems: financialZohoLineItems(detail.line_items).map(li => ({
                        line_item_id: li.line_item_id,
                        name: li.name,
                        sku: li.sku || '',
                        quantity: li.quantity
                      })) } : Prisma.JsonNull
                    },
                    create: {
                      zohoId: zohoPkgId,
                      packageNumber: detail.package_number || p.package_number || null,
                      salesOrderId: salesOrderId,
                      salesOrderNumber: doc.salesorder_number || null,
                      date: detail.date ? new Date(detail.date) : (p.date ? new Date(p.date) : new Date()),
                      status: detail.status || p.status || null,
                      carrier: detail.delivery_method || p.delivery_method || null,
                      trackingNumber: detail.tracking_number || p.tracking_number || null,
                      shippingCharge: detail.shipping_charge || 0,
                      items: detail.line_items ? { lineItems: financialZohoLineItems(detail.line_items).map(li => ({
                        line_item_id: li.line_item_id,
                        name: li.name,
                        sku: li.sku || '',
                        quantity: li.quantity
                      })) } : Prisma.JsonNull
                    }
                  })
                }
              }
            } else {
              // Even if it has items, make sure status/tracking/carrier match Zoho
              await prisma.package.update({
                where: { zohoId: zohoPkgId },
                data: {
                  status: p.status || cachedPkg.status || null,
                  carrier: p.delivery_method || cachedPkg.carrier || null,
                  trackingNumber: p.tracking_number || cachedPkg.trackingNumber || null
                }
              }).catch(() => {})
            }
          } catch (pkgErr: any) {
            console.warn(`[syncSalesOrder] Failed to sync package ${zohoPkgId}:`, pkgErr.message)
          }
        }
      }

      return NextResponse.json({ success: true })
    }

    if (!packageId) {
      return NextResponse.json({ error: "Missing packageId" }, { status: 400 })
    }

    const pkg = await prisma.package.findUnique({ where: { id: packageId } })
    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 })
    }

    if (action === "addTracking") {
      const updated = await prisma.package.update({
        where: { id: packageId },
        data: {
          carrier: carrier || pkg.carrier,
          trackingNumber: trackingNumber || pkg.trackingNumber,
          status: "shipped",
        },
      })
      return NextResponse.json({ success: true, package: updated })
    }

    if (action === "markShipped") {
      const updated = await prisma.package.update({
        where: { id: packageId },
        data: { status: "shipped" },
      })
      return NextResponse.json({ success: true, package: updated })
    }

    if (action === "markDelivered") {
      const updated = await prisma.package.update({
        where: { id: packageId },
        data: { status: "delivered" },
      })
      return NextResponse.json({ success: true, package: updated })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err: any) {
    console.error("shipping PUT error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
