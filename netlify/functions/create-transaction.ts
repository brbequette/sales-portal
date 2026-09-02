import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
import { syncStoredLineItems } from "../../src/lib/sync-engine"
import { internalHandler as processQuoteCosts } from "./process-quote-costs"
import { internalHandler as processSalesOrderCosts } from "./process-salesorder-costs"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { isAdminRole } from "../../src/lib/roles"
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
    const { accountId, type, amount, items, lineItems, discountTotal, processingNotes, assigneeId, dealId } = body
    const userId = authenticatedUser.dbId
    const userEmail = authenticatedUser.email

    if (!accountId || !type || amount === undefined) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing required fields" })
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

    if (localDevelopmentTransaction) {
      const localSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      booksRefId = `dev-${type.toLowerCase()}-${localSuffix}`
      booksDocNumber = type === 'Quote' ? `DEV-EST-${localSuffix}` : `DEV-SO-${localSuffix}`
      zohoDoc = { line_items: lineItems || [], localDevelopmentTransaction: true }
    } else {
      token = await getZohoAccessToken()
      let booksContactId = null

      // First, resolve the true Zoho Books Contact ID.
      const searchRes = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}&zcrm_account_id=${account.zohoId}`, { signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      const searchData = await searchRes.json()

      if (searchData.contacts && searchData.contacts.length > 0) {
        booksContactId = searchData.contacts[0].contact_id
      } else {
        const searchByNameRes = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}&contact_name=${encodeURIComponent(account.name)}`, { signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Zoho-oauthtoken ${token}` }
        })
        const searchByNameData = await searchByNameRes.json()

        if (searchByNameData.contacts && searchByNameData.contacts.length > 0) {
          booksContactId = searchByNameData.contacts[0].contact_id
        } else {
          const createRes = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
            method: "POST",
            headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ contact_name: account.name, zcrm_account_id: account.zohoId })
          })
          const createData = await createRes.json()
          if (createData.code !== 0) throw new Error(`Zoho Books Error (Create Contact): ${createData.message}`)
          booksContactId = createData.contact.contact_id
        }
      }

      const payload = {
        customer_id: booksContactId,
        salesperson_name: author?.name || "System Admin",
        line_items: (lineItems || []).map((li: any) => ({ item_id: li.itemId || undefined, name: li.name, description: li.description, rate: li.rate, quantity: li.quantity, discount: li.discount || 0 })),
        discount_type: "item_level",
        is_discount_before_tax: true,
        notes: "Created via Sales Portal POS"
      }

      const endpoint = type === 'Quote' ? 'estimates' : 'salesorders'
      const res = await fetch(`${baseUrl}/${endpoint}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.code !== 0) throw new Error(`Zoho Books Error: ${data.message}`)
      const remoteDoc = type === 'Quote' ? data.estimate : data.salesorder
      booksRefId = type === 'Quote' ? remoteDoc?.estimate_id : remoteDoc?.salesorder_id
      booksDocNumber = type === 'Quote' ? remoteDoc?.estimate_number : remoteDoc?.salesorder_number
      zohoDoc = remoteDoc
    }

    // Resolve full line items array
    const responseLineItems = zohoDoc?.line_items || lineItems || []
    const resolvedLineItems = responseLineItems.map((li: any) => ({
      name: li.name,
      sku: li.sku || li.description?.replace("SKU: ", "")?.replace(" (PROMO FREE)", "") || "",
      rate: parseFloat(li.rate || 0),
      quantity: parseInt(li.quantity || 0),
      description: li.description || ""
    }))

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
      body: JSON.stringify({ success: true, transaction, booksRefId, localDevelopmentTransaction })
    }

  } catch (error: any) {
    console.error('Create Transaction Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
