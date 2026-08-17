import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, salesOrderId, vendorId, items, trackingNumber, shippingMethod } = body

    if (!action || !salesOrderId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing required fields" }) }
    }

    let token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // Fetch the Sales Order to get customer ID and line item details
    let soRes = await fetch(`${baseUrl}/salesorders/${salesOrderId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    let soData = await soRes.json()

    // Retry once with fresh token if auth or permission issue
    if (soData.code === 57 || soData.code === 5 || soData.message?.toLowerCase().includes("auth") || soData.message?.toLowerCase().includes("permission") || soData.message?.toLowerCase().includes("not authorized")) {
      console.log(`[zoho-fulfillment] Auth issue detected (${soData.message}). Force refreshing token...`);
      token = await getZohoAccessToken(true)
      soRes = await fetch(`${baseUrl}/salesorders/${salesOrderId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      soData = await soRes.json()
    }

    if (soData.code !== 0) throw new Error(`Zoho Books Error fetching SO: ${soData.message}`)
    const so = soData.salesorder

    if (action === "GetSalesOrder") {
      // Return the SO line items and shipping address for the Shipping Center
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          lineItems: so.line_items || [],
          shippingAddress: so.shipping_address || null,
          customerName: so.customer_name,
          salesorderNumber: so.salesorder_number,
          packages: so.packages || [],
        })
      }
    }

    if (action === "CreatePackage") {
      // Create a Package
      const payload = {
        salesorder_id: salesOrderId,
        date: new Date().toISOString().split('T')[0],
        line_items: items.map((i: any) => ({
          so_line_item_id: i.lineItemId,
          quantity: i.quantity
        }))
      }

      const pkgRes = await fetch(`${baseUrl}/packages?salesorder_id=${salesOrderId}&organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      const pkgData = await pkgRes.json()
      if (pkgData.code !== 0) throw new Error(`Zoho Books Error creating package: ${pkgData.message}`)
      
      const createdPkg = pkgData.package || {}
      try {
        const { prisma } = require("./lib/prisma")
        const pkgItems = items.map((i: any) => {
          const soLine = so.line_items?.find((li: any) => li.line_item_id === i.lineItemId)
          return {
            line_item_id: i.lineItemId,
            name: soLine?.name || soLine?.item_name || 'Item',
            sku: soLine?.sku || soLine?.sku_code || '',
            quantity: i.quantity
          }
        })

        await prisma.package.upsert({
          where: { zohoId: createdPkg.package_id },
          update: {
            packageNumber: createdPkg.package_number || null,
            salesOrderId: salesOrderId,
            salesOrderNumber: so.salesorder_number || null,
            date: createdPkg.date ? new Date(createdPkg.date) : new Date(),
            status: createdPkg.status || "not_shipped",
            items: { lineItems: pkgItems }
          },
          create: {
            zohoId: createdPkg.package_id,
            packageNumber: createdPkg.package_number || null,
            salesOrderId: salesOrderId,
            salesOrderNumber: so.salesorder_number || null,
            date: createdPkg.date ? new Date(createdPkg.date) : new Date(),
            status: createdPkg.status || "not_shipped",
            items: { lineItems: pkgItems }
          }
        })
      } catch (dbErr: any) {
        console.error("Failed to save created package to DB:", dbErr.message)
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, packageId: createdPkg.package_id })
      }

    } else if (action === "CreateDropshipment") {
      if (!vendorId) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: "Vendor ID required for dropshipments" }) }
      }

      const { prisma } = require("./lib/prisma")

      // Map SO line items to PO line items using their cost instead of retail price
      const poLineItems = await Promise.all(items.map(async (i: any) => {
        const soItem = so.line_items.find((li: any) => li.line_item_id === i.lineItemId)
        if (!soItem) throw new Error(`Line item ${i.lineItemId} not found on SO`)

        let purchaseRate = 0
        try {
          const dbProd = await prisma.product.findFirst({
            where: {
              OR: [
                { sku: soItem.sku },
                { name: soItem.name }
              ]
            }
          })
          if (dbProd) {
            try {
              const desc = JSON.parse(dbProd.description || "{}")
              purchaseRate = parseFloat(desc.cost || dbProd.price * 0.50) || 0
            } catch {
              purchaseRate = dbProd.price * 0.50
            }
          }
        } catch (dbErr) {
          console.warn("Could not fetch purchase rate from DB:", dbErr)
        }

        // Fetch live from Zoho live as fallback
        if (purchaseRate === 0 && soItem.item_id) {
          try {
            const itemRes = await fetch(`${baseUrl}/items/${soItem.item_id}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
              headers: { Authorization: `Zoho-oauthtoken ${token}` }
            })
            const itemData = await itemRes.json()
            if (itemData.code === 0 && itemData.item) {
              purchaseRate = parseFloat(itemData.item.purchase_rate || 0)
            }
          } catch (zohoErr) {
            console.warn("Could not fetch purchase rate from Zoho:", zohoErr)
          }
        }

        // Fallback to 50% of the sales rate
        if (purchaseRate === 0) {
          purchaseRate = parseFloat(soItem.rate) * 0.50
        }

        return {
          item_id: soItem.item_id,
          name: soItem.name,
          description: soItem.description,
          rate: purchaseRate,
          quantity: i.quantity,
          salesorder_item_id: soItem.line_item_id
        }
      }))

      // Create a Purchase Order linked to the Sales Order
      const payload: Record<string, any> = {
        vendor_id: vendorId,
        delivery_customer_id: so.customer_id,
        salesorder_id: salesOrderId,
        is_drop_shipment: true,
        date: new Date().toISOString().split('T')[0],
        line_items: poLineItems,
        reference_number: so.salesorder_number || ""
      }

      if (so.salesperson_id) {
        payload.zcrm_owner_id = so.salesperson_id
      }
      if (so.salesperson_name) {
        payload.custom_fields = [
          {
            api_name: "cf_sales_person",
            value: so.salesperson_name
          }
        ]
      }

      const poRes = await fetch(`${baseUrl}/purchaseorders?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      const poData = await poRes.json()
      if (poData.code !== 0) throw new Error(`Zoho Books Error creating Dropshipment (PO): ${poData.message}`)
      
      const createdPO = poData.purchaseorder || {}
      try {
        const { prisma } = require("./lib/prisma")
        await prisma.purchaseOrder.upsert({
          where: { zohoId: createdPO.purchaseorder_id },
          update: {
            vendorName: createdPO.vendor_name || null,
            date: createdPO.date ? new Date(createdPO.date) : new Date(),
            total: createdPO.total || 0,
            status: createdPO.status || "issued",
            salesOrderId: salesOrderId,
            salesOrderNumber: so.salesorder_number || null,
            isDropshipment: true,
            trackingNumber: trackingNumber || null,
          },
          create: {
            zohoId: createdPO.purchaseorder_id,
            vendorName: createdPO.vendor_name || null,
            date: createdPO.date ? new Date(createdPO.date) : new Date(),
            total: createdPO.total || 0,
            status: createdPO.status || "issued",
            salesOrderId: salesOrderId,
            salesOrderNumber: so.salesorder_number || null,
            isDropshipment: true,
            trackingNumber: trackingNumber || null,
          }
        })
      } catch (dbErr: any) {
        console.error("Failed to save created dropshipment to DB:", dbErr.message)
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, purchaseOrderId: createdPO.purchaseorder_id })
      }

    } else if (action === "DeleteDropshipment") {
      const { prisma } = require("./lib/prisma")
      const { purchaseOrderId } = body

      const targetPoIds: string[] = []
      if (purchaseOrderId) {
        targetPoIds.push(purchaseOrderId)
      } else if (so.purchaseorders && so.purchaseorders.length > 0) {
        so.purchaseorders.forEach((p: any) => targetPoIds.push(p.purchaseorder_id))
      }

      const deletedPoIds: string[] = []
      for (const poId of targetPoIds) {
        try {
          const deleteRes = await fetch(`${baseUrl}/purchaseorders/${poId}?organization_id=${ORG_ID}`, {
            method: "DELETE",
            headers: { Authorization: `Zoho-oauthtoken ${token}` }
          })
          const deleteData = await deleteRes.json()
          if (deleteData.code === 0 || deleteData.code === 5) {
            deletedPoIds.push(poId)
          } else {
            console.error(`Zoho Books delete PO error: ${deleteData.message}`)
          }
        } catch (poErr: any) {
          console.error(`Failed to delete PO ${poId} from Zoho:`, poErr.message)
        }
      }

      // Delete from local database
      try {
        if (purchaseOrderId) {
          await prisma.purchaseOrder.deleteMany({
            where: { zohoId: purchaseOrderId }
          })
        } else {
          const dbFilters: any[] = []
          if (salesOrderId) dbFilters.push({ salesOrderId })
          if (so.salesorder_number) dbFilters.push({ salesOrderNumber: so.salesorder_number })
          
          if (dbFilters.length > 0) {
            await prisma.purchaseOrder.deleteMany({
              where: {
                OR: dbFilters
              }
            })
          }
        }
      } catch (dbErr: any) {
        console.error("Failed to delete dropshipment from DB:", dbErr.message)
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, deletedPoIds })
      }

    } else {
      throw new Error("Invalid action")
    }

  } catch (err: any) {
    console.error("zoho-fulfillment error:", err)
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
