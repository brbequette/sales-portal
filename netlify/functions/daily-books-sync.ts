import { schedule } from "@netlify/functions"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "./lib/zoho-auth"
import { prisma } from "./lib/prisma"
import { handler as processInvoiceCosts } from "./process-invoice-costs"
import { handler as processSalesOrderCosts } from "./process-salesorder-costs"
import { handler as processQuoteCosts } from "./process-quote-costs"
import {
  detectConflict,
  syncInvoicePayments,
  updateInvoiceRecord,
  updateSalesOrderRecord,
  updateQuoteRecord,
} from "../../src/lib/sync-engine"
import {
  extractProfit,
  extractCommissionAmount,
  extractVigRate,
  extractActualShippingCost,
  extractShippingCostBreakdown,
} from "../../src/lib/custom-field-extractor"

const ORG_ID = ZOHO_ORGANIZATION_ID

/**
 * Daily Books Sync — runs every day at 6:00 AM UTC (11 PM PST / 2 AM EST)
 *
 * Two passes:
 *   1. pendingZohoFetch queue: Documents flagged by the webhook receiver need
 *      a full detail fetch. Process these first so real-time webhook events are
 *      resolved even if the nightly window missed them.
 *   2. Last-48h modified sweep: Pull all Zoho records modified in the last 48h
 *      and apply the same sync logic to catch anything the webhook missed.
 *
 * Uses sync-engine for conflict detection — if both the app and Zoho changed
 * a record since the last sync, it's flagged (syncConflict=true) for admin
 * review instead of being silently overwritten.
 */
