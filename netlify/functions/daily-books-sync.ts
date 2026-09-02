import { schedule } from "@netlify/functions"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "./lib/zoho-auth"
import { prisma } from "./lib/prisma"
import { internalHandler as processInvoiceCosts } from "./process-invoice-costs"
import { internalHandler as processSalesOrderCosts } from "./process-salesorder-costs"
import { internalHandler as processQuoteCosts } from "./process-quote-costs"
import {
  detectConflict,
  syncInvoicePayments,
  updateInvoiceRecord,
  updateSalesOrderRecord,
  updateQuoteRecord,
  syncStoredLineItems,
} from "../../src/lib/sync-engine"
import {
  extractProfit,
  extractDeadProfit,
  extractDeadCostTotal,
  extractCommissionAmount,
  extractVigRate,
  extractActualShippingCost,
  extractShippingCostBreakdown,
} from "../../src/lib/custom-field-extractor"
import { updateSyncState } from "../../src/lib/operational-flow"

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
export interface BooksSyncOptions {
  fullYear?: number
  forceDetails?: boolean
}

export async function runBooksSync(options: BooksSyncOptions = {}) {
  console.log("=== Daily Books Sync Started ===")
  const startTime = Date.now()
  const runStartedAt = new Date()

  try {
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    let invoicesSynced = 0, sosSynced = 0, quotesSynced = 0
    let conflictsFlagged = 0, pendingProcessed = 0, newRecordsCreated = 0
    let syncIncomplete = false

    // One-time local baseline: normalize line items already present in JSON and
    // queue a single detail fetch only for documents whose imported snapshot
    // did not contain line_items. This avoids re-fetching complete documents.
    const lineItemBaseline = await prisma.systemSetting.findUnique({ where: { key: "books_line_items_baselined" } })
    if (lineItemBaseline?.value !== "true") {
      const [invoices, salesOrders, quotes] = await Promise.all([
        prisma.invoice.findMany({ select: { id: true, items: true } }),
        prisma.salesOrder.findMany({ select: { id: true, items: true } }),
        prisma.quote.findMany({ select: { id: true, items: true } }),
      ])

      for (const [docType, docs] of [
        ["invoice", invoices],
        ["salesOrder", salesOrders],
        ["quote", quotes],
      ] as const) {
        for (const doc of docs) {
          const items = (doc.items as Record<string, unknown>) || {}
          const rawLines = items.line_items || items.lineItems
          if (Array.isArray(rawLines)) {
            await syncStoredLineItems(docType, doc.id, rawLines)
          } else if (docType === "invoice") {
            await prisma.invoice.update({ where: { id: doc.id }, data: { pendingZohoFetch: true } })
          } else if (docType === "salesOrder") {
            await prisma.salesOrder.update({ where: { id: doc.id }, data: { pendingZohoFetch: true } })
          } else {
            await prisma.quote.update({ where: { id: doc.id }, data: { pendingZohoFetch: true } })
          }
        }
      }

      await prisma.systemSetting.upsert({
        where: { key: "books_line_items_baselined" },
        update: { value: "true" },
        create: { key: "books_line_items_baselined", value: "true" },
      })
    }

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
      const synced = await syncFullDocument(baseUrl, "Invoice", inv.zohoId, inv)
      if (synced === "conflict") conflictsFlagged++
      if (synced !== "skipped") pendingProcessed++
      else syncIncomplete = true
    }

    const pendingSOs = await prisma.salesOrder.findMany({
      where: { pendingZohoFetch: true },
      select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
    })
    for (const so of pendingSOs) {
      if (!so.zohoId) continue
      const synced = await syncFullDocument(baseUrl, "SalesOrder", so.zohoId, so)
      if (synced === "conflict") conflictsFlagged++
      if (synced !== "skipped") pendingProcessed++
      else syncIncomplete = true
    }

    const pendingQuotes = await prisma.quote.findMany({
      where: { pendingZohoFetch: true },
      select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
    })
    for (const qt of pendingQuotes) {
      if (!qt.zohoId) continue
      const synced = await syncFullDocument(baseUrl, "Quote", qt.zohoId, qt)
      if (synced === "conflict") conflictsFlagged++
      if (synced !== "skipped") pendingProcessed++
      else syncIncomplete = true
    }

    console.log(`Pass 1 complete: ${pendingProcessed} pending records processed, ${conflictsFlagged} conflicts flagged`)

    // ── Pass 2: Delta sweep ────────────────────────────────────────────────
    // Persist a cursor so list calls only discover changes since the previous
    // successful run. A two-minute overlap protects against clock skew.
    const cursorRow = await prisma.systemSetting.findUnique({ where: { key: "books_sync_cursor" } })
    const storedCursor = cursorRow?.value ? new Date(cursorRow.value) : null
    const since = storedCursor && !Number.isNaN(storedCursor.getTime())
      ? new Date(storedCursor.getTime() - 2 * 60 * 1000)
      : new Date(Date.now() - 48 * 60 * 60 * 1000)
    console.log(`--- Pass 2: delta sweep since ${since.toISOString()} ---`)
    const sinceStr = since.toISOString().split(".")[0] + "+0000"
    const fullYear = options.fullYear
    const fullYearQuery = fullYear
      ? `&date_start=${fullYear}-01-01&date_end=${fullYear}-12-31`
      : `&last_modified_time=${encodeURIComponent(sinceStr)}`
    const forceDetails = options.forceDetails === true
    if (fullYear) {
      console.log(`--- Full ${fullYear} refresh: every document will be fetched with line-item detail ---`)
    }

    // Invoices
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/invoices?organization_id=${ORG_ID}${fullYearQuery}&page=${page}&per_page=200&sort_column=date&sort_order=D`
        const res = await fetchBooks(url)
        if (!res.ok) { syncIncomplete = true; console.error(`Invoices page ${page} failed: ${res.status}`); break }
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
            if (!accountId) { await recordUnmatched("INVOICE", inv.invoice_id, inv.invoice_number, inv); continue }
            dbDoc = await prisma.invoice.upsert({
              where: { zohoId: inv.invoice_id },
              update: {},
              create: { zohoId: inv.invoice_id, accountId, amount: parseFloat(inv.total || '0') || 0, status: inv.status || 'draft', issueDate: inv.date ? new Date(inv.date) : new Date(), items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new Invoice ${inv.invoice_id} for ${inv.customer_name}`)
          }
          // Skip if already processed in Pass 1 (pendingZohoFetch already cleared)
          if (forceDetails || !dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, inv.last_modified_time)) {
            const r = await syncFullDocument(baseUrl, "Invoice", inv.invoice_id, dbDoc, inv)
            if (r === "conflict") conflictsFlagged++
            if (r === "synced" || r === "conflict") invoicesSynced++
            else if (r === "skipped") syncIncomplete = true
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { syncIncomplete = true; console.error("Invoice sweep error:", e) }

    // Sales Orders
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/salesorders?organization_id=${ORG_ID}${fullYearQuery}&page=${page}&per_page=200&sort_column=date&sort_order=D`
        const res = await fetchBooks(url)
        if (!res.ok) { syncIncomplete = true; console.error(`SalesOrders page ${page} failed: ${res.status}`); break }
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
            if (!accountId) { await recordUnmatched("SALES_ORDER", so.salesorder_id, so.salesorder_number, so); continue }
            dbDoc = await prisma.salesOrder.upsert({
              where: { zohoId: so.salesorder_id },
              update: {},
              create: { zohoId: so.salesorder_id, accountId, amount: parseFloat(so.total || '0') || 0, status: so.status || 'draft', orderDate: so.date ? new Date(so.date) : new Date(), items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new SalesOrder ${so.salesorder_id} for ${so.customer_name}`)
          }
          if (forceDetails || !dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, so.last_modified_time)) {
            const r = await syncFullDocument(baseUrl, "SalesOrder", so.salesorder_id, dbDoc, so)
            if (r === "conflict") conflictsFlagged++
            if (r === "synced" || r === "conflict") sosSynced++
            else if (r === "skipped") syncIncomplete = true
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { syncIncomplete = true; console.error("SalesOrder sweep error:", e) }

    // Every estimate status matters operationally, so recurring syncs include all statuses.
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/estimates?organization_id=${ORG_ID}${fullYearQuery}&page=${page}&per_page=200&sort_column=date&sort_order=D`
        const res = await fetchBooks(url)
        if (!res.ok) { syncIncomplete = true; console.error(`Estimates page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const estimates: any[] = data.estimates || []
        console.log(`Estimate page ${page}: ${estimates.length}`)

        for (const est of estimates) {
          let dbDoc = await prisma.quote.findFirst({
            where: { zohoId: est.estimate_id },
            select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
          })
          if (!dbDoc) {
            const accountId = resolveAccountId(est.customer_id, est.customer_name, accountByZohoId, accountByName)
            if (!accountId) { await recordUnmatched("QUOTE", est.estimate_id, est.estimate_number, est); continue }
            dbDoc = await prisma.quote.upsert({
              where: { zohoId: est.estimate_id },
              update: {},
              create: { zohoId: est.estimate_id, accountId, amount: parseFloat(est.total || '0') || 0, status: est.status || 'draft', items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new Quote ${est.estimate_id} for ${est.customer_name}`)
          }
          if (forceDetails || !dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, est.last_modified_time)) {
            const r = await syncFullDocument(baseUrl, "Quote", est.estimate_id, dbDoc, est)
            if (r === "conflict") conflictsFlagged++
            if (r === "synced" || r === "conflict") quotesSynced++
            else if (r === "skipped") syncIncomplete = true
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { syncIncomplete = true; console.error("Estimate sweep error:", e) }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`=== Daily Books Sync Complete in ${elapsed}s ===`)
    console.log(`  Invoices: ${invoicesSynced} | SOs: ${sosSynced} | Quotes: ${quotesSynced}`)
    console.log(`  New records created: ${newRecordsCreated}`)
    console.log(`  Pending processed: ${pendingProcessed} | Conflicts flagged: ${conflictsFlagged}`)

    if (!syncIncomplete) {
      await prisma.systemSetting.upsert({
        where: { key: "books_sync_cursor" },
        update: { value: runStartedAt.toISOString() },
        create: { key: "books_sync_cursor", value: runStartedAt.toISOString() },
      })
      await Promise.all(["invoice", "salesorder", "quote"].map(entityType => updateSyncState({ entityType, kind: "success", cursor: runStartedAt.toISOString(), processedCount: invoicesSynced + sosSynced + quotesSynced, durationMs: Date.now() - startTime })))
    } else {
      console.warn("Books sync cursor was not advanced because a sweep was incomplete")
      await Promise.all(["invoice", "salesorder", "quote"].map(entityType => updateSyncState({ entityType, kind: "failure", error: "One or more Zoho sweep pages were incomplete", durationMs: Date.now() - startTime })))
    }

    return {
      complete: !syncIncomplete,
      invoicesSynced,
      salesOrdersSynced: sosSynced,
      quotesSynced,
      newRecordsCreated,
      pendingProcessed,
      conflictsFlagged,
      elapsedSeconds: Number(elapsed),
    }

  } catch (err: any) {
    console.error("Daily Books Sync fatal error:", err)
    await updateSyncState({ entityType: "all", kind: "failure", error: err?.message || "Fatal Zoho Books sync failure", durationMs: Date.now() - startTime }).catch(() => undefined)
    throw err
  }
}

export const handler = schedule("0 6 * * *", async () => {
  const result = await runBooksSync()
  return { statusCode: result.complete ? 200 : 503, body: JSON.stringify(result) }
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
  // Names are not immutable identifiers. A name match is proposed in the
  // exception inbox instead of being applied to a financial document.
  return null
}

async function recordUnmatched(entityType: string, externalId: string, externalNumber: string | undefined, payload: any) {
  const customerName = String(payload?.customer_name || "").trim()
  const candidates = customerName ? await prisma.account.findMany({ where: { name: { equals: customerName, mode: "insensitive" } }, select: { id: true, zohoId: true, name: true }, take: 5 }) : []
  await prisma.integrationException.upsert({
    where: { integration_entityType_externalId_exceptionType: { integration: "ZOHO_BOOKS", entityType, externalId: String(externalId), exceptionType: "ACCOUNT_MATCH_REQUIRED" } },
    create: { integration: "ZOHO_BOOKS", entityType, externalId: String(externalId), externalNumber: externalNumber ? String(externalNumber) : null, exceptionType: "ACCOUNT_MATCH_REQUIRED", summary: `${entityType} ${externalNumber || externalId} needs an account match`, payload, proposedMatches: candidates, confidence: candidates.length === 1 ? 0.75 : null },
    update: { externalNumber: externalNumber ? String(externalNumber) : null, summary: `${entityType} ${externalNumber || externalId} needs an account match`, payload, proposedMatches: candidates, confidence: candidates.length === 1 ? 0.75 : null, status: "OPEN", resolvedAt: null },
  })
  console.warn(`[daily-sync] Quarantined ${entityType} ${externalId}: immutable customer id was not matched`)
}

/** Returns true if the local record is stale relative to Zoho's modified time */
function isStale(lastSyncedAt: Date | null, zohoModTime: string | undefined): boolean {
  if (!lastSyncedAt) return true
  if (!zohoModTime)  return false
  return new Date(zohoModTime).getTime() > lastSyncedAt.getTime()
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

/**
 * Fetch Zoho Books with a current access token and bounded recovery for the two
 * transient failures seen during long reconciliations: token replacement (401)
 * and provider throttling (429). The final response is returned to the caller so
 * an exhausted retry budget still marks the sweep incomplete.
 */
async function fetchBooks(url: string): Promise<Response> {
  let forceTokenRefresh = false
  let response: Response | null = null

  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await getZohoAccessToken(forceTokenRefresh)
    forceTokenRefresh = false
    response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (response.status === 401 && attempt < 3) {
      forceTokenRefresh = true
      continue
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfterSeconds = Number.parseInt(response.headers.get("retry-after") || "", 10)
      const fallbackSeconds = 5 * (2 ** attempt)
      await wait(Math.min(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : fallbackSeconds, 30) * 1000)
      continue
    }

    return response
  }

  if (!response) throw new Error("Zoho Books request did not produce a response")
  return response
}

async function markMissingBooksDocument(
  type: "Invoice" | "SalesOrder" | "Quote",
  localId: string,
): Promise<void> {
  const data = { status: "orphaned", pendingZohoFetch: false, lastSyncedAt: new Date() }
  if (type === "Invoice") await prisma.invoice.update({ where: { id: localId }, data })
  if (type === "SalesOrder") await prisma.salesOrder.update({ where: { id: localId }, data })
  if (type === "Quote") await prisma.quote.update({ where: { id: localId }, data })
}

/**
 * Fetch the full detail for a document from Zoho and sync it to the local DB.
 * Uses sync-engine for conflict detection.
 * Returns "conflict" | "synced" | "skipped"
 */
async function syncFullDocument(
  baseUrl:  string,
  type:     "Invoice" | "SalesOrder" | "Quote",
  booksId:  string,
  dbDoc:    { id: string; zohoId: string | null; status: string | null; items: any; lastSyncedAt: Date | null; appModifiedAt: Date | null; lastZohoModifiedTime: Date | null },
  summary?: any // list-level summary from a sweep (may not have line_items)
): Promise<"conflict" | "synced" | "not_found" | "skipped"> {
  try {
    const modulePath = type === "Invoice" ? "invoices" : type === "SalesOrder" ? "salesorders" : "estimates"
    const detailRes = await fetchBooks(`${baseUrl}/${modulePath}/${booksId}?organization_id=${ORG_ID}`)
    if (detailRes.status === 404) {
      await markMissingBooksDocument(type, dbDoc.id)
      console.warn(`Marked missing ${type} ${booksId} as orphaned`)
      return "not_found"
    }
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
        items:               dbDoc.items,
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
      deadProfitActual:    extractDeadProfit(doc, Number(doc.sub_total)) ?? currentItems.deadProfitActual ?? 0,
      deadCostTotal:       extractDeadCostTotal(doc)    ?? currentItems.deadCostTotal    ?? 0,
      commission:          extractCommissionAmount(doc) || currentItems.commission       || 0,
      commissionPercent:   parseFloat((cfh.cf_commision_from_profit_unformatted as string) ?? (currentItems.commissionPercent as string) ?? "50") || 50,
      vigRate:             extractVigRate(doc)          || currentItems.vigRate          || currentItems.vig || 1.3,
      vig:                 extractVigRate(doc)          || currentItems.vig              || currentItems.vigRate || 1.3,
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
