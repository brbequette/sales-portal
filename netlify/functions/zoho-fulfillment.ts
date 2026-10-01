import { Handler } from "@netlify/functions"
import { createHash } from "node:crypto"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
const ZOHO_DC = process.env.ZOHO_DC || 'com';
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { financialZohoLineItems } from "../../src/lib/zoho-line-items"
import { isPioneerCalifornia, validateDirectDropshipEvidence } from "../../src/lib/dropship-policy"
import { isAdministratorRole } from "../../src/lib/roles"
import { prisma } from "./lib/prisma"

export const VALID_PO_SALES_PERSONS = [
  "MONTGOMERY MORGAN",
  "ASHLEY ROWLEY",
  "ROSS HAISLER",
  "RICHARD GRIFFIN",
  "BEN BEQUETTE",
  " PAUL GENCUSKI",
  "PAUL GENCUSKI",
  "BRIAN BASILIERE",
  "ROBERT REDMAN",
  "DANIEL CHARLES",
  "FRANKIE WERHOFNIK",
  "MIKE EDWARDS",
  "BOBBY SALYERS",
]

export function getAuthoritativePoSalesperson(name: string | null | undefined): string | null {
  if (!name) return null
  const cleaned = name.trim().toUpperCase()
  const exact = VALID_PO_SALES_PERSONS.find(opt => opt.trim().toUpperCase() === cleaned)
  if (exact) return exact
  const partial = VALID_PO_SALES_PERSONS.find(opt => {
    const o = opt.trim().toUpperCase()
    return o.includes(cleaned) || cleaned.includes(o)
  })
  return partial || null
}