export const handler = schedule("0 6 * * *", async () => {
  console.log("=== Daily Books Sync Started ===")
  const startTime = Date.now()

  try {
    const token   = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    let invoicesSynced = 0, sosSynced = 0, quotesSynced = 0
    let conflictsFlagged = 0, pendingProcessed = 0, newRecordsCreated = 0

    // Build account name map for resolving new documents
    const allAccounts = await prisma.account.findMany({ select: { id: true, name: true, zohoId: true } })
    const accountByZohoId = new Map<string, string>()
    const accountByName = new Map<string, string>()
    allAccounts.forEach(a => {
      if (a.zohoId) accountByZohoId.set(a.zohoId, a.id)
      accountByName.set(a.name.toLowerCase().trim(), a.id)
    })

    // ── Pass 1: Process pendingZohoFetch queue ────────────────────────────
    // These were flagged by the real-time webhook and need a full detail pull.
    console.log("--- Pass 1: pendingZohoFetch queue ---")

    const pendingInvoices = await prisma.invoice.findMany({
      where: { pendingZohoFetch: true },
      select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
    })
    for (const inv of pendingInvoices) {
      if (!inv.zohoId) continue
      const synced = await syncFullDocument(token, baseUrl, "Invoice", inv.zohoId, inv)
      if (synced === "conflict") conflictsFlagged++
      pendingProcessed++
    }

    const pendingSOs = await prisma.salesOrder.findMany({
      where: { pendingZohoFetch: true },
      select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
    })
    for (const so of pendingSOs) {
      if (!so.zohoId) continue
      const synced = await syncFullDocument(token, baseUrl, "SalesOrder", so.zohoId, so)
      if (synced === "conflict") conflictsFlagged++
      pendingProcessed++
    }

    const pendingQuotes = await prisma.quote.findMany({
      where: { pendingZohoFetch: true },
      select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
    })
    for (const qt of pendingQuotes) {
      if (!qt.zohoId) continue
      const synced = await syncFullDocument(token, baseUrl, "Quote", qt.zohoId, qt)
      if (synced === "conflict") conflictsFlagged++
      pendingProcessed++
    }

    console.log(`Pass 1 complete: ${pendingProcessed} pending records processed, ${conflictsFlagged} conflicts flagged`)

    // ── Pass 2: Last-48h modified sweep ───────────────────────────────────
    console.log("--- Pass 2: 48h modified sweep ---")
    const since    = new Date(Date.now() - 12 * 60 * 60 * 1000)
    const sinceStr = since.toISOString().split(".")[0] + "+0000"

    // Invoices
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/invoices?organization_id=${ORG_ID}&last_modified_time=${encodeURIComponent(sinceStr)}&page=${page}&per_page=200&sort_column=last_modified_time&sort_order=D`
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { console.error(`Invoices page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const invoices: any[] = data.invoices || []
        console.log(`Invoice page ${page}: ${invoices.length}`)

        for (const inv of invoices) {
          let dbDoc = await prisma.invoice.findFirst({
            where: { zohoId: inv.invoice_id },
            select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
          })
          if (!dbDoc) {
            // NEW: Create record for new Zoho invoice
            const accountId = resolveAccountId(inv.customer_id, inv.customer_name, accountByZohoId, accountByName)
            if (!accountId) { console.log(`Skipping invoice ${inv.invoice_id}: no matching account`); continue }
            dbDoc = await prisma.invoice.upsert({
              where: { zohoId: inv.invoice_id },
              update: {},
              create: { zohoId: inv.invoice_id, accountId, amount: parseFloat(inv.total || '0') || 0, status: inv.status || 'draft', issueDate: inv.date ? new Date(inv.date) : new Date(), items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new Invoice ${inv.invoice_id} for ${inv.customer_name}`)
          }
          // Skip if already processed in Pass 1 (pendingZohoFetch already cleared)
          if (!dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, inv.last_modified_time)) {
            const r = await syncFullDocument(token, baseUrl, "Invoice", inv.invoice_id, dbDoc, inv)
            if (r === "conflict") conflictsFlagged++
            invoicesSynced++
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { console.error("Invoice sweep error:", e) }

    // Sales Orders
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/salesorders?organization_id=${ORG_ID}&last_modified_time=${encodeURIComponent(sinceStr)}&page=${page}&per_page=200&sort_column=last_modified_time&sort_order=D`
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { console.error(`SalesOrders page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const orders: any[] = data.salesorders || []
        console.log(`SalesOrder page ${page}: ${orders.length}`)

        for (const so of orders) {
          let dbDoc = await prisma.salesOrder.findFirst({
            where: { zohoId: so.salesorder_id },
            select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
          })
          if (!dbDoc) {
            const accountId = resolveAccountId(so.customer_id, so.customer_name, accountByZohoId, accountByName)
            if (!accountId) { console.log(`Skipping SO ${so.salesorder_id}: no matching account`); continue }
            dbDoc = await prisma.salesOrder.upsert({
              where: { zohoId: so.salesorder_id },
              update: {},
              create: { zohoId: so.salesorder_id, accountId, amount: parseFloat(so.total || '0') || 0, status: so.status || 'draft', orderDate: so.date ? new Date(so.date) : new Date(), items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new SalesOrder ${so.salesorder_id} for ${so.customer_name}`)
          }
          if (!dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, so.last_modified_time)) {
            const r = await syncFullDocument(token, baseUrl, "SalesOrder", so.salesorder_id, dbDoc, so)
            if (r === "conflict") conflictsFlagged++
            sosSynced++
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { console.error("SalesOrder sweep error:", e) }

    // Estimates (invoiced only)
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/estimates?organization_id=${ORG_ID}&status=invoiced&last_modified_time=${encodeURIComponent(sinceStr)}&page=${page}&per_page=200&sort_column=last_modified_time&sort_order=D`
        const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { console.error(`Estimates page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const estimates: any[] = data.estimates || []
        console.log(`Estimate page ${page}: ${estimates.length}`)

        for (const est of estimates) {
          if ((est.status || "").toLowerCase() !== "invoiced") continue
          let dbDoc = await prisma.quote.findFirst({
            where: { zohoId: est.estimate_id },
            select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
          })
          if (!dbDoc) {
            const accountId = resolveAccountId(est.customer_id, est.customer_name, accountByZohoId, accountByName)
            if (!accountId) { console.log(`Skipping estimate ${est.estimate_id}: no matching account`); continue }
            dbDoc = await prisma.quote.upsert({
              where: { zohoId: est.estimate_id },
              update: {},
              create: { zohoId: est.estimate_id, accountId, amount: parseFloat(est.total || '0') || 0, status: est.status || 'draft', quoteDate: est.date ? new Date(est.date) : new Date(), items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new Quote ${est.estimate_id} for ${est.customer_name}`)
          }
          if (!dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, est.last_modified_time)) {
            const r = await syncFullDocument(token, baseUrl, "Quote", est.estimate_id, dbDoc, est)
            if (r === "conflict") conflictsFlagged++
            quotesSynced++
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { console.error("Estimate sweep error:", e) }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`=== Daily Books Sync Complete in ${elapsed}s ===`)
    console.log(`  Invoices: ${invoicesSynced} | SOs: ${sosSynced} | Quotes: ${quotesSynced}`)
    console.log(`  New records created: ${newRecordsCreated}`)
    console.log(`  Pending processed: ${pendingProcessed} | Conflicts flagged: ${conflictsFlagged}`)

  } catch (err: any) {
    console.error("Daily Books Sync fatal error:", err)
  }
})

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Resolve account ID from Zoho customer_id or customer_name */
function resolveAccountId(
  customerZohoId: string | undefined,
  customerName: string | undefined,
  byZohoId: Map<string, string>,
  byName: Map<string, string>
): string | null {
  if (customerZohoId && byZohoId.has(String(customerZohoId))) return byZohoId.get(String(customerZohoId))!
  if (customerName) {
    const key = customerName.toLowerCase().trim()
    if (byName.has(key)) return byName.get(key)!
  }
  return null
}

/** Returns true if the local record is stale relative to Zoho's modified time */
function isStale(lastSyncedAt: Date | null, zohoModTime: string | undefined): boolean {
  if (!lastSyncedAt) return true
  if (!zohoModTime)  return false
  return new Date(zohoModTime).getTime() > lastSyncedAt.getTime()
}

/**
 * Fetch the full detail for a document from Zoho and sync it to the local DB.
 * Uses sync-engine for conflict detection.
 * Returns "conflict" | "synced" | "skipped"
 */
async function syncFullDocument(
  token:    string,
  baseUrl:  string,
  type:     "Invoice" | "SalesOrder" | "Quote",
  booksId:  string,
  dbDoc:    { id: string; zohoId: string | null; status: string | null; items: any; lastSyncedAt: Date | null; appModifiedAt: Date | null; lastZohoModifiedTime: Date | null },
  summary?: any // list-level summary from a sweep (may not have line_items)
): Promise<"conflict" | "synced" | "skipped"> {
  try {
    const modulePath = type === "Invoice" ? "invoices" : type === "SalesOrder" ? "salesorders" : "estimates"
    const detailRes = await fetch(`${baseUrl}/${modulePath}/${booksId}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    if (!detailRes.ok) {
      console.warn(`Failed to fetch ${type} ${booksId}: ${detailRes.status}`)
      return "skipped"
    }
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) return "skipped"

    const doc = detailData.invoice || detailData.salesorder || detailData.estimate
    if (!doc) return "skipped"

    // ── Conflict detection ────────────────────────────────────────────────
    const conflictResult = detectConflict(
      {
        lastSyncedAt:        dbDoc.lastSyncedAt,
        appModifiedAt:       dbDoc.appModifiedAt,
        lastZohoModifiedTime: dbDoc.lastZohoModifiedTime,
      },
      doc
    )

    if (conflictResult.hasConflict) {
      console.warn(`⚠️ Conflict: ${type} ${booksId}`)
      // Flag for admin review — update timestamps but DO NOT overwrite
      const flagData = {
        syncConflict:         true,
        pendingZohoFetch:     false, // clear the pending flag — we've checked it
        lastZohoModifiedTime: doc.last_modified_time ? new Date(doc.last_modified_time) : new Date(),
        conflictFields:       JSON.parse(JSON.stringify(conflictResult.fields)),
      }
      if (type === "Invoice")    await prisma.invoice.update({ where: { id: dbDoc.id }, data: flagData })
      if (type === "SalesOrder") await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: flagData })
      if (type === "Quote")      await prisma.quote.update({ where: { id: dbDoc.id }, data: flagData })
      return "conflict"
    }

    // ── Build calc items from Zoho custom fields ─────────────────────────
    const currentItems = (dbDoc.items as Record<string, unknown>) ?? {}
    const cfh = (doc.custom_field_hash as Record<string, unknown>) ?? {}

    const calcItems: Record<string, unknown> = {
      profit:              extractProfit(doc)           || currentItems.profit           || 0,
      commission:          extractCommissionAmount(doc) || currentItems.commission       || 0,
      commissionPercent:   parseFloat((cfh.cf_commision_from_profit_unformatted as string) ?? (currentItems.commissionPercent as string) ?? "50") || 50,
      vig:                 extractVigRate(doc)          || currentItems.vig              || 1.3,
      actualShippingCost:  extractActualShippingCost(doc)  || currentItems.actualShippingCost || 0,
      shippingCostBreakdown: extractShippingCostBreakdown(doc) || currentItems.shippingCostBreakdown || null,
      // Document numbers and Zoho IDs
      invoiceNumber:    doc.invoice_number    || currentItems.invoiceNumber,
      salesOrderNumber: doc.salesorder_number || currentItems.salesOrderNumber,
      estimateNumber:   doc.estimate_number   || currentItems.estimateNumber,
      booksInvoiceId:   type === "Invoice"    ? booksId : currentItems.booksInvoiceId,
      booksSalesOrderId: type === "SalesOrder" ? booksId : currentItems.booksSalesOrderId,
      booksEstimateId:  type === "Quote"      ? booksId : currentItems.booksEstimateId,
    }

    // ── Write to DB via sync-engine (sets all sync timestamps) ───────────
    if (type === "Invoice") {
      const paymentSummary = await syncInvoicePayments(booksId, dbDoc.id)
      await updateInvoiceRecord({
        localId:        dbDoc.id,
        zohoDoc:        doc,
        calcItems,
        conflictResult,
        paymentSummary: paymentSummary ?? { paymentMade: 0, paymentExpected: null, lastPaymentDate: null, balance: null, paymentCount: 0 },
      })
    } else if (type === "SalesOrder") {
      await updateSalesOrderRecord({ localId: dbDoc.id, zohoDoc: doc, calcItems, conflictResult })
    } else {
      await updateQuoteRecord({ localId: dbDoc.id, zohoDoc: doc, calcItems, conflictResult })
    }

    // Clear pendingZohoFetch in case it was set by a webhook but not by the queue pass
    if (type === "Invoice")
      await prisma.invoice.update({ where: { id: dbDoc.id }, data: { pendingZohoFetch: false } })
    if (type === "SalesOrder")
      await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: { pendingZohoFetch: false } })
    if (type === "Quote")
      await prisma.quote.update({ where: { id: dbDoc.id }, data: { pendingZohoFetch: false } })

    return "synced"
  } catch (e: any) {
    console.error(`syncFullDocument error for ${type} ${booksId}:`, e.message)
    return "skipped"
  }
}
