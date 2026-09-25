import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
import { syncStoredLineItems } from "../../src/lib/sync-engine"
import { internalHandler as processQuoteCosts } from "./process-quote-costs"
import { internalHandler as processSalesOrderCosts } from "./process-salesorder-costs"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { isAdminRole } from "../../src/lib/roles"
import { ensureBooksCustomer } from "../../src/lib/zoho-books-customer"
import { createHash } from "node:crypto"
import { classifyZohoLineItem, financialZohoLineItems, orderedZohoLineItems, structuralZohoLineItemPayload } from "../../src/lib/zoho-line-items"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event, context) => {
  const headers = { "Content-Type": "application/json" }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  let authenticatedUser
  try {
    authenticatedUser = await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, headers)
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { accountId, type, amount, items, lineItems, discountTotal, processingNotes, assigneeId, dealId, requestId } = body
    const userId = authenticatedUser.dbId
    const userEmail = authenticatedUser.email

    if (!accountId || !type || amount === undefined || !requestId || typeof requestId !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing required fields, including requestId" })
      }
    }

    // Resolve author for Salesperson mapping
    let author = null
    if (userId) {
      author = await prisma.user.findUnique({ where: { id: userId } })
    }
    if (!author && userEmail) {
      author = await prisma.user.findUnique({ where: { email: userEmail } })
    }

    // Let's resolve the actual db account and the zoho customer id
    const account = await prisma.account.findFirst({
      where: {
        OR: [
          { id: accountId },
          { zohoId: accountId }
        ]
      }
    })

    if (!account) {
      throw new Error("Account not found")
    }

    const fulfillmentPlan: Array<Record<string, any>> = (Array.isArray(lineItems) ? lineItems : []).map((line: any) => ({
      itemId: line.itemId || null,
      sku: String(line.sku || ''),
      name: String(line.name || ''),
      quantity: Math.max(1, Number(line.quantity) || 1),
      method: String(line.fulfillmentMethod || (String(line.description || '').includes('PROMO FREE') ? 'WAREHOUSE' : 'UNASSIGNED')),
      vendor: line.vendor ? String(line.vendor) : null,
      promotional: String(line.description || '').includes('PROMO FREE'),
      giftReleaseRule: String(line.giftReleaseRule || 'PAID_IN_FULL'),
      selectedGiftSize: line.selectedGiftSize ? String(line.selectedGiftSize) : null,
      selectedBundleOption: line.selectedBundleOption || null,
    }))
    const invalidFulfillment = fulfillmentPlan.find((line: any) => !line.promotional && !['DROPSHIP', 'WAREHOUSE', 'PICKUP'].includes(line.method))
    if (invalidFulfillment) return { statusCode: 422, body: JSON.stringify({ success: false, message: `Fulfillment is required for ${invalidFulfillment.sku || invalidFulfillment.name}.` }) }
    for (const line of fulfillmentPlan.filter((item: any) => item.method === 'DROPSHIP')) {
      const product = await prisma.product.findFirst({ where: line.itemId ? { booksItemId: line.itemId } : { sku: line.sku }, select: { canDropship: true, vendor: true } })
      if (product?.canDropship !== true) return { statusCode: 422, body: JSON.stringify({ success: false, message: `${line.sku || line.name} is not authoritatively approved for dropship fulfillment.` }) }
      line.vendor = product.vendor || line.vendor
    }
    const expandedLineItems = (Array.isArray(lineItems) ? lineItems : []).map((line: any) => ({ ...line }))
    for (const line of fulfillmentPlan.filter((item: any) => item.promotional)) {
      const bundleProduct = line.itemId ? await prisma.product.findFirst({ where: { booksItemId: line.itemId }, select: { attributes: true } }) : null
      const attributes = bundleProduct?.attributes && typeof bundleProduct.attributes === 'object' && !Array.isArray(bundleProduct.attributes) ? bundleProduct.attributes as Record<string, any> : {}
      const bundleComponents = Array.isArray(attributes.giftBundleComponents) ? attributes.giftBundleComponents : []
      const variableTags = bundleComponents.filter((component: any) => component?.mode === 'VARIABLE_TAG').map((component: any) => String(component.optionTag || '').toLowerCase())
      if (variableTags.length && !line.selectedBundleOption?.productId) return { statusCode: 422, body: JSON.stringify({ success: false, message: `${line.sku || line.name} requires an exact bundle option.` }) }
      let selectedOption: any = null
      if (line.selectedBundleOption?.productId) {
        const option = await prisma.product.findUnique({ where: { id: String(line.selectedBundleOption.productId) } })
        const optionAttributes = option?.attributes && typeof option.attributes === 'object' && !Array.isArray(option.attributes) ? option.attributes as Record<string, any> : {}
        const optionTags = Array.isArray(optionAttributes.giftTags) ? optionAttributes.giftTags.map((tag: unknown) => String(tag).toLowerCase()) : []
        if (!option?.booksItemId || (!(Number(option.unitCost) > 0) && option.costQuality !== 'VERIFIED_ZERO') || !variableTags.some((tag: string) => optionTags.includes(tag))) return { statusCode: 422, body: JSON.stringify({ success: false, message: 'The selected gift bundle option is not an authoritative configured variant.' }) }
        selectedOption = { productId: option.id, booksItemId: option.booksItemId, sku: option.sku, name: option.name, size: line.selectedGiftSize, cost: option.unitCost, quantity: Math.max(1, Number(line.selectedBundleOption.quantity) || 1) }
        line.selectedBundleOption = selectedOption
      }
      const fixedIds = bundleComponents.filter((component: any) => component?.mode === 'FIXED').map((component: any) => String(component.productId || '')).filter(Boolean)
      const fixedProducts = fixedIds.length ? await prisma.product.findMany({ where: { id: { in: fixedIds } } }) : []
      const fixedById = new Map(fixedProducts.map(product => [product.id, product]))
      for (const component of bundleComponents) {
        const componentQuantity = Math.max(1, Number(component?.quantity) || 1)
        const product = component?.mode === 'VARIABLE_TAG' ? selectedOption : fixedById.get(String(component?.productId || ''))
        if (!product?.booksItemId || (!(Number(product.cost ?? product.unitCost) > 0) && product.costQuality !== 'VERIFIED_ZERO')) return { statusCode: 422, body: JSON.stringify({ success: false, message: 'A configured gift bundle component is no longer authoritative.' }) }
        expandedLineItems.push({
          itemId: product.booksItemId,
          name: product.name,
          sku: product.sku,
          rate: 0,
          discount: 0,
          quantity: line.quantity * componentQuantity,
          description: `Bundle component of ${line.name || line.sku} (PROMO FREE)`,
          fulfillmentMethod: 'WAREHOUSE',
          vendor: product.vendor || null,
          giftReleaseRule: line.giftReleaseRule,
          selectedGiftSize: component?.mode === 'VARIABLE_TAG' ? line.selectedGiftSize : null,
        })
        fulfillmentPlan.push({
          itemId: product.booksItemId,
          sku: product.sku,
          name: product.name,
          quantity: line.quantity * componentQuantity,
          method: 'WAREHOUSE',
          vendor: product.vendor || null,
          promotional: true,
          giftReleaseRule: line.giftReleaseRule,
          selectedGiftSize: component?.mode === 'VARIABLE_TAG' ? line.selectedGiftSize : null,
          selectedBundleOption: null,
          bundleParentSku: line.sku,
        })
      }
    }

    const administrator = isAdminRole(authenticatedUser.role)
    if (!administrator && (!userId || account.ownerId !== userId)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, message: "Forbidden: This account belongs to another representative" })
      }
    }

    const dbAccountId = account.id
    if (!['Quote', 'SalesOrder'].includes(type)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Invalid type" }) }
    }

    const localDevelopmentTransaction = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOCAL_TRANSACTIONS === 'true'
    let token = ''
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    let booksRefId: string | null = null
    let booksDocNumber: string | null = null
    let zohoDoc: any = null
    let providerOperationKey: string | null = null

    if (localDevelopmentTransaction) {
      const localSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      booksRefId = `dev-${type.toLowerCase()}-${localSuffix}`
      booksDocNumber = type === 'Quote' ? `DEV-EST-${localSuffix}` : `DEV-SO-${localSuffix}`
      zohoDoc = { line_items: expandedLineItems, localDevelopmentTransaction: true }
    } else {
      token = await getZohoAccessToken()
      const booksCustomer = await ensureBooksCustomer(account.id)
      if (booksCustomer.state !== 'SUCCEEDED' || !booksCustomer.booksCustomerId) {
        return { statusCode: booksCustomer.state === 'FAILED' ? 422 : 202, body: JSON.stringify({ success: false, providerState: booksCustomer.state, message: booksCustomer.message || 'Books customer is not ready.' }) }
      }
      const booksContactId = booksCustomer.booksCustomerId

      const payload = {
        customer_id: booksContactId,
        salesperson_name: author?.name || "System Admin",
        line_items: financialZohoLineItems(expandedLineItems).map(li => ({ item_id: li.itemId || undefined, name: li.name, description: li.description, rate: li.rate, quantity: li.quantity, discount: li.discount || 0 })),
        discount_type: "item_level",
        is_discount_before_tax: true,
        notes: "Created via Sales Portal POS"
      }

      const endpoint = type === 'Quote' ? 'estimates' : 'salesorders'
      const operationKey = `books:${endpoint}:create:${requestId}`
      providerOperationKey = operationKey
      const requestFingerprint = createHash("sha256").update(JSON.stringify({ accountId: account.id, type, payload, fulfillmentPlan })).digest("hex")
      const operation = await prisma.providerWriteOperation.upsert({
        where: { operationKey }, update: {},
        create: { operationKey, provider: "ZOHO_BOOKS", entityType: type, entityId: account.id, operation: "CREATE_DOCUMENT", requestFingerprint },
      })
      if (operation.requestFingerprint !== requestFingerprint) {
        return { statusCode: 409, body: JSON.stringify({ success: false, message: "requestId was already used with different transaction data" }) }
      }
      if (operation.state === "SUCCEEDED") {
        const ids = operation.providerRecordIds as { booksRefId?: string } | null
        const prior = ids?.booksRefId
          ? await (type === "Quote" ? prisma.quote.findFirst({ where: { zohoId: ids.booksRefId } }) : prisma.salesOrder.findFirst({ where: { zohoId: ids.booksRefId } }))
          : null
        return { statusCode: 200, body: JSON.stringify({ success: true, transaction: prior, booksRefId: ids?.booksRefId || null, documentNumber: (ids as { booksDocNumber?: string } | null)?.booksDocNumber || null, alreadyProcessed: true }) }
      }
      if (operation.state === "AMBIGUOUS" || operation.state === "SYNCING") {
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: operation.state, message: "This transaction is already in progress or requires reconciliation; it was not resubmitted." }) }
      }
      if (operation.state === "FAILED") {
        return { statusCode: 422, body: JSON.stringify({ success: false, providerState: "FAILED", code: operation.providerCode, message: operation.providerMessage || "The prior provider attempt failed and was not retried." }) }
      }
      const claimed = await prisma.providerWriteOperation.updateMany({ where: { operationKey, state: "PENDING" }, data: { state: "SYNCING", attemptCount: { increment: 1 }, lastAttemptAt: new Date() } })
      if (claimed.count !== 1) return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "SYNCING", message: "Transaction creation is already in progress." }) }
      let res: Response
      let data: any
      try {
        res = await fetch(`${baseUrl}/${endpoint}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
        data = await res.json().catch(() => null)
      } catch (providerError) {
        const message = providerError instanceof Error ? providerError.message : "Unknown Books submission error"
        await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", lastError: message, providerMessage: "Submission outcome is unknown; reconciliation is required before retry." } })
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "AMBIGUOUS", message: "Books submission outcome is unknown and was not retried." }) }
      }
      if (!res.ok || data?.code !== 0) {
        const code = String(data?.code ?? `HTTP_${res.status}`)
        const message = String(data?.message || "Zoho Books rejected the transaction.")
        await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "FAILED", providerCode: code, providerMessage: message, lastError: message, completedAt: new Date() } })
        return { statusCode: 422, body: JSON.stringify({ success: false, providerState: "FAILED", code, message }) }
      }
      const remoteDoc = type === 'Quote' ? data.estimate : data.salesorder
      booksRefId = type === 'Quote' ? remoteDoc?.estimate_id : remoteDoc?.salesorder_id
      booksDocNumber = type === 'Quote' ? remoteDoc?.estimate_number : remoteDoc?.salesorder_number
      zohoDoc = remoteDoc
      if (!booksRefId) {
        await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", providerCode: String(data.code), providerMessage: "Provider accepted the request without returning a document ID." } })
        return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "AMBIGUOUS", message: "Books accepted the request without a document ID; reconciliation is required." }) }
      }
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", providerRecordIds: { booksRefId, booksDocNumber }, providerCode: String(data.code), providerMessage: String(data.message || "success"), lastError: "Provider accepted; local persistence is pending." } })
    }

    // Resolve full line items array
    const responseLineItems = zohoDoc?.line_items || expandedLineItems
    const resolvedLineItems = orderedZohoLineItems(responseLineItems).map(li => {
      if (classifyZohoLineItem(li)?.structural) return structuralZohoLineItemPayload(li)
      return {
        name: li.name,
        sku: String(li.sku || li.description || '').replace("SKU: ", "").replace(" (PROMO FREE)", ""),
        rate: parseFloat(String(li.rate || 0)),
        quantity: parseInt(String(li.quantity || 0)),
        description: li.description || "",
        line_item_category: li.line_item_category,
        item_order: li.item_order,
      }
    }).filter((lineItem): lineItem is Exclude<typeof lineItem, null> => lineItem !== null)

    // Now save to Prisma database
    let transaction: any;
    if (type === "Quote") {
      const itemsPayload = {
        estimateNumber: booksDocNumber || "EST-PENDING",
        sub_total: amount,
        balance: amount,
        shippingCharge: 0,
        customer_name: account.name,
        salesperson: author?.name ? author.name.toUpperCase().trim() : "SYSTEM ADMIN",
        line_items: resolvedLineItems,
        fulfillmentPlan,
        custom_fields: [],
        lastSyncedAt: new Date().toISOString(),
      }
      transaction = await prisma.quote.create({
        data: {
          zohoId: booksRefId,
          accountId: dbAccountId,
          amount,
          items: itemsPayload,
          status: "Draft",
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          dealId: dealId || undefined,
          lastSyncedAt: new Date(),
          appModifiedAt: new Date(),
          lastZohoModifiedTime: zohoDoc?.last_modified_time ? new Date(zohoDoc.last_modified_time) : new Date(),
        }
      })
    } else if (type === "SalesOrder") {
      const itemsPayload = {
        salesOrderNumber: booksDocNumber || "SO-PENDING",
        sub_total: amount,
        balance: amount,
        shippingCharge: 0,
        customer_name: account.name,
        salesperson: author?.name ? author.name.toUpperCase().trim() : "SYSTEM ADMIN",
        line_items: resolvedLineItems,
        fulfillmentPlan,
        custom_fields: [],
        lastSyncedAt: new Date().toISOString(),
      }
      transaction = await prisma.salesOrder.create({
        data: {
          zohoId: booksRefId,
          accountId: dbAccountId,
          amount,
          items: itemsPayload,
          status: "Pending",
          dealId: dealId || undefined,
          lastSyncedAt: new Date(),
          appModifiedAt: new Date(),
          lastZohoModifiedTime: zohoDoc?.last_modified_time ? new Date(zohoDoc.last_modified_time) : new Date(),
        }
      })
    }

    if (transaction) {
      await syncStoredLineItems(type === "Quote" ? "quote" : "salesOrder", transaction.id, responseLineItems)
      if (providerOperationKey) {
        await prisma.providerWriteOperation.update({ where: { operationKey: providerOperationKey }, data: { state: "SUCCEEDED", providerRecordIds: { booksRefId, booksDocNumber, localRecordId: transaction.id }, completedAt: new Date(), lastError: null } })
      }
    }

    // ── Auto-process costs & sync back to Books ──
    if (!localDevelopmentTransaction) try {
      if (type === "Quote") {
        await processQuoteCosts({
          httpMethod: "POST",
          body: JSON.stringify({ invoiceId: booksRefId, skipLoopGuard: true })
        } as any, {} as any)
      } else if (type === "SalesOrder") {
        await processSalesOrderCosts({
          httpMethod: "POST",
          body: JSON.stringify({ invoiceId: booksRefId, skipLoopGuard: true })
        } as any, {} as any)
      }
    } catch (costErr: any) {
      console.error("Failed to auto-process costs after creation:", costErr.message)
    }

    // Automatically create a processing Task if notes or assignee are set
    if (processingNotes || assigneeId) {
      try {
        let assigneeUser = null
        if (assigneeId) {
          assigneeUser = await prisma.user.findUnique({ where: { id: assigneeId } })
        }
        if (!administrator && assigneeUser?.id !== userId) {
          assigneeUser = author
        }
        if (!assigneeUser) {
          assigneeUser = await prisma.user.findUnique({ where: { id: account.ownerId } })
        }
        if (!assigneeUser && author) {
          assigneeUser = author
        }

        if (assigneeUser) {
          const subject = `Process POS ${type} - ${account.name}`
          const description = `Processing notes:\n${processingNotes || "RUSH order or custom instructions."}`

          // Sync Task to Zoho CRM
          let zohoTaskId = `mock-task-${Date.now()}`
          if (assigneeUser.zohoId) {
            try {
              const zohoTaskPayload = {
                data: [{
                  Subject: subject,
                  Description: description + (type === "Quote" ? `\nLinked Estimate: ${booksRefId}` : `\nLinked Sales Order: SO-${transaction.id}`),
                  Status: "Not Started",
                  Priority: "Normal",
                  Owner: { id: assigneeUser.zohoId },
                  What_Id: { id: account.zohoId },
                  $se_module: "Accounts"
                }]
              }

              const crmTaskRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Tasks`, { signal: AbortSignal.timeout(15000),
                method: "POST",
                headers: {
                  'Authorization': `Zoho-oauthtoken ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(zohoTaskPayload)
              })
              const crmTaskData = await crmTaskRes.json()
              if (crmTaskRes.ok && crmTaskData.data && crmTaskData.data[0]?.code === "SUCCESS") {
                zohoTaskId = crmTaskData.data[0].details.id
              }
            } catch (zohoTaskErr: any) {
              console.warn("Failed to create task in Zoho CRM, falling back to mock ID:", zohoTaskErr.message)
            }
          }

          const taskData: any = {
            zohoId: zohoTaskId,
            subject,
            description,
            status: "Not Started",
            priority: "Normal",
            ownerId: assigneeUser.id,
            accountId: account.id
          }

          if (type === "Quote") {
            taskData.quoteId = transaction.id
            taskData.estimateId = booksRefId
          } else if (type === "SalesOrder") {
            taskData.salesOrderId = transaction.id
          }

          await prisma.task.create({
            data: taskData
          })
        }
      } catch (taskErr: any) {
        console.error("Failed to automatically create task from POS:", taskErr.message)
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, transaction, booksRefId, documentNumber: booksDocNumber, localDevelopmentTransaction })
    }

  } catch (error: any) {
    console.error('Create Transaction Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
