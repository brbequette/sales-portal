import { schedule } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
import { extractProfit as getCanonicalProfit, extractCommissionAmount as getCanonicalCommission, extractVigRate as getCanonicalVig, extractActualShippingCost, extractShippingCostBreakdown } from "../../src/lib/custom-field-extractor"
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

// Runs every day at 6:00 AM UTC (2:00 AM EST / 11:00 PM PST)
export const handler = schedule("0 6 * * *", async () => {
  console.log("=== Daily Books Sync Started ===")
  const startTime = Date.now()

  try {
    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // Fetch records modified in the last 48 hours (2-day window for safety)
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const sinceStr = since.toISOString().split('.')[0] + '+0000' // YYYY-MM-DDTHH:MM:SS+0000

    let invoicesSynced = 0
    let sosSynced = 0
    let quotesSynced = 0

    // ─── Sync Invoices ───
    try {
      let page = 1
      let hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/invoices?organization_id=${ORG_ID}&last_modified_time=${encodeURIComponent(sinceStr)}&page=${page}&per_page=200&sort_column=last_modified_time&sort_order=D`
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { console.error(`Invoices page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const invoices: any[] = data.invoices || []
        console.log(`Invoice page ${page}: ${invoices.length} records`)

        for (const inv of invoices) {
          await syncDocumentToDb(prisma, token, baseUrl, 'Invoice', inv.invoice_id, inv)
          invoicesSynced++
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) {
      console.error("Invoice sync error:", e)
    }

    // ─── Sync Sales Orders ───
    try {
      let page = 1
      let hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/salesorders?organization_id=${ORG_ID}&last_modified_time=${encodeURIComponent(sinceStr)}&page=${page}&per_page=200&sort_column=last_modified_time&sort_order=D`
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { console.error(`SalesOrders page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const orders: any[] = data.salesorders || []
        console.log(`SalesOrder page ${page}: ${orders.length} records`)

        for (const so of orders) {
          await syncDocumentToDb(prisma, token, baseUrl, 'SalesOrder', so.salesorder_id, so)
          sosSynced++
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) {
      console.error("SalesOrder sync error:", e)
    }

    // ─── Sync Estimates/Quotes ───
    try {
      let page = 1
      let hasMore = true
      while (hasMore) {
        // Only sync estimates that have been converted to an invoice (status=invoiced)
        const url = `${baseUrl}/estimates?organization_id=${ORG_ID}&status=invoiced&last_modified_time=${encodeURIComponent(sinceStr)}&page=${page}&per_page=200&sort_column=last_modified_time&sort_order=D`
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { console.error(`Estimates page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const estimates: any[] = data.estimates || []
        console.log(`Estimate page ${page}: ${estimates.length} records`)

        for (const est of estimates) {
          // Double-check: only sync invoiced estimates (API filter may include others)
          if ((est.status || '').toLowerCase() !== 'invoiced') continue
          await syncDocumentToDb(prisma, token, baseUrl, 'Quote', est.estimate_id, est)
          quotesSynced++
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) {
      console.error("Estimate sync error:", e)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`=== Daily Books Sync Complete in ${elapsed}s: ${invoicesSynced} invoices, ${sosSynced} SOs, ${quotesSynced} quotes ===`)
  } catch (err: any) {
    console.error("Daily Books Sync fatal error:", err)
  }
})

/**
 * Fetches the full detail for a single document from Zoho Books and writes it
 * into the local DB items JSON field, including line_items and custom_fields.
 */
async function syncDocumentToDb(
  prisma: PrismaClient,
  token: string,
  baseUrl: string,
  type: 'Invoice' | 'SalesOrder' | 'Quote',
  booksId: string,
  summary: any // the list-level summary record (no line_items yet)
) {
  try {
    // Find the local record by zohoId (the Books ID is our foreign key for these)
    let dbDoc: any = null
    if (type === 'Invoice') {
      dbDoc = await prisma.invoice.findFirst({ where: { zohoId: booksId } })
    } else if (type === 'SalesOrder') {
      dbDoc = await prisma.salesOrder.findFirst({ where: { zohoId: booksId } })
    } else {
      dbDoc = await prisma.quote.findFirst({ where: { zohoId: booksId } })
    }

    // If record doesn't exist locally, skip (it will be created during a CRM sync)
    if (!dbDoc) {
      // Try by invoice number as a fallback match
      return
    }

    // Check if the remote modified time is newer than what we have cached
    const remoteModified = summary.last_modified_time ? new Date(summary.last_modified_time).getTime() : Date.now()
    const currentItems = (dbDoc.items as any) || {}
    const lastSynced = currentItems.lastSyncedAt ? new Date(currentItems.lastSyncedAt).getTime() : 0

    // If cached within last 6 hours AND remote hasn't changed, skip the detail fetch
    if (lastSynced > 0 && (Date.now() - lastSynced) < 6 * 60 * 60 * 1000 && remoteModified <= lastSynced) {
      return
    }

    // Fetch the full record (with line_items)
    const modulePath = type === 'Invoice' ? 'invoices' : type === 'SalesOrder' ? 'salesorders' : 'estimates'
    const detailRes = await fetch(`${baseUrl}/${modulePath}/${booksId}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    if (!detailRes.ok) {
      console.warn(`Failed to fetch ${type} ${booksId} detail: ${detailRes.status}`)
      return
    }
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) return

    const doc = detailData.invoice || detailData.salesorder || detailData.estimate
    if (!doc) return

    // Build the updated items JSON
    const updatedItems = {
      ...currentItems,
      // Document number
      invoiceNumber: doc.invoice_number || currentItems.invoiceNumber,
      salesOrderNumber: doc.salesorder_number || currentItems.salesOrderNumber,
      estimateNumber: doc.estimate_number || currentItems.estimateNumber,
      // Financial
      sub_total: parseFloat(doc.sub_total || 0),
      balance: doc.balance ?? 0,
      shippingCharge: parseFloat(doc.shipping_charge || 0),
      // People
      customer_name: doc.customer_name || currentItems.customer_name,
      salesperson: doc.salesperson_name ? doc.salesperson_name.toUpperCase().trim() : currentItems.salesperson,
      // Full detail
      line_items: doc.line_items || currentItems.line_items || [],
      custom_fields: doc.custom_fields || currentItems.custom_fields || [],
      // Payment
      paymentDate: doc.last_payment_date || currentItems.paymentDate,
      // Books ID (self-referential but useful for lookups)
      booksInvoiceId: type === 'Invoice' ? booksId : currentItems.booksInvoiceId,
      booksSalesOrderId: type === 'SalesOrder' ? booksId : currentItems.booksSalesOrderId,
      booksEstimateId: type === 'Quote' ? booksId : currentItems.booksEstimateId,
      // Profit & commission from custom_field_hash (Zoho's detail API returns these separately)
      profit: extractProfit(doc, currentItems),
      commission: extractCommission(doc, currentItems),
      vig: extractVig(doc, currentItems),
      // Cache stamp
      lastSyncedAt: new Date().toISOString(),
      actualShippingCost: extractActualShippingCost(doc),
      shippingCostBreakdown: extractShippingCostBreakdown(doc),
    }

    // Determine status
    let status = dbDoc.status
    const zStatus = (doc.status || '').toLowerCase()
    if (zStatus === 'paid' || doc.balance === 0 || zStatus === 'closed' || zStatus === 'invoiced') status = 'Paid'
    else if (zStatus === 'void' || zStatus === 'voided' || zStatus === 'declined') status = 'Void'
    else if (zStatus === 'writeoff' || zStatus === 'write_off' || zStatus === 'bad debt') status = 'Writeoff'
    else if (zStatus === 'draft') status = 'Draft'
    else if (doc.status) status = doc.status.charAt(0).toUpperCase() + doc.status.slice(1)

    // Write back to DB — also update zohoModifiedTime so bulk-calculate-costs knows
    // this doc may need its costs recalculated (remoteModified > costsCalculatedAt triggers recalc)
    const zohoModTime = summary.last_modified_time ? new Date(summary.last_modified_time) : new Date()
    if (type === 'Invoice') {
      await prisma.invoice.update({
        where: { id: dbDoc.id },
        data: {
          status,
          items: updatedItems,
          zohoModifiedTime: zohoModTime,
          actualShippingCost: updatedItems.actualShippingCost,
          shippingCostBreakdown: updatedItems.shippingCostBreakdown,
        }
      })
    } else if (type === 'SalesOrder') {
      await prisma.salesOrder.update({
        where: { id: dbDoc.id },
        data: {
          status,
          items: updatedItems,
          zohoModifiedTime: zohoModTime,
          actualShippingCost: updatedItems.actualShippingCost,
          shippingCostBreakdown: updatedItems.shippingCostBreakdown,
        }
      })
    } else {
      await prisma.quote.update({ where: { id: dbDoc.id }, data: { status, items: updatedItems, zohoModifiedTime: zohoModTime } })
    }
  } catch (e: any) {
    console.error(`syncDocumentToDb error for ${type} ${booksId}:`, e.message)
  }
}

/**
 * Extract profit from a Zoho Books detail document.
 * Zoho stores calculated fields in custom_field_hash (not in custom_fields array).
 * Profit = sub_total - dead_cost_total, or use cf_estimated_profit_unformatted directly.
 */
function extractProfit(doc: any, fallback: any): number {
  return getCanonicalProfit(doc) || fallback.profit || 0
}

function extractCommission(doc: any, fallback: any): number {
  return getCanonicalCommission(doc) || fallback.commission || 0
}

function extractVig(doc: any, fallback: any): number {
  return getCanonicalVig(doc) || fallback.vig || 1.3
}

