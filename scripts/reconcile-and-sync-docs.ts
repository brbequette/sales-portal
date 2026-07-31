import { PrismaClient } from '@prisma/client'
import { getZohoAccessToken } from '../netlify/functions/lib/zoho-auth'
import { calculateDocumentCosts, buildFieldsToUpdate } from '../netlify/functions/lib/cost-calculations'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env') })

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'
const BASE_URL = `https://www.zohoapis.${ZOHO_DC}/books/v3`
const RATE_DELAY_MS = 1300

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function run() {
  console.log("==========================================================")
  console.log("   MASS DOCUMENT RECONCILIATION & SYNC ENGINE             ")
  console.log("==========================================================\n")

  const token = await getZohoAccessToken()
  const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

  // 1. Fetch all Invoices
  console.log("Loading all Invoices from local DB...")
  const invoices = await prisma.invoice.findMany({
    select: { id: true, zohoId: true, status: true, amount: true, items: true }
  })
  console.log(`Loaded ${invoices.length} invoices.`)

  // 2. Fetch all Sales Orders
  console.log("Loading all Sales Orders from local DB...")
  const salesOrders = await prisma.salesOrder.findMany({
    select: { id: true, zohoId: true, status: true, amount: true, items: true }
  })
  console.log(`Loaded ${salesOrders.length} sales orders.`)

  // 3. Fetch all Quotes
  console.log("Loading all Quotes from local DB...")
  const quotes = await prisma.quote.findMany({
    select: { id: true, zohoId: true, status: true, amount: true, items: true }
  })
  console.log(`Loaded ${quotes.length} quotes.`)

  const processDoc = async (raw: any, docType: 'Invoice' | 'SalesOrder' | 'Quote') => {
    const items = (raw.items as any) || {}
    let zohoDoc = {
      line_items: items.line_items || [],
      custom_fields: items.custom_fields || [],
      sub_total: items.sub_total || raw.amount || 0,
      balance: items.balance ?? 0,
      salesperson_name: items.salesperson || null,
      customer_name: items.customer_name || null,
      last_payment_date: items.paymentDate || null,
      status: items.status || raw.status || 'Draft'
    }

    const booksIdPath = docType === 'Invoice' ? 'booksInvoiceId' : docType === 'SalesOrder' ? 'booksSalesOrderId' : 'booksEstimateId'
    const booksId = items[booksIdPath] || raw.zohoId

    const hasLines = zohoDoc.line_items && Array.isArray(zohoDoc.line_items) && zohoDoc.line_items.length > 0

    // Fetch from Zoho Books if line items are missing
    if (!hasLines && booksId) {
      console.log(`[${docType}] Fetching missing line items for ${booksId} from Zoho Books...`)
      await sleep(RATE_DELAY_MS)
      const modPath = docType === 'Invoice' ? 'invoices' : docType === 'SalesOrder' ? 'salesorders' : 'estimates'
      const detailRes = await fetch(`${BASE_URL}/${modPath}/${booksId}?organization_id=${ORG_ID}`, { headers: authHeaders })
      if (!detailRes.ok) {
        console.error(`[${docType}] Fetch failed for ${booksId}: ${detailRes.status}`)
        return
      }
      const detailData: any = await detailRes.json()
      if (detailData.code === 0) {
        const doc = detailData.invoice || detailData.salesorder || detailData.estimate
        if (doc) {
          zohoDoc = {
            line_items: doc.line_items || [],
            custom_fields: doc.custom_fields || [],
            sub_total: parseFloat(doc.sub_total || 0),
            balance: doc.balance ?? 0,
            salesperson_name: doc.salesperson_name || null,
            customer_name: doc.customer_name || null,
            last_payment_date: doc.last_payment_date || null,
            status: doc.status || 'Draft'
          }
        }
      }
    }

    if (!zohoDoc.line_items || zohoDoc.line_items.length === 0) {
      console.log(`[${docType}] Skipping ${booksId} -- no line items available.`)
      return
    }

    // Run the cost calculation engine locally
    const calc = await calculateDocumentCosts(zohoDoc)

    // Build items payload
    const updatedItems = {
      ...items,
      line_items: zohoDoc.line_items,
      custom_fields: zohoDoc.custom_fields,
      sub_total: zohoDoc.sub_total,
      balance: zohoDoc.balance,
      customer_name: zohoDoc.customer_name || items.customer_name || '',
      salesperson: zohoDoc.salesperson_name ? zohoDoc.salesperson_name.toUpperCase().trim() : items.salesperson,
      paymentDate: zohoDoc.last_payment_date || items.paymentDate,
      [booksIdPath]: booksId,
      lastSyncedAt: new Date().toISOString(),
      
      deadCostSubjectToVig: calc.deadCostSubjectToVig,
      deadCostNoVig: calc.deadCostNoVig,
      deadCostTotal: calc.deadCostTotal,
      vig: calc.vigRate,
      deadCostPlusVig: calc.deadCostPlusVig,
      profit: calc.profit,
      deadProfitActual: calc.deadProfitActual,
      commissionPercent: calc.commissionPct,
      commission: calc.salesCommission,
      marginPercent: calc.marginPercent,
      ccFees: calc.ccFees,
      additionalCosts: calc.additionalCosts,
      insurance: calc.insurance,
      lineItemDetails: calc.lineItemDetails,
      itemsDcBreakdown: calc.lineItemBreakdownStrings,
      isPaid: calc.isPaid
    }

    // Status resolution
    let status = raw.status
    const zs = (zohoDoc.status || '').toLowerCase()
    if (zs === 'paid' || zohoDoc.balance === 0 || zs === 'closed' || zs === 'invoiced') status = 'Paid'
    else if (zs === 'void' || zs === 'voided') status = 'Void'
    else if (zs === 'writeoff' || zs === 'write_off') status = 'Writeoff'
    else if (zs === 'draft') status = 'Draft'
    else if (zohoDoc.status) status = zohoDoc.status.charAt(0).toUpperCase() + zohoDoc.status.slice(1)

    // Update local DB
    if (docType === 'Invoice') {
      await prisma.invoice.update({ where: { id: raw.id }, data: { status, items: updatedItems } })
    } else if (docType === 'SalesOrder') {
      await prisma.salesOrder.update({ where: { id: raw.id }, data: { status, items: updatedItems } })
    } else {
      await prisma.quote.update({ where: { id: raw.id }, data: { status, items: updatedItems } })
    }

    // Sync to Books: ONLY for non-paid documents
    const isPaidInvoice = docType === 'Invoice' && status === 'Paid'
    if (isPaidInvoice) {
      console.log(`[${docType}] ${booksId} is a Paid Invoice. Skipping Zoho Books PUT update (calculating locally only).`)
      return
    }

    // Determine custom fields to push
    const fieldsToUpdate = buildFieldsToUpdate(calc, zohoDoc, docType === 'Invoice' ? 'invoices' : docType === 'SalesOrder' ? 'salesorders' : 'estimates')
    if (fieldsToUpdate.length > 0 && booksId) {
      console.log(`[${docType}] Syncing ${fieldsToUpdate.length} custom fields for ${booksId} to Zoho Books...`)
      await sleep(RATE_DELAY_MS)
      const modPath = docType === 'Invoice' ? 'invoices' : docType === 'SalesOrder' ? 'salesorders' : 'estimates'
      const putRes = await fetch(`${BASE_URL}/${modPath}/${booksId}?organization_id=${ORG_ID}`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_fields: fieldsToUpdate })
      })
      if (!putRes.ok) {
        console.error(`[${docType}] PUT failed for ${booksId}: ${putRes.status}`)
      } else {
        console.log(`[${docType}] Synced successfully for ${booksId}.`)
      }
    } else {
      console.log(`[${docType}] ${booksId} is already fully synchronized in Zoho Books.`)
    }
  }

  console.log("\n--- Processing Invoices ---")
  for (let i = 0; i < invoices.length; i++) {
    console.log(`Processing invoice ${i + 1}/${invoices.length}...`)
    try {
      await processDoc(invoices[i], 'Invoice')
    } catch (e: any) {
      console.error(`Error processing invoice ${invoices[i].id}:`, e.message)
    }
  }

  console.log("\n--- Processing Sales Orders ---")
  for (let i = 0; i < salesOrders.length; i++) {
    console.log(`Processing sales order ${i + 1}/${salesOrders.length}...`)
    try {
      await processDoc(salesOrders[i], 'SalesOrder')
    } catch (e: any) {
      console.error(`Error processing sales order ${salesOrders[i].id}:`, e.message)
    }
  }

  console.log("\n--- Processing Quotes ---")
  for (let i = 0; i < quotes.length; i++) {
    console.log(`Processing quote ${i + 1}/${quotes.length}...`)
    try {
      await processDoc(quotes[i], 'Quote')
    } catch (e: any) {
      console.error(`Error processing quote ${quotes[i].id}:`, e.message)
    }
  }

  console.log("\n==========================================================")
  console.log("🎉 SUCCESS! ALL DOCUMENTS RECONCILED AND SYNCED!")
  console.log("==========================================================")
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