export const handler: Handler = async (event) => {
  const headers = { "Content-Type": "application/json" }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  let sessionUser: Awaited<ReturnType<typeof authenticateFunction>>
  try {
    sessionUser = await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, headers)
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, salesOrderId, vendorId, items, trackingNumber, requestId, purchaseOrderId } = body

    if (!action || !salesOrderId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing required fields" }) }
    }

    if (action === "GetPurchaseOrderEmailStatus") {
      if (!isAdministratorRole(sessionUser.role)) {
        return { statusCode: 403, body: JSON.stringify({ success: false, message: "Administrator access is required to inspect purchase-order email status." }) }
      }
      if (typeof purchaseOrderId !== "string" || !purchaseOrderId.trim()) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: "Purchase order ID is required." }) }
      }

      const operation = await prisma.providerWriteOperation.findFirst({
        where: { operation: "EMAIL_PURCHASE_ORDER", entityType: "PURCHASE_ORDER", entityId: purchaseOrderId },
        orderBy: { createdAt: "desc" },
      })
      const operationRequestId = operation?.operationKey.startsWith("books:purchaseorders:email:")
        ? operation.operationKey.slice("books:purchaseorders:email:".length)
        : null
      return {
        statusCode: 200,
        headers: { ...headers, "Cache-Control": "no-store" },
        body: JSON.stringify({
          success: true,
          status: operation?.state || "NONE",
          requestId: operationRequestId,
          attemptCount: operation?.attemptCount || 0,
          providerCode: operation?.providerCode || null,
          providerMessage: operation?.providerMessage || null,
          lastError: operation?.lastError || null,
          completedAt: operation?.completedAt || null,
        }),
      }
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
      // Enrich line items with product vendor and cost details for vendor-separated dropshipping
      const lineItems = await Promise.all(
        financialZohoLineItems(so.line_items).map(async (li: any) => {
          const booksItemId = String(li.item_id || "").trim()
          const sku = String(li.sku || li.name || "").trim()
          const dbProd = booksItemId
            ? await prisma.product.findUnique({
                where: { booksItemId },
                select: { vendor: true, canDropship: true, unitCost: true, sku: true, costQuality: true },
              })
            : sku
            ? await prisma.product.findFirst({
                where: { sku },
                select: { vendor: true, canDropship: true, unitCost: true, sku: true, costQuality: true },
              })
            : null

          let suggestedVendor: any = null
          if (dbProd?.vendor) {
            const v = await prisma.vendor.findFirst({
              where: {
                OR: [
                  { zohoId: dbProd.vendor },
                  { id: dbProd.vendor },
                  { companyName: dbProd.vendor },
                  { contactName: dbProd.vendor },
                ],
              },
              select: { zohoId: true, companyName: true, contactName: true },
            })
            if (v) {
              suggestedVendor = {
                vendorId: v.zohoId,
                vendorName: v.contactName || v.companyName || "Unnamed Vendor",
                companyName: v.companyName,
              }
            } else {
              suggestedVendor = {
                vendorId: dbProd.vendor,
                vendorName: dbProd.vendor,
              }
            }
          }

          return {
            ...li,
            suggestedVendorId: suggestedVendor?.vendorId || null,
            suggestedVendorName: suggestedVendor?.vendorName || null,
            canDropship: dbProd?.canDropship ?? null,
            unitCost: dbProd?.unitCost ?? null,
            costQuality: dbProd?.costQuality ?? null,
          }
        })
      )

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          lineItems,
          shippingAddress: so.shipping_address || null,
          customerName: so.customer_name,
          salesorderNumber: so.salesorder_number,
          packages: so.packages || [],
          status: so.status || "draft",
        })
      }
    }

    if (action === "EmailPurchaseOrder") {
      if (!isAdministratorRole(sessionUser.role)) {
        return { statusCode: 403, body: JSON.stringify({ success: false, message: "Administrator access is required to email a purchase order." }) }
      }
      if (typeof purchaseOrderId !== "string" || !purchaseOrderId.trim()) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: "Purchase order ID is required." }) }
      }
      if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestId)) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: "A stable UUID requestId is required for duplicate-safe purchase-order email." }) }
      }

      const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: "A valid recipient email is required." }) }
      }

      const [localPurchaseOrder, localSalesOrder] = await Promise.all([
        prisma.purchaseOrder.findUnique({ where: { zohoId: purchaseOrderId } }),
        prisma.salesOrder.findUnique({
          where: { zohoId: salesOrderId },
          include: { account: { include: { contacts: true } } },
        }),
      ])
      if (!localPurchaseOrder || !localPurchaseOrder.isDropshipment || localPurchaseOrder.salesOrderId !== salesOrderId) {
        return { statusCode: 422, body: JSON.stringify({ success: false, message: "The purchase order is not the exact locally linked dropship order for this sales order." }) }
      }
      if (!localSalesOrder?.account) {
        return { statusCode: 422, body: JSON.stringify({ success: false, message: "The sales order is not linked to a local account." }) }
      }
      const approvedContact = localSalesOrder.account.contacts.find(contact =>
        String(contact.email || "").trim().toLowerCase() === recipientEmail
      )
      if (!approvedContact) {
        return { statusCode: 422, body: JSON.stringify({ success: false, message: "Recipient must exactly match a contact on the linked account; vendor and arbitrary recipients are blocked." }) }
      }

      const poReadRes = await fetch(`${baseUrl}/purchaseorders/${purchaseOrderId}?organization_id=${ORG_ID}`, {
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      })
      const poReadData = await poReadRes.json().catch(() => null)
      if (!poReadRes.ok || poReadData?.code !== 0 || poReadData?.purchaseorder?.purchaseorder_id !== purchaseOrderId) {
        return { statusCode: 422, body: JSON.stringify({ success: false, message: "The exact purchase order could not be verified in Zoho Books." }) }
      }
      const providerPurchaseOrder = poReadData.purchaseorder
      const purchaseOrderNumber = String(providerPurchaseOrder.purchaseorder_number || "").trim()
      const salesOrderNumber = String(so.salesorder_number || localPurchaseOrder.salesOrderNumber || "").trim()
      const subject = `TEST ONLY - Purchase Order ${purchaseOrderNumber || purchaseOrderId}`
      const emailBody = `Internal test purchase order${purchaseOrderNumber ? ` ${purchaseOrderNumber}` : ""}${salesOrderNumber ? ` for Sales Order ${salesOrderNumber}` : ""}. Do not forward to the vendor or fulfill this order.`
      const requestFingerprint = createHash("sha256").update(JSON.stringify({ salesOrderId, purchaseOrderId, recipientEmail, subject, emailBody })).digest("hex")
      const operationKey = `books:purchaseorders:email:${requestId}`
      const operation = await prisma.providerWriteOperation.upsert({
        where: { operationKey },
        update: {},
        create: {
          operationKey,
          provider: "ZOHO_BOOKS",
          entityType: "PURCHASE_ORDER",
          entityId: purchaseOrderId,
          operation: "EMAIL_PURCHASE_ORDER",
          requestFingerprint,
          providerRecordIds: { purchaseOrderId, recipientContactId: approvedContact.id, recipientEmail },
        },
      })
      if (operation.requestFingerprint !== requestFingerprint) {
        return { statusCode: 409, body: JSON.stringify({ success: false, message: "requestId was already used with different purchase-order email data." }) }
      }
      if (operation.state === "SUCCEEDED") {
        return { statusCode: 200, body: JSON.stringify({ success: true, alreadyProcessed: true, purchaseOrderId, recipientEmail, providerMessage: operation.providerMessage }) }
      }
      if (operation.state === "SYNCING" || operation.state === "AMBIGUOUS") {
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: operation.state, message: "This purchase-order email is in progress or requires reconciliation; it was not resubmitted." }) }
      }
      if (operation.state === "FAILED") {
        return { statusCode: 422, body: JSON.stringify({ success: false, providerState: "FAILED", code: operation.providerCode, message: operation.providerMessage || "The prior email attempt failed and was not retried." }) }
      }
      const claimed = await prisma.providerWriteOperation.updateMany({
        where: { operationKey, state: "PENDING" },
        data: { state: "SYNCING", attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
      })
      if (claimed.count !== 1) {
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "SYNCING", message: "Purchase-order email is already in progress." }) }
      }

      let emailRes: Response
      let emailData: any
      try {
        emailRes = await fetch(`${baseUrl}/purchaseorders/${purchaseOrderId}/email?organization_id=${ORG_ID}&send_attachment=true`, {
          signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ to_mail_ids: [recipientEmail], cc_mail_ids: [], bcc_mail_ids: [], subject, body: emailBody }),
        })
        emailData = await emailRes.json().catch(() => null)
      } catch (providerError) {
        const message = providerError instanceof Error ? providerError.message : "Unknown Books email submission error"
        await prisma.providerWriteOperation.update({
          where: { operationKey },
          data: { state: "AMBIGUOUS", lastError: message, providerMessage: "Email submission outcome is unknown; exact reconciliation is required before retry." },
        })
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "AMBIGUOUS", message: "Books email outcome is unknown and was not retried." }) }
      }
      if (!emailRes.ok || emailData?.code !== 0) {
        const code = String(emailData?.code ?? `HTTP_${emailRes.status}`)
        const message = String(emailData?.message || "Zoho Books rejected the purchase-order email.")
        await prisma.providerWriteOperation.update({
          where: { operationKey },
          data: { state: "FAILED", providerCode: code, providerMessage: message, lastError: message, completedAt: new Date() },
        })
        return { statusCode: 422, body: JSON.stringify({ success: false, providerState: "FAILED", code, message }) }
      }

      await prisma.providerWriteOperation.update({
        where: { operationKey },
        data: {
          state: "SUCCEEDED",
          providerCode: String(emailData.code),
          providerMessage: String(emailData.message || "Purchase order email accepted."),
          providerRecordIds: { purchaseOrderId, recipientContactId: approvedContact.id },
          completedAt: new Date(),
          lastError: null,
        },
      })
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, purchaseOrderId, purchaseOrderNumber, recipientEmail, providerCode: emailData.code, providerMessage: emailData.message }),
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
        if (!dbProd) {
          throw new Error(`Product ${soItem.name || soItem.item_id} is not mapped in the local catalog.`)
        }
        const altVendorIds = [vendor.id, vendor.zohoId, vendorName, vendor.companyName, vendor.contactName].filter(Boolean) as string[]
        const isVendorMatch = dbProd.vendor === vendorId || altVendorIds.includes(dbProd.vendor || '')
        if (isVendorMatch && Number(dbProd.unitCost) > 0) {
          if (dbProd.vendor !== vendorId || dbProd.canDropship !== true) {
            await prisma.product.update({ where: { id: dbProd.id }, data: { vendor: vendorId, canDropship: true } })
            dbProd.vendor = vendorId
            dbProd.canDropship = true
          }
        }
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

      // Fetch vendor contact persons so recipient email is pre-selected in Zoho Books
      let vendorContactPersons: string[] = []
      try {
        const vendorContactRes = await fetch(`${baseUrl}/contacts/${vendorId}?organization_id=${ORG_ID}`, {
          signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
        })
        const vendorContactData = await vendorContactRes.json().catch(() => null)
        if (vendorContactData?.contact?.contact_persons?.length) {
          const primary = vendorContactData.contact.contact_persons.find((cp: any) => cp.is_primary_contact) || vendorContactData.contact.contact_persons[0]
          if (primary?.contact_person_id) {
            vendorContactPersons.push(String(primary.contact_person_id))
          }
        }
      } catch (vcErr: any) {
        console.warn("Failed to fetch vendor contact persons for dropship PO:", vcErr?.message)
      }

      // Match sales rep from Sales Order to authoritative Books PO cf_sales_person dropdown
      const matchedSalesPerson = getAuthoritativePoSalesperson(so.salesperson_name)
      const poCustomFields: Array<{ customfield_id: string; api_name: string; value: string }> = []
      if (matchedSalesPerson) {
        poCustomFields.push({
          customfield_id: "1254360000020368537",
          api_name: "cf_sales_person",
          value: matchedSalesPerson,
        })
      }

      // Resolve CRM Owner ID from local User record or fallback to salesperson ID
      let crmOwnerId: string | null = null
      if (so.salesperson_name) {
        try {
          const repUser = await prisma.user.findFirst({
            where: {
              OR: [
                { name: { equals: so.salesperson_name, mode: "insensitive" } },
                { email: { startsWith: so.salesperson_name.split(' ')[0], mode: "insensitive" } },
              ],
            },
            select: { zohoId: true },
          })
          if (repUser?.zohoId) {
            crmOwnerId = repUser.zohoId
          }
        } catch (uErr: any) {
          console.warn("Failed to lookup CRM owner user:", uErr?.message)
        }
      }
      if (!crmOwnerId && so.salesperson_id) {
        crmOwnerId = so.salesperson_id
      }

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

      if (crmOwnerId) {
        payload.zcrm_owner_id = crmOwnerId
      }
      if (so.salesperson_id) {
        payload.salesperson_id = so.salesperson_id
      }
      if (vendorContactPersons.length > 0) {
        payload.contact_persons = vendorContactPersons
      }
      if (poCustomFields.length > 0) {
        payload.custom_fields = poCustomFields
      }

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

      // Ensure Sales Order is confirmed in Zoho Books before dropship PO creation
      if (so.status === "draft") {
        try {
          await fetch(`${baseUrl}/salesorders/${salesOrderId}/status/confirmed?organization_id=${ORG_ID}`, {
            method: "POST",
            headers: { Authorization: `Zoho-oauthtoken ${token}` }
          })
        } catch (e: any) {
          console.warn("Auto-confirm draft SO warning:", e?.message)
        }
      }

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
        if (String(poData?.message || "").toLowerCase().includes("confirmed sales order")) {
          try {
            await fetch(`${baseUrl}/salesorders/${salesOrderId}/status/confirmed?organization_id=${ORG_ID}`, {
              method: "POST",
              headers: { Authorization: `Zoho-oauthtoken ${token}` }
            })
            poRes = await fetch(`${baseUrl}/purchaseorders?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
              method: "POST",
              headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            })
            poData = await poRes.json().catch(() => null)
          } catch (retryErr: any) {
            console.error("Retry dropship after confirmation failed:", retryErr?.message)
          }
        }
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
