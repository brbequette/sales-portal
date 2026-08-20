import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"

// How long a cached record is considered fresh before we re-fetch from Zoho
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function isCacheFresh(items: any): boolean {
  if (!items?.lastSyncedAt) return false
  if (!items?.line_items || (Array.isArray(items.line_items) && items.line_items.length === 0)) return false
  return (Date.now() - new Date(items.lastSyncedAt).getTime()) < CACHE_TTL_MS
}

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

    // ── Step 2: Serve from cache if fresh and not force-refreshed ──
    if (dbDoc && force !== 'true' && isCacheFresh(dbDoc.items as any)) {
      console.log(`Cache hit for ${type} ${targetId} (last synced ${(dbDoc.items as any).lastSyncedAt})`)

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

    // ── Step 3: Determine the Zoho Books ID to call ──
    let booksDocId = targetId
    if (dbDoc) {
      const items = dbDoc.items as any || {}
      if (items.booksInvoiceId) booksDocId = items.booksInvoiceId
      else if (items.booksSalesOrderId) booksDocId = items.booksSalesOrderId
      else if (items.booksEstimateId) booksDocId = items.booksEstimateId
      else if (items.invoiceNumber && type === "Invoice") {
        // Search by invoice number if no direct Books ID
        let searchNum = items.invoiceNumber
        if (typeof searchNum === 'string' && searchNum.includes('|')) {
          searchNum = searchNum.split('|').pop()?.trim()
        } else if (typeof searchNum === 'string' && searchNum.startsWith('INV-')) {
          searchNum = searchNum.substring(4).trim()
        }
        try {
          const token = await getZohoAccessToken()
          const searchUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&invoice_number=${searchNum}`
          const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } })
          if (searchRes.ok) {
            const searchData: any = await searchRes.json()
            if (searchData.invoices?.length > 0) {
              booksDocId = searchData.invoices[0].invoice_id
              // Save for future lookups
              const updatedItems = { ...(dbDoc.items as any), booksInvoiceId: booksDocId }
              await prisma.invoice.update({ where: { id: dbDoc.id }, data: { items: updatedItems } })
            }
          }
        } catch (e) {
          console.error("Failed to search Books API by invoice_number", e)
        }
      }
    }

    // ── Step 4: Fetch from Zoho Books ──
    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    let modulePath = "invoices"
    if (type === "SalesOrder") modulePath = "salesorders"
    if (type === "Quote") modulePath = "estimates"

    const zohoRes = await fetch(`${baseUrl}/${modulePath}/${booksDocId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!zohoRes.ok) {
      const errorText = await zohoRes.text()
      throw new Error(`Zoho API failed with status ${zohoRes.status}: ${errorText}`)
    }

    const zohoData: any = await zohoRes.json()
    if (zohoData.code !== 0) throw new Error(`Zoho error: ${zohoData.message}`)

    let returnedDoc = zohoData.invoice
    if (type === "SalesOrder") returnedDoc = zohoData.salesorder
    if (type === "Quote") returnedDoc = zohoData.estimate

    // ── Step 5: Write full data back to local DB (cache population) ──
    if (dbDoc) {
      const zohoDoc = returnedDoc
      let status = dbDoc.status
      const zStatus = (zohoDoc.status || '').toLowerCase()
      if (zStatus === 'paid' || zohoDoc.balance === 0 || zStatus === 'closed' || zStatus === 'invoiced') {
        status = 'Paid'
      } else if (zStatus === 'void' || zStatus === 'voided' || zStatus === 'declined') {
        status = 'Void'
      } else if (zStatus === 'writeoff' || zStatus === 'write_off' || zStatus === 'write off' || zStatus === 'bad debt') {
        status = 'Writeoff'
      } else if (zStatus === 'draft') {
        status = 'Draft'
      } else if (zStatus === 'overdue' || (('dueDate' in dbDoc) && (dbDoc as any).dueDate && new Date((dbDoc as any).dueDate) < new Date())) {
        status = 'Overdue'
      } else if (zohoDoc.status) {
        status = zohoDoc.status.charAt(0).toUpperCase() + zohoDoc.status.slice(1)
      }

      const currentItems = (dbDoc.items as any) || {}

      // ── Core cache data ──
      currentItems.line_items = zohoDoc.line_items || []
      currentItems.custom_fields = zohoDoc.custom_fields || []
      currentItems.balance = zohoDoc.balance ?? 0
      currentItems.sub_total = parseFloat(zohoDoc.sub_total || 0)
      currentItems.customer_name = zohoDoc.customer_name || ''
      currentItems.lastSyncedAt = new Date().toISOString()

      // ── Payment/shipping detail ──
      if (zohoDoc.last_payment_date) currentItems.paymentDate = zohoDoc.last_payment_date
      currentItems.shippingCharge = parseFloat(zohoDoc.shipping_charge || 0)

      // ── Salesperson (authoritative from Books) ──
      if (zohoDoc.salesperson_name) {
        currentItems.salesperson = zohoDoc.salesperson_name.toUpperCase().trim()
      }

      // ── Store Books ID so future lookups skip the search step ──
      if (type === "Invoice" && !currentItems.booksInvoiceId) currentItems.booksInvoiceId = booksDocId
      if (type === "SalesOrder" && !currentItems.booksSalesOrderId) currentItems.booksSalesOrderId = booksDocId
      if (type === "Quote" && !currentItems.booksEstimateId) currentItems.booksEstimateId = booksDocId

      // ── Preserve raw Zoho fields the modal might need ──
      currentItems._zohoRaw = {
        salesperson_id: zohoDoc.salesperson_id,
        customer_id: zohoDoc.customer_id,
        currency_code: zohoDoc.currency_code,
        taxes: zohoDoc.taxes,
        shipping_address: zohoDoc.shipping_address,
        billing_address: zohoDoc.billing_address,
        notes: zohoDoc.notes,
        terms: zohoDoc.terms,
        discount: zohoDoc.discount,
        discount_type: zohoDoc.discount_type,
        payment_terms: zohoDoc.payment_terms,
        payment_terms_label: zohoDoc.payment_terms_label,
      }

      try {
        if (type === "Invoice") {
          await prisma.invoice.update({ where: { id: dbDoc.id }, data: { status, items: currentItems } })
        } else if (type === "SalesOrder") {
          await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: { status, items: currentItems } })
        } else if (type === "Quote") {
          await prisma.quote.update({ where: { id: dbDoc.id }, data: { status, items: currentItems } })
        }
        console.log(`Cached full ${type} data for ${targetId} (${(currentItems.line_items || []).length} line items)`)
      } catch (dbErr) {
        console.error("Failed to cache document details to local DB:", dbErr)
      }
    }

    // ── Step 6: Vig rate ──
    const vigRate = await getVigRate(prisma, returnedDoc.salesperson_name || '')

    // ── Step 7: Fetch related packages & dropshipments ──
    let packages: any[] = []
    let dropshipments: any[] = []

    try {
      const soZohoId = type === "SalesOrder" 
        ? (returnedDoc.salesorder_id || booksDocId) 
        : (returnedDoc.salesorder_id || (dbDoc?.items as any)?.booksSalesOrderId || (dbDoc?.items as any)?.salesOrderNumber)

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
    } catch (e) {
      console.error("Failed to fetch packages/dropshipments for details:", e)
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ 
        success: true, 
        invoice: { ...returnedDoc, packages, dropshipments }, 
        salesorder: type === "SalesOrder" ? { ...returnedDoc, packages, dropshipments } : undefined, 
        estimate: type === "Quote" ? { ...returnedDoc, packages, dropshipments } : undefined, 
        vigRate, 
        _source: 'zoho_live' 
      })
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
