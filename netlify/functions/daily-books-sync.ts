import { schedule } from "@netlify/functions"
import { Prisma } from "@prisma/client"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "./lib/zoho-auth"
import { prisma } from "./lib/prisma"
import { processInvoiceCostsForSystem } from "./process-invoice-costs"
import { processSalesOrderCostsForSystem } from "./process-salesorder-costs"
import { processQuoteCostsForSystem } from "./process-quote-costs"
import {
  detectConflict,
  syncInvoicePayments,
  updateInvoiceRecord,
  updateSalesOrderRecord,
  updateQuoteRecord,
  syncStoredLineItems,
} from "../../src/lib/sync-engine"
import {
  INACTIVE_SALES_ORDER_STATUS_VARIANTS,
} from "./lib/document-status"
import {
  extractProfit,
  extractDeadProfit,
  extractDeadCostTotal,
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
export interface BooksSyncOptions {
  fullYear?: number
  forceDetails?: boolean
}

export async function runBooksSync(options: BooksSyncOptions = {}) {
  console.log("=== Daily Books Sync Started ===")
  const startTime = Date.now()
  const runStartedAt = new Date()

  try {
    const token   = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    let invoicesSynced = 0, sosSynced = 0, quotesSynced = 0
    let conflictsFlagged = 0, pendingProcessed = 0, newRecordsCreated = 0, accountsCreated = 0

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

    // Documents for a customer with no local Account used to be skipped, and
    // because the skip happens on every run the record never arrived at all.
    // Create the Account instead, owned by the document's salesperson where we
    // can match one and by the house owner otherwise.
    const allUsers = await prisma.user.findMany({ select: { id: true, name: true, role: true, createdAt: true } })
    const userByName = new Map<string, string>()
    allUsers.forEach(u => { if (u.name) userByName.set(u.name.toLowerCase().trim(), u.id) })
    const houseOwnerId = (allUsers.find(u => String(u.role).toUpperCase() === "ADMIN") ?? allUsers[0])?.id ?? null

    const resolveOwnerId = (salespersonName?: string): string | null => {
      const key = String(salespersonName || "").toLowerCase().trim()
      if (key && userByName.has(key)) return userByName.get(key)!
      return houseOwnerId
    }

    const ensureAccountId = async (
      customerZohoId: string | undefined,
      customerName: string | undefined,
      salespersonName: string | undefined,
    ): Promise<string | null> => {
      const existing = resolveAccountId(customerZohoId, customerName, accountByZohoId, accountByName)
      if (existing) return existing
      if (!customerZohoId) return null
      const ownerId = resolveOwnerId(salespersonName)
      if (!ownerId) return null
      try {
        const account = await prisma.account.upsert({
          where: { zohoId: String(customerZohoId) },
          update: {},
          create: {
            zohoId: String(customerZohoId),
            name: String(customerName || "").trim() || `Zoho customer ${customerZohoId}`,
            ownerId,
          },
        })
        accountByZohoId.set(String(customerZohoId), account.id)
        accountByName.set(account.name.toLowerCase().trim(), account.id)
        accountsCreated++
        console.log(`[daily-sync] Created Account for Zoho customer ${customerZohoId} (${customerName})`)
        return account.id
      } catch (e: any) {
        console.error(`[daily-sync] Could not create Account for Zoho customer ${customerZohoId}: ${e.message}`)
        return null
      }
    }

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

    // ── Pass 1b: Cost-calculation backlog drain ───────────────────────────
    // Documents that predate the cost pipeline (or arrived without stored
    // costs) would otherwise force every commission read to compute on the
    // fly forever. Persist calculated costs for a bounded batch each run so
    // the database converges to fully-stored values and page reads stay
    // DB-only. Oldest-first so the backlog shrinks monotonically.
    console.log("--- Pass 1b: cost calculation backlog ---")
    let backlogProcessed = 0
    const BACKLOG_BATCH = 25
    try {
      const staleInvoices = await prisma.invoice.findMany({
        where: {
          status: { notIn: ["void", "voided", "cancelled", "canceled", "deleted"] },
          OR: [
            { items: { path: ["costsCalculatedAt"], equals: Prisma.DbNull } },
            { items: { path: ["costsCalculatedAt"], equals: Prisma.AnyNull } },
          ],
        },
        select: { id: true, zohoId: true },
        orderBy: { issueDate: "asc" },
        take: BACKLOG_BATCH,
      })
      for (const inv of staleInvoices) {
        if (!inv.zohoId) continue
        try {
          await processInvoiceCostsForSystem(inv.zohoId)
          backlogProcessed++
        } catch (e: any) {
          console.warn(`[daily-sync] Backlog cost processing failed for invoice ${inv.zohoId}: ${e.message}`)
        }
      }

      const staleSalesOrders = await prisma.salesOrder.findMany({
        where: {
          status: { notIn: INACTIVE_SALES_ORDER_STATUS_VARIANTS },
          OR: [
            { items: { path: ["costsCalculatedAt"], equals: Prisma.DbNull } },
            { items: { path: ["costsCalculatedAt"], equals: Prisma.AnyNull } },
          ],
        },
        select: { id: true, zohoId: true },
        orderBy: { orderDate: "asc" },
        take: BACKLOG_BATCH,
      })
      for (const so of staleSalesOrders) {
        if (!so.zohoId) continue
        try {
          const soNumber = await prisma.salesOrder.findUnique({ where: { id: so.id }, select: { items: true } })
            .then(r => String(((r?.items as any)?.salesorder_number || (r?.items as any)?.salesOrderNumber || "")).trim() || undefined)
          await processSalesOrderCostsForSystem(so.zohoId, soNumber)
          backlogProcessed++
        } catch (e: any) {
          console.warn(`[daily-sync] Backlog cost processing failed for SO ${so.zohoId}: ${e.message}`)
        }
      }

      const staleQuotes = await prisma.quote.findMany({
        where: {
          OR: [
            { items: { path: ["costsCalculatedAt"], equals: Prisma.DbNull } },
            { items: { path: ["costsCalculatedAt"], equals: Prisma.AnyNull } },
          ],
        },
        select: { id: true, zohoId: true },
        orderBy: { createdAt: "asc" },
        take: BACKLOG_BATCH,
      })
      for (const qt of staleQuotes) {
        if (!qt.zohoId) continue
        try {
          await processQuoteCostsForSystem(qt.zohoId)
          backlogProcessed++
        } catch (e: any) {
          console.warn(`[daily-sync] Backlog cost processing failed for quote ${qt.zohoId}: ${e.message}`)
        }
      }
      console.log(`Pass 1b complete: ${backlogProcessed} backlog documents cost-processed (max ${BACKLOG_BATCH} per type)`)
    } catch (backlogErr: any) {
      console.error("Backlog drain failed (non-fatal):", backlogErr.message)
    }

    // ── Pass 2: Delta sweep ────────────────────────────────────────────────
    // Each module keeps its own cursor. A single shared cursor guarded by one
    // all-or-nothing flag meant a transient failure in any one sweep stopped
    // the cursor advancing for all three — and once it stops it never resumes,
    // so the window stays pinned to the 48-hour fallback and nothing older is
    // ever revisited. Per-module cursors let a healthy sweep keep its progress.
    const CURSOR_KEYS = {
      Invoice: "books_sync_cursor_invoices",
      SalesOrder: "books_sync_cursor_salesorders",
      Quote: "books_sync_cursor_estimates",
    } as const
    const cursorRows = await prisma.systemSetting.findMany({
      where: { key: { in: [...Object.values(CURSOR_KEYS), "books_sync_cursor"] } },
      select: { key: true, value: true },
    })
    const cursorValues = new Map(cursorRows.map(r => [r.key, r.value]))
    const parseCursor = (value?: string | null): Date | null => {
      if (!value) return null
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    // Fall back to the legacy shared key so an existing deployment keeps its
    // place the first time this runs.
    const legacyCursor = parseCursor(cursorValues.get("books_sync_cursor"))
    const sinceFor = (module: keyof typeof CURSOR_KEYS): Date => {
      const stored = parseCursor(cursorValues.get(CURSOR_KEYS[module])) ?? legacyCursor
      // A two-minute overlap protects against clock skew.
      return stored ? new Date(stored.getTime() - 2 * 60 * 1000) : new Date(Date.now() - 48 * 60 * 60 * 1000)
    }
    const fullYear = options.fullYear
    const queryFor = (module: keyof typeof CURSOR_KEYS): string => {
      if (fullYear) return `&date_start=${fullYear}-01-01&date_end=${fullYear}-12-31`
      const since = sinceFor(module)
      console.log(`--- ${module} sweep since ${since.toISOString()} ---`)
      return `&last_modified_time=${encodeURIComponent(since.toISOString().split(".")[0] + "+0000")}`
    }
    const sweepComplete: Record<keyof typeof CURSOR_KEYS, boolean> = {
      Invoice: true, SalesOrder: true, Quote: true,
    }
    const forceDetails = options.forceDetails === true
    if (fullYear) {
      console.log(`--- Full ${fullYear} refresh: every document will be fetched with line-item detail ---`)
    }

    // Invoices
    const invoiceQuery = queryFor("Invoice")
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/invoices?organization_id=${ORG_ID}${invoiceQuery}&page=${page}&per_page=200&sort_column=date&sort_order=D`
        const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { sweepComplete.Invoice = false; console.error(`Invoices page ${page} failed: ${res.status}`); break }
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
            const accountId = await ensureAccountId(inv.customer_id, inv.customer_name, inv.salesperson_name)
            if (!accountId) { console.log(`Skipping invoice ${inv.invoice_id}: no account and none could be created`); continue }
            dbDoc = await prisma.invoice.upsert({
              where: { zohoId: inv.invoice_id },
              update: {},
              create: { zohoId: inv.invoice_id, accountId, invoiceNumber: inv.invoice_number || null, amount: parseFloat(inv.total || '0') || 0, status: inv.status || 'draft', issueDate: inv.date ? new Date(`${inv.date}T12:00:00.000Z`) : new Date(), items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new Invoice ${inv.invoice_id} for ${inv.customer_name}`)
          }
          // Skip if already processed in Pass 1 (pendingZohoFetch already cleared)
          if (forceDetails || !dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, inv.last_modified_time)) {
            const r = await syncFullDocument(token, baseUrl, "Invoice", inv.invoice_id, dbDoc, inv)
            if (r === "conflict") conflictsFlagged++
            invoicesSynced++
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { sweepComplete.Invoice = false; console.error("Invoice sweep error:", e) }

    // Sales Orders
    const salesOrderQuery = queryFor("SalesOrder")
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/salesorders?organization_id=${ORG_ID}${salesOrderQuery}&page=${page}&per_page=200&sort_column=date&sort_order=D`
        const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { sweepComplete.SalesOrder = false; console.error(`SalesOrders page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const orders: any[] = data.salesorders || []
        console.log(`SalesOrder page ${page}: ${orders.length}`)

        for (const so of orders) {
          let dbDoc = await prisma.salesOrder.findFirst({
            where: { zohoId: so.salesorder_id },
            select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
          })
          if (!dbDoc) {
            const accountId = await ensureAccountId(so.customer_id, so.customer_name, so.salesperson_name)
            if (!accountId) { console.log(`Skipping SO ${so.salesorder_id}: no account and none could be created`); continue }
            dbDoc = await prisma.salesOrder.upsert({
              where: { zohoId: so.salesorder_id },
              update: {},
              create: { zohoId: so.salesorder_id, accountId, amount: parseFloat(so.total || '0') || 0, status: so.status || 'draft', orderDate: so.date ? new Date(`${so.date}T12:00:00.000Z`) : new Date(), items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new SalesOrder ${so.salesorder_id} for ${so.customer_name}`)
          }
          if (forceDetails || !dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, so.last_modified_time)) {
            const r = await syncFullDocument(token, baseUrl, "SalesOrder", so.salesorder_id, dbDoc, so)
            if (r === "conflict") conflictsFlagged++
            sosSynced++
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { sweepComplete.SalesOrder = false; console.error("SalesOrder sweep error:", e) }

    // Every estimate status matters operationally, so recurring syncs include all statuses.
    const estimateQuery = queryFor("Quote")
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/estimates?organization_id=${ORG_ID}${estimateQuery}&page=${page}&per_page=200&sort_column=date&sort_order=D`
        const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } })
        if (!res.ok) { sweepComplete.Quote = false; console.error(`Estimates page ${page} failed: ${res.status}`); break }
        const data: any = await res.json()
        const estimates: any[] = data.estimates || []
        console.log(`Estimate page ${page}: ${estimates.length}`)

        for (const est of estimates) {
          let dbDoc = await prisma.quote.findFirst({
            where: { zohoId: est.estimate_id },
            select: { id: true, zohoId: true, status: true, items: true, lastSyncedAt: true, appModifiedAt: true, lastZohoModifiedTime: true }
          })
          if (!dbDoc) {
            const accountId = await ensureAccountId(est.customer_id, est.customer_name, est.salesperson_name)
            if (!accountId) { console.log(`Skipping estimate ${est.estimate_id}: no account and none could be created`); continue }
            dbDoc = await prisma.quote.upsert({
              where: { zohoId: est.estimate_id },
              update: {},
              create: { zohoId: est.estimate_id, accountId, amount: parseFloat(est.total || '0') || 0, status: est.status || 'draft', items: {} }
            })
            newRecordsCreated++
            console.log(`[daily-sync] Created new Quote ${est.estimate_id} for ${est.customer_name}`)
          }
          if (forceDetails || !dbDoc.lastSyncedAt || isStale(dbDoc.lastSyncedAt, est.last_modified_time)) {
            const r = await syncFullDocument(token, baseUrl, "Quote", est.estimate_id, dbDoc, est)
            if (r === "conflict") conflictsFlagged++
            quotesSynced++
          }
        }

        hasMore = data.page_context?.has_more_page === true
        page++
      }
    } catch (e) { sweepComplete.Quote = false; console.error("Estimate sweep error:", e) }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`=== Daily Books Sync Complete in ${elapsed}s ===`)
    console.log(`  Invoices: ${invoicesSynced} | SOs: ${sosSynced} | Quotes: ${quotesSynced}`)
    console.log(`  New records created: ${newRecordsCreated}`)
    console.log(`  Accounts auto-created: ${accountsCreated}`)
    console.log(`  Pending processed: ${pendingProcessed} | Conflicts flagged: ${conflictsFlagged}`)

    // Advance each module's cursor independently. Skipping only the sweep that
    // actually failed keeps one flaky page from freezing discovery for all of
    // them. A full-year refresh does not move cursors: it asks a different
    // question than the delta sweep and its window says nothing about deltas.
    if (!fullYear) {
      for (const module of Object.keys(CURSOR_KEYS) as (keyof typeof CURSOR_KEYS)[]) {
        if (!sweepComplete[module]) {
          console.warn(`${module} cursor not advanced: sweep was incomplete`)
          continue
        }
        await prisma.systemSetting.upsert({
          where: { key: CURSOR_KEYS[module] },
          update: { value: runStartedAt.toISOString() },
          create: { key: CURSOR_KEYS[module], value: runStartedAt.toISOString() },
        })
      }
    }

    return {
      invoicesSynced,
      salesOrdersSynced: sosSynced,
      quotesSynced,
      newRecordsCreated,
      accountsCreated,
      pendingProcessed,
      backlogProcessed,
      conflictsFlagged,
      elapsedSeconds: Number(elapsed),
    }

  } catch (err: any) {
    console.error("Daily Books Sync fatal error:", err)
    throw err
  }
}

export const handler = schedule("0 6 * * *", async () => {
  const result = await runBooksSync()
  return { statusCode: 200, body: JSON.stringify(result) }
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
  // No Zoho timestamp means we cannot prove the local copy is current, so pull
  // the detail rather than assuming it is fresh and leaving it stale forever.
  if (!zohoModTime)  return true
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
    const detailRes = await fetch(`${baseUrl}/${modulePath}/${booksId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
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
