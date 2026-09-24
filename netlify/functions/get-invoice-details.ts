import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"

function buildLocalResponse(dbDoc: any, type: string, vigRate: number, packages: any[] = [], dropshipments: any[] = []) {
  const items = dbDoc.items as any || {}
  
  // Fallback line items using prisma relation
  const rawLineItems = (items.line_items && items.line_items.length > 0)
    ? items.line_items
    : (dbDoc.lineItems || []).map((li: any) => ({
        line_item_id: li.zohoLineItemId || li.id,
        name: li.productName,
        sku: li.sku || '',
        quantity: li.quantity,
        rate: li.unitPrice,
        price: li.unitPrice,
        item_total: li.total,
        discount: li.discount,
        description: li.description || ''
      }));

  // Fallback billing & shipping address using account
  const rawBillingAddress = items._zohoRaw?.billing_address || (dbDoc.account ? {
    attention: dbDoc.account.name || '',
    address: dbDoc.account.billingStreet || '',
    street2: '',
    city: dbDoc.account.billingCity || '',
    state: dbDoc.account.billingState || '',
    zip: dbDoc.account.billingZip || '',
    zipcode: dbDoc.account.billingZip || '',
    country: 'U.S.A',
    phone: dbDoc.account.phone || dbDoc.account.contacts?.[0]?.phone || ''
  } : undefined);

  const rawShippingAddress = items._zohoRaw?.shipping_address || (dbDoc.account ? {
    attention: dbDoc.account.name || '',
    address: dbDoc.account.shippingStreet || '',
    street2: '',
    city: dbDoc.account.shippingCity || '',
    state: dbDoc.account.shippingState || '',
    zip: dbDoc.account.shippingZip || '',
    zipcode: dbDoc.account.shippingZip || '',
    country: 'U.S.A',
    phone: dbDoc.account.phone || dbDoc.account.contacts?.[0]?.phone || ''
  } : undefined);

  const rawEmail = items._zohoRaw?.email || dbDoc.account?.contacts?.[0]?.email || '';
  const rawPhone = items._zohoRaw?.phone || dbDoc.account?.phone || dbDoc.account?.contacts?.[0]?.phone || '';

  // Shape the cached data to match what Zoho returns so the modal renders identically
  return {
    invoice_id: dbDoc.zohoId,
    salesorder_id: dbDoc.zohoId,
    estimate_id: dbDoc.zohoId,
    invoice_number: items.invoiceNumber || items.invoice_number || '',
    salesorder_number: items.salesOrderNumber || items.salesorder_number || '',
    estimate_number: items.estimateNumber || items.estimate_number || '',
    status: dbDoc.status?.toLowerCase() || 'open',
    date: dbDoc.issueDate ? new Date(dbDoc.issueDate).toISOString().split('T')[0] : '',
    due_date: (dbDoc as any).dueDate ? new Date((dbDoc as any).dueDate).toISOString().split('T')[0] : '',
    total: dbDoc.amount || 0,
    sub_total: items.sub_total || dbDoc.amount || 0,
    balance: items.balance ?? dbDoc.amount ?? 0,
    customer_name: items.customer_name || dbDoc.account?.name || '',
    customer_id: items._zohoRaw?.customer_id || dbDoc.account?.zohoId || '',
    salesperson_name: items.salesperson || '',
    shipping_charge: items.shippingCharge || 0,
    last_payment_date: items.paymentDate || null,
    line_items: rawLineItems,
    custom_fields: items.custom_fields || [],
    email: rawEmail,
    phone: rawPhone,
    billing_address: rawBillingAddress,
    shipping_address: rawShippingAddress,
    // Preserve all extra stored fields
    ...items._zohoRaw,
    _source: 'local_db',
    _cachedAt: items.lastSyncedAt,
    packages,
    dropshipments,
  }
}

