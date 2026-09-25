import { Handler } from "@netlify/functions"
import { createHash } from "node:crypto"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
const ZOHO_DC = process.env.ZOHO_DC || 'com';
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { financialZohoLineItems } from "../../src/lib/zoho-line-items"
import { isPioneerCalifornia, validateDirectDropshipEvidence } from "../../src/lib/dropship-policy"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const headers = { "Content-Type": "application/json" }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, headers)
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, salesOrderId, vendorId, items, trackingNumber, requestId } = body

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
          lineItems: financialZohoLineItems(so.line_items),
          shippingAddress: so.shipping_address || null,
          customerName: so.customer_name,
          salesorderNumber: so.salesorder_number,
          packages: so.packages || [],
        })
      }
    }

    if (action === "CreatePackage") {
      // Create a Package
      const financialItems = financialZohoLineItems(items)
      const payload = {
        salesorder_id: salesOrderId,
        date: new Date().toISOString().split('T')[0],
        line_items: financialItems.map(i => ({
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
        const pkgItems = financialItems.map(i => {
          const soLine = financialZohoLineItems(so.line_items).find((li: any) => li.line_item_id === i.lineItemId)
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
      if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestId)) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: "A stable UUID requestId is required for duplicate-safe dropshipment creation" }) }
      }

      const vendor = await prisma.vendor.findUnique({ where: { zohoId: vendorId } })
      if (!vendor || String(vendor.status || "").toLowerCase() !== "active") {
        return { statusCode: 422, body: JSON.stringify({ success: false, message: "The selected vendor is not an active authoritative local vendor." }) }
      }
      const vendorName = String(vendor.companyName || vendor.contactName || "").trim()
      const destinationState = String(so.shipping_address?.state || so.shipping_address?.state_code || "").trim().toUpperCase()
      if (isPioneerCalifornia(vendorName, destinationState)) {
        return { statusCode: 422, body: JSON.stringify({
          success: false,
          code: "PIONEER_CALIFORNIA_DIRECT_SHIP_BLOCKED",
          message: "Pioneer products for California accounts must be shipped to Titan first and cannot be direct-dropshipped.",
        }) }
      }

      // Resolve every selected line through exact Books item identity. No name,
      // stock, description, catalog-price percentage, or live-provider fallback
      // is acceptable financial or dropship evidence.
      const poLineItems = await Promise.all(financialZohoLineItems(items).map(async i => {
        const soItem = financialZohoLineItems(so.line_items).find(li => li.line_item_id === i.lineItemId)
        if (!soItem) throw new Error(`Line item ${i.lineItemId} not found on SO`)
        const booksItemId = String(soItem.item_id || "").trim()
        const dbProd = booksItemId ? await prisma.product.findUnique({ where: { booksItemId } }) : null
        if (!dbProd) throw new Error(`Line item ${i.lineItemId} is not mapped to an authoritative local product.`)
        const evidence = validateDirectDropshipEvidence(dbProd, vendorId)
        if (!evidence.allowed) throw new Error(evidence.reason)

        return {
          item_id: soItem.item_id,
          name: soItem.name,
          description: soItem.description,
          rate: evidence.unitCost,
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

      // Do not copy the sales-order display name into the purchase-order
      // `cf_sales_person` dropdown. Books validates dropdowns against their
      // configured option values, and a valid sales-order salesperson name is
      // not necessarily a valid purchase-order dropdown option. Ownership is
      // carried by the provider identifier above; an invalid descriptive
      // custom field must never block an otherwise valid dropship PO.

      const operationKey = `books:purchaseorders:dropship:create:${requestId}`
      const requestFingerprint = createHash("sha256").update(JSON.stringify({ salesOrderId, vendorId, line_items: poLineItems })).digest("hex")
      const operation = await prisma.providerWriteOperation.upsert({
        where: { operationKey }, update: {},
        create: { operationKey, provider: "ZOHO_BOOKS", entityType: "PURCHASE_ORDER", entityId: salesOrderId, operation: "CREATE_DROPSHIPMENT", requestFingerprint },
      })
      if (operation.requestFingerprint !== requestFingerprint) {
        return { statusCode: 409, body: JSON.stringify({ success: false, message: "requestId was already used with different dropshipment data" }) }
      }
      if (operation.state === "SUCCEEDED") {
        const priorIds = operation.providerRecordIds as { purchaseOrderId?: string } | null
        return { statusCode: 200, body: JSON.stringify({ success: true, purchaseOrderId: priorIds?.purchaseOrderId || null, alreadyProcessed: true }) }
      }
      if (operation.state === "SYNCING" || operation.state === "AMBIGUOUS") {
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: operation.state, message: "This dropshipment is in progress or requires reconciliation; it was not resubmitted." }) }
      }
      if (operation.state === "FAILED") {
        return { statusCode: 422, body: JSON.stringify({ success: false, providerState: "FAILED", code: operation.providerCode, message: operation.providerMessage || "The prior provider attempt failed and was not retried." }) }
      }
      const claimed = await prisma.providerWriteOperation.updateMany({ where: { operationKey, state: "PENDING" }, data: { state: "SYNCING", attemptCount: { increment: 1 }, lastAttemptAt: new Date() } })
      if (claimed.count !== 1) return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "SYNCING", message: "Dropshipment creation is already in progress." }) }

      let poRes: Response
      let poData: any
      try {
        poRes = await fetch(`${baseUrl}/purchaseorders?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
        poData = await poRes.json().catch(() => null)
      } catch (providerError) {
        const message = providerError instanceof Error ? providerError.message : "Unknown Books submission error"
        await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", lastError: message, providerMessage: "Submission outcome is unknown; exact reconciliation is required before retry." } })
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "AMBIGUOUS", message: "Books submission outcome is unknown and was not retried." }) }
      }
      if (!poRes.ok || poData?.code !== 0) {
        const code = String(poData?.code ?? `HTTP_${poRes.status}`)
        const message = String(poData?.message || "Zoho Books rejected the dropshipment.")
        await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "FAILED", providerCode: code, providerMessage: message, lastError: message, completedAt: new Date() } })
        return { statusCode: 422, body: JSON.stringify({ success: false, providerState: "FAILED", code, message }) }
      }
      
      const createdPO = poData.purchaseorder || {}
      if (!createdPO.purchaseorder_id) {
        await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", providerCode: String(poData.code), providerMessage: "Provider accepted the request without returning a purchase-order ID." } })
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "AMBIGUOUS", message: "Books accepted the request without a purchase-order ID; reconciliation is required." }) }
      }
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", providerRecordIds: { purchaseOrderId: createdPO.purchaseorder_id }, providerCode: String(poData.code), providerMessage: String(poData.message || "success"), lastError: "Provider accepted; local persistence is pending." } })
      try {
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
        await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "SUCCEEDED", providerRecordIds: { purchaseOrderId: createdPO.purchaseorder_id }, completedAt: new Date(), lastError: null } })
      } catch (dbErr: any) {
        console.error("Failed to save created dropshipment to DB:", dbErr.message)
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "AMBIGUOUS", purchaseOrderId: createdPO.purchaseorder_id, message: "Books accepted the purchase order, but local persistence requires reconciliation." }) }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, purchaseOrderId: createdPO.purchaseorder_id })
      }

    } else if (action === "DeleteDropshipment") {
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
          if (so.salesorder_number) {
            dbFilters.push({ salesOrderNumber: so.salesorder_number })
            dbFilters.push({ referenceNumber: so.salesorder_number })
          }
          
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
