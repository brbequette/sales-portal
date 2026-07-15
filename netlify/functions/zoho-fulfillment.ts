import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

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

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // Fetch the Sales Order to get customer ID and line item details
    const soRes = await fetch(`${baseUrl}/salesorders/${salesOrderId}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    const soData = await soRes.json()
    if (soData.code !== 0) throw new Error(`Zoho Books Error fetching SO: ${soData.message}`)
    const so = soData.salesorder

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

      const pkgRes = await fetch(`${baseUrl}/packages?organization_id=${ORG_ID}`, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      const pkgData = await pkgRes.json()
      if (pkgData.code !== 0) throw new Error(`Zoho Books Error creating package: ${pkgData.message}`)
      
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, packageId: pkgData.package.package_id })
      }

    } else if (action === "CreateDropshipment") {
      if (!vendorId) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: "Vendor ID required for dropshipments" }) }
      }

      // Map SO line items to PO line items
      const poLineItems = items.map((i: any) => {
        const soItem = so.line_items.find((li: any) => li.line_item_id === i.lineItemId)
        if (!soItem) throw new Error(`Line item ${i.lineItemId} not found on SO`)
        return {
          item_id: soItem.item_id,
          name: soItem.name,
          description: soItem.description,
          rate: soItem.rate, // Usually you'd fetch the vendor cost, but this relies on Zoho Books item defaults if rate is omitted, so let's pass cost if available, otherwise 0
          quantity: i.quantity,
          salesorder_item_id: soItem.line_item_id
        }
      })

      // Create a Purchase Order linked to the Sales Order
      const payload = {
        vendor_id: vendorId,
        delivery_customer_id: so.customer_id, // This marks it as a dropshipment
        salesorder_id: salesOrderId,
        date: new Date().toISOString().split('T')[0],
        line_items: poLineItems
      }

      const poRes = await fetch(`${baseUrl}/purchaseorders?organization_id=${ORG_ID}`, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      const poData = await poRes.json()
      if (poData.code !== 0) throw new Error(`Zoho Books Error creating Dropshipment (PO): ${poData.message}`)
      
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, purchaseOrderId: poData.purchaseorder.purchaseorder_id })
      }

    } else {
      throw new Error("Invalid action")
    }

  } catch (err: any) {
    console.error("zoho-fulfillment error:", err)
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