const authenticatedHandler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const sessionUser = await authenticateFunction(event)
    const actorId = sessionUser.dbId || sessionUser.userId
    const { id, invoiceId, targetId: paramTargetId, type = "Invoice", force } = event.queryStringParameters || {}
    let targetId = invoiceId || id || paramTargetId

    if (!targetId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing document identifier" }) }
    }

    // ── Step 1: Look up in local DB with relations ──
    let dbDoc: any = null
    const includeQuery = {
      lineItems: true,
      account: {
        include: {
          contacts: true
        }
      }
    }

    if (type === "Invoice") {
      dbDoc = await prisma.invoice.findFirst({ 
        where: { OR: [{ id: targetId }, { zohoId: targetId }] },
        include: includeQuery
      })
    } else if (type === "SalesOrder") {
      dbDoc = await prisma.salesOrder.findFirst({ 
        where: { OR: [{ id: targetId }, { zohoId: targetId }] },
        include: includeQuery
      })
    } else if (type === "Quote") {
      dbDoc = await prisma.quote.findFirst({ 
        where: { OR: [{ id: targetId }, { zohoId: targetId }] },
        include: includeQuery
      })
    }

    if (!isAdminRole(sessionUser.role)) {
      if (!actorId || !dbDoc || dbDoc.account?.ownerId !== actorId) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "You can only view documents belonging to your accounts" }) }
      }
    }

    if (force === 'true' && !isAdminRole(sessionUser.role)) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "Only administrators can refresh a document from Zoho" }) }
    }

    // ── Step 2: Normal application reads always come from the local database. ──
    // Scheduled sync/webhooks keep this record current. A live Zoho request is only
    // allowed through the explicit administrator-only force refresh action below.
    if (dbDoc && force !== 'true') {
      console.log(`Local DB hit for ${type} ${targetId}`)

      // Still need vig rate for the modal
      const vigRate = await getVigRate(prisma, (dbDoc.items as any)?.salesperson || '')
      
      // Fetch packages & dropshipments
      let packages: any[] = []
      let dropshipments: any[] = []
      const soZohoId = type === "SalesOrder" 
        ? (dbDoc.zohoId) 
        : ((dbDoc.items as any)?.booksSalesOrderId || (dbDoc.items as any)?.salesOrderNumber)

      if (soZohoId) {
        packages = await prisma.package.findMany({
          where: {
            OR: [
              { salesOrderId: soZohoId },
              { salesOrderNumber: soZohoId }
            ]
          }
        })
        dropshipments = await prisma.purchaseOrder.findMany({
          where: {
            isDropshipment: true,
            OR: [
              { salesOrderId: soZohoId },
              { salesOrderNumber: soZohoId }
            ]
          }
        })
      }

      const doc = buildLocalResponse(dbDoc, type, vigRate, packages, dropshipments)

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: true, invoice: doc, salesorder: doc, estimate: doc, vigRate, _source: 'local_db' })
      }
    }

    return {
      statusCode: force === 'true' ? 405 : 409,
      headers: cors,
      body: JSON.stringify({ success: false, error: 'LOCAL_DATA_INCOMPLETE' })
    }

  } catch (err: any) {
    console.error("get-invoice-details error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

// ── Helper: look up the current vig rate for a salesperson ──
async function getVigRate(prisma: any, salespersonName: string): Promise<number> {
  let vigRate = 1.3
  if (!salespersonName) return vigRate

  const isMontgomery = salespersonName.toLowerCase().includes('montgomery') || salespersonName.toLowerCase().includes('morgan')
  if (isMontgomery) return 1.0

  try {
    const users = await prisma.user.findMany()
    const user = users.find((u: any) => u.name && (
      salespersonName.toLowerCase().includes(u.name.toLowerCase()) ||
      u.name.toLowerCase().includes(salespersonName.toLowerCase())
    ))

    if (user) {
      const settings = await prisma.systemSetting.findUnique({ where: { key: 'vig_settings' } })
      const allVigSettings = settings ? JSON.parse(settings.value) : {}
      const userVig = allVigSettings[user.id]

      if (userVig) {
        if (userVig.constantVigEnabled && userVig.constantVigValue !== null) {
          vigRate = userVig.constantVigValue
        } else {
          const currentMonthKey = new Date().toISOString().substring(0, 7)
          const monthlyGoal = (userVig.monthlyVigGoals || []).find((g: any) => g.monthKey === currentMonthKey)
          if (monthlyGoal && monthlyGoal.manualVigRate !== null) {
            vigRate = monthlyGoal.manualVigRate
          }
        }
      }
    }
  } catch (e) {
    console.error("getVigRate error:", e)
  }

  return vigRate
}

export const handler = withFunctionAuth(authenticatedHandler)
