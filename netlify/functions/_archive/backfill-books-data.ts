/**
 * backfill-books-data.ts
 *
 * One-time backfill function to populate full line items + Books IDs for all
 * local Invoice, SalesOrder, and Quote records.
 *
 * USAGE (call from Admin panel or browser):
 *   GET /.netlify/functions/backfill-books-data?phase=1          ← Map doc numbers to Books IDs (fast, ~2 min)
 *   GET /.netlify/functions/backfill-books-data?phase=2          ← Fetch line items for all uncached records
 *   GET /.netlify/functions/backfill-books-data?status=1         ← Check current progress
 *   GET /.netlify/functions/backfill-books-data?phase=2&reset=1  ← Reset phase 2 checkpoint and restart
 *
 * Phase 1: Enumerates all Zoho Books list pages (200/page) to map
 *          doc numbers → Books IDs. Saves Books IDs into local items JSON.
 *          ~80 API calls, runs in ~3 min.
 *
 * Phase 2: For every uncached record (no line_items), fetches the full
 *          detail from Zoho Books and writes line_items + custom_fields to DB.
 *          Processes BATCH_SIZE records per invocation (rate-limited).
 *          Saves a checkpoint in SystemSetting so each call continues where
 *          the last one left off. Call repeatedly until complete.
 *
 * Rate limit: ~50 calls/min (1200ms between calls) — safe under Zoho's 100/min cap.
 */

import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
import {
  extractProfit,
  extractCommissionAmount,
  extractVigRate,
  extractDeadCostTotal,
  extractCcFees,
  extractAdditionalCosts,
  extractInsurance,
  extractActualShippingCost,
  extractShippingCostBreakdown
} from "../../src/lib/custom-field-extractor"
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const BASE_URL = `https://www.zohoapis.${ZOHO_DC}/books/v3`

// How many records to process per Phase 2 invocation (fits in 26s Netlify timeout)
// 12 records × 1.3s rate delay = ~16s minimum, leaving 10s headroom for DB writes
const BATCH_SIZE = 12
const PHASE3_BATCH_SIZE = 5
// Delay between Zoho API calls in ms (50 calls/min = 1200ms)
const RATE_DELAY_MS = 1300

const CHECKPOINT_KEY = 'backfill_books_checkpoint'

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Save checkpoint to DB ──
async function saveCheckpoint(data: object) {
  await prisma.systemSetting.upsert({
    where: { key: CHECKPOINT_KEY },
    update: { value: JSON.stringify(data) },
    create: { key: CHECKPOINT_KEY, value: JSON.stringify(data) },
  })
}

// ── Read checkpoint from DB ──
async function readCheckpoint(): Promise<any> {
  const row = await prisma.systemSetting.findUnique({ where: { key: CHECKPOINT_KEY } })
  if (!row) return {}
  try { return JSON.parse(row.value) } catch { return {} }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  const { phase, status, reset } = event.queryStringParameters || {}

  // ── STATUS CHECK ──
  if (status === '1') {
    const cp = await readCheckpoint()
    const [invTotal, soTotal, qtTotal] = await Promise.all([
      prisma.invoice.count(),
      prisma.salesOrder.count(),
      prisma.quote.count(),
    ])
    const [invCached, soCached, qtCached, invHasId, soHasId, qtHasId] = await Promise.all([
      prisma.invoice.count({ where: { items: { path: ['line_items'], not: [] } } }).catch(() => 0),
      prisma.salesOrder.count({ where: { items: { path: ['line_items'], not: [] } } }).catch(() => 0),
      prisma.quote.count({ where: { items: { path: ['line_items'], not: [] } } }).catch(() => 0),
      prisma.invoice.count({ where: { items: { path: ['booksInvoiceId'], not: '' } } }).catch(() => 0),
      prisma.salesOrder.count({ where: { items: { path: ['booksSalesOrderId'], not: '' } } }).catch(() => 0),
      prisma.quote.count({ where: { items: { path: ['booksEstimateId'], not: '' } } }).catch(() => 0),
    ])
    return {
      statusCode: 200, headers: cors, body: JSON.stringify({
        checkpoint: cp,
        totals: { invoices: invTotal, salesOrders: soTotal, quotes: qtTotal, total: invTotal + soTotal + qtTotal },
        cached: { invoices: invCached, salesOrders: soCached, quotes: qtCached, total: invCached + soCached + qtCached },
        hasBookId: { invoices: invHasId, salesOrders: soHasId, quotes: qtHasId, total: invHasId + soHasId + qtHasId },
      })
    }
  }

  // ── PHASE 1: Map doc numbers → Books IDs ──
  if (phase === '1') {
    const cp = await readCheckpoint()

    // ── Reset ──
    if (reset === '1') {
      await saveCheckpoint({ ...cp, phase1Module: 'invoices', phase1Page: 1, phase1Mapped: 0, phase1Skipped: 0, phase1NotFound: 0, phase1DupGuarded: 0, phase1Done: false })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: 'Phase 1 checkpoint reset.' }) }
    }

    const types: Array<{ module: string, idField: string, numField: string, dbModel: 'invoice' | 'salesOrder' | 'quote', itemsKey: string, statusFilter?: string }> = [
      { module: 'invoices',    idField: 'invoice_id',    numField: 'invoice_number',    dbModel: 'invoice',     itemsKey: 'booksInvoiceId' },
      { module: 'salesorders', idField: 'salesorder_id', numField: 'salesorder_number', dbModel: 'salesOrder',  itemsKey: 'booksSalesOrderId' },
      // Fetch all estimates to make sure open/sent ones are also matched
      { module: 'estimates',   idField: 'estimate_id',   numField: 'estimate_number',   dbModel: 'quote',       itemsKey: 'booksEstimateId' },
    ]
    const moduleNames = types.map(t => t.module)

    // Resume from checkpoint
    const currentModule: string = cp.phase1Module || 'invoices'
    const currentPage: number   = parseInt(cp.phase1Page || '1', 10)
    let totalMapped       = parseInt(cp.phase1Mapped     || '0', 10)
    let totalSkipped      = parseInt(cp.phase1Skipped    || '0', 10)
    let totalNotFound     = parseInt(cp.phase1NotFound   || '0', 10)
    let totalDupGuarded   = parseInt(cp.phase1DupGuarded || '0', 10)

    const t = types.find(x => x.module === currentModule)
    if (!t) {
      // All modules exhausted → done
      await saveCheckpoint({ ...cp, phase1Done: true, phase1CompletedAt: new Date().toISOString() })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, phase: 1, done: true, totalMapped, message: 'Phase 1 complete!' }) }
    }

    // ── Exact-match helper ──────────────────────────────────────────────────
    async function findLocalRecord(model: 'invoice' | 'salesOrder' | 'quote', booksId: string, docNum: string): Promise<any | null> {
      const bare = docNum.replace(/^(INV|SO|EST|Q|QU|SB)-?/i, '').trim()
      const exactCandidates = Array.from(new Set([docNum, bare]))
      const findOpts = (jsonKey: string) => exactCandidates.map(v => ({ items: { path: [jsonKey], equals: v } }))

      if (model === 'invoice') {
        const byBooksId = await prisma.invoice.findFirst({ where: { items: { path: ['booksInvoiceId'], equals: booksId } } })
        if (byBooksId) return byBooksId
        for (const cond of findOpts('invoiceNumber')) {
          const r = await prisma.invoice.findFirst({ where: cond }).catch(() => null)
          if (r) return r
        }
        return null
      }
      if (model === 'salesOrder') {
        const byBooksId = await prisma.salesOrder.findFirst({ where: { items: { path: ['booksSalesOrderId'], equals: booksId } } })
        if (byBooksId) return byBooksId
        for (const cond of findOpts('salesOrderNumber')) {
          const r = await prisma.salesOrder.findFirst({ where: cond }).catch(() => null)
          if (r) return r
        }
        return null
      }
      const byBooksId = await prisma.quote.findFirst({ where: { items: { path: ['booksEstimateId'], equals: booksId } } })
      if (byBooksId) return byBooksId
      for (const cond of findOpts('estimateNumber')) {
        const r = await prisma.quote.findFirst({ where: cond }).catch(() => null)
        if (r) return r
      }
      return null
    }

    // ── Books-ID uniqueness guard ──────────────────────────────────────────
    async function booksIdAlreadyAssigned(model: 'invoice' | 'salesOrder' | 'quote', itemsKey: string, booksId: string, localId: string): Promise<boolean> {
      try {
        if (model === 'invoice') {
          const existing = await prisma.invoice.findFirst({ where: { items: { path: [itemsKey], equals: booksId } } })
          return existing !== null && existing.id !== localId
        }
        if (model === 'salesOrder') {
          const existing = await prisma.salesOrder.findFirst({ where: { items: { path: [itemsKey], equals: booksId } } })
          return existing !== null && existing.id !== localId
        }
        const existing = await prisma.quote.findFirst({ where: { items: { path: [itemsKey], equals: booksId } } })
        return existing !== null && existing.id !== localId
      } catch { return false }
    }

    // ── Fetch ONE Zoho list page ───────────────────────────────────────────
    // For estimates: only pull status=invoiced (converted to invoice) records
    const statusParam = t.statusFilter ? `&status=${t.statusFilter}` : ''
    const token = await getZohoAccessToken()
    const res = await fetch(
      `${BASE_URL}/${t.module}?organization_id=${ORG_ID}&page=${currentPage}&per_page=200${statusParam}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )
    if (!res.ok) {
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: `Zoho API error on ${t.module} page ${currentPage}: HTTP ${res.status}` }) }
    }

    const data: any = await res.json()
    const records: any[] = data[t.module] || []
    let mapped = 0, skipped = 0, notFound = 0, dupGuarded = 0

    for (const rec of records) {
      const booksId = rec[t.idField]
      const docNum  = rec[t.numField]
      if (!booksId || !docNum) continue

      // Second guard: if this module requires a status filter, skip non-matching records
      if (t.statusFilter && rec.status && rec.status.toLowerCase() !== t.statusFilter.toLowerCase()) {
        skipped++; continue
      }

      const dbDoc = await findLocalRecord(t.dbModel, booksId, docNum)
      if (!dbDoc) { notFound++; continue }

      const currentItems = (dbDoc.items as any) || {}

      if (currentItems[t.itemsKey] === booksId) { skipped++; continue }

      if (currentItems[t.itemsKey] && currentItems[t.itemsKey] !== booksId) {
        console.warn(`⚠ ${t.dbModel} ${dbDoc.id} already has ${t.itemsKey}=${currentItems[t.itemsKey]}, would overwrite — skipping`)
        skipped++; continue
      }

      if (await booksIdAlreadyAssigned(t.dbModel, t.itemsKey, booksId, dbDoc.id)) {
        console.warn(`⚠ Books ID ${booksId} already on another ${t.dbModel} — skipping`)
        dupGuarded++; continue
      }

      currentItems[t.itemsKey] = booksId
      if (!currentItems.invoiceNumber   && t.dbModel === 'invoice')    currentItems.invoiceNumber   = docNum
      if (!currentItems.salesOrderNumber && t.dbModel === 'salesOrder') currentItems.salesOrderNumber = docNum
      if (!currentItems.estimateNumber  && t.dbModel === 'quote')      currentItems.estimateNumber  = docNum

       try {
        if (t.dbModel === 'invoice')     await prisma.invoice.update({ where: { id: dbDoc.id }, data: { items: currentItems, zohoId: booksId } })
        else if (t.dbModel === 'salesOrder') await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: { items: currentItems, zohoId: booksId } })
        else                             await prisma.quote.update({ where: { id: dbDoc.id }, data: { items: currentItems, zohoId: booksId } })
        mapped++
      } catch (e: any) { console.error(`Failed to update ${t.dbModel} ${dbDoc.id}:`, e.message) }
    }

    totalMapped     += mapped
    totalSkipped    += skipped
    totalNotFound   += notFound
    totalDupGuarded += dupGuarded

    const hasMore = data.page_context?.has_more_page === true

    // Advance checkpoint: next page in same module, or move to next module
    let nextModule = currentModule
    let nextPage   = currentPage + 1
    let done       = false

    if (!hasMore) {
      const nextModuleIndex = moduleNames.indexOf(currentModule) + 1
      if (nextModuleIndex >= moduleNames.length) {
        done = true
        nextModule = ''
        nextPage = 1
      } else {
        nextModule = moduleNames[nextModuleIndex]
        nextPage = 1
      }
    }

    await saveCheckpoint({
      ...cp,
      phase1Module: nextModule, phase1Page: nextPage,
      phase1Mapped: totalMapped, phase1Skipped: totalSkipped,
      phase1NotFound: totalNotFound, phase1DupGuarded: totalDupGuarded,
      phase1Done: done,
      ...(done ? { phase1CompletedAt: new Date().toISOString() } : {}),
    })

    // Estimate total pages: invoices ~39, salesorders ~2, estimates ~39 ≈ 80
    const TOTAL_PAGES_EST = 80
    const pagesProcessed = (moduleNames.indexOf(done ? moduleNames[moduleNames.length-1] : currentModule)) * 1 + currentPage
    const pct = Math.min(99, Math.round((pagesProcessed / TOTAL_PAGES_EST) * 100))

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        success: true, phase: 1, done,
        page: currentPage, module: currentModule,
        pageMapped: mapped, pageSkipped: skipped, pageNotFound: notFound, pageDupGuarded: dupGuarded,
        totalMapped, totalSkipped, totalDupGuarded,
        percentComplete: done ? 100 : pct,
        callAgain: !done,
        message: done
          ? `Phase 1 complete! ${totalMapped} IDs mapped, ${totalDupGuarded} duplicates prevented.`
          : `${currentModule} page ${currentPage}: +${mapped} mapped. ${hasMore ? 'More pages in this module.' : `Moving to next module.`} Call again to continue.`
      })
    }
  }

  // ── PHASE 2: Fetch full detail (line items) for all uncached records ──
  if (phase === '2') {
    const cp = await readCheckpoint()

    if (reset === '1') {
      await saveCheckpoint({ ...cp, phase2Offset: 0, phase2FailedIds: [], phase2Reset: new Date().toISOString(), phase2Processed: 0, phase2Done: false })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: 'Phase 2 checkpoint reset.' }) }
    }

    const offset = parseInt(cp.phase2Offset || '0', 10)
    const failedIds: string[] = cp.phase2FailedIds || []
    const token = await getZohoAccessToken()

    console.log(`=== Backfill Phase 2: offset=${offset}, batch=${BATCH_SIZE} ===`)

    async function getUncachedIds(model: 'Invoice' | 'SalesOrder' | 'Quote', failedIds: string[], limit: number): Promise<string[]> {
      const failedCond = failedIds.length > 0 
        ? `AND id NOT IN (${failedIds.map(id => `'${id}'`).join(',')})`
        : '';
      const idKey = model === 'Invoice' ? 'booksInvoiceId'
        : model === 'SalesOrder' ? 'booksSalesOrderId'
        : 'booksEstimateId';

      const sql = `
        SELECT id FROM "${model}"
        WHERE (items->'line_items' IS NULL OR items->'line_items' = '[]'::jsonb)
        AND ("zohoId" IS NOT NULL AND "zohoId" != '' OR items->>'${idKey}' IS NOT NULL AND items->>'${idKey}' != '')
        ${failedCond}
        LIMIT ${limit}
      `;
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(sql).catch(() => []);
      return rows.map(r => r.id);
    }

    async function countUncached(model: 'Invoice' | 'SalesOrder' | 'Quote', failedIds: string[]): Promise<number> {
      const failedCond = failedIds.length > 0 
        ? `AND id NOT IN (${failedIds.map(id => `'${id}'`).join(',')})`
        : '';
      const idKey = model === 'Invoice' ? 'booksInvoiceId'
        : model === 'SalesOrder' ? 'booksSalesOrderId'
        : 'booksEstimateId';

      const sql = `
        SELECT COUNT(*)::int as count FROM "${model}"
        WHERE (items->'line_items' IS NULL OR items->'line_items' = '[]'::jsonb)
        AND ("zohoId" IS NOT NULL AND "zohoId" != '' OR items->>'${idKey}' IS NOT NULL AND items->>'${idKey}' != '')
        ${failedCond}
      `;
      const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(sql).catch(() => [{ count: 0 }]);
      return rows[0]?.count || 0;
    }

    // Query uncached records directly from database using robust raw SQL
    const invUncachedIds = await getUncachedIds('Invoice', failedIds, BATCH_SIZE)
    const invUncached = await prisma.invoice.findMany({
      where: { id: { in: invUncachedIds } },
      select: { id: true, zohoId: true, items: true, status: true }
    })

    const soUncachedIds = await getUncachedIds('SalesOrder', failedIds, BATCH_SIZE)
    const soUncached = await prisma.salesOrder.findMany({
      where: { id: { in: soUncachedIds } },
      select: { id: true, zohoId: true, items: true, status: true }
    })

    const qtUncachedIds = await getUncachedIds('Quote', failedIds, BATCH_SIZE)
    const qtUncached = await prisma.quote.findMany({
      where: { id: { in: qtUncachedIds } },
      select: { id: true, zohoId: true, items: true, status: true }
    })

    type DocRef = { id: string; booksId: string; model: 'invoice' | 'salesOrder' | 'quote'; status: string }
    const batch: DocRef[] = []

    for (const r of invUncached) {
      if (batch.length >= BATCH_SIZE) break
      const bid = r.zohoId || (r.items as any)?.booksInvoiceId
      if (bid) {
        batch.push({ id: r.id, booksId: bid, model: 'invoice', status: r.status || '' })
      }
    }

    if (batch.length < BATCH_SIZE) {
      for (const r of soUncached) {
        if (batch.length >= BATCH_SIZE) break
        const bid = r.zohoId || (r.items as any)?.booksSalesOrderId
        if (bid) {
          batch.push({ id: r.id, booksId: bid, model: 'salesOrder', status: r.status || '' })
        }
      }
    }

    if (batch.length < BATCH_SIZE) {
      for (const r of qtUncached) {
        if (batch.length >= BATCH_SIZE) break
        const bid = r.zohoId || (r.items as any)?.booksEstimateId
        if (bid) {
          batch.push({ id: r.id, booksId: bid, model: 'quote', status: r.status || '' })
        }
      }
    }

    // Count remaining uncached records
    const [invLeft, soLeft, qtLeft] = await Promise.all([
      countUncached('Invoice', failedIds),
      countUncached('SalesOrder', failedIds),
      countUncached('Quote', failedIds)
    ])

    const remaining = invLeft + soLeft + qtLeft
    const totalUncached = remaining

    if (batch.length === 0) {
      await saveCheckpoint({ ...cp, phase2Done: true, phase2CompletedAt: new Date().toISOString() })
      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({
          success: true,
          phase: 2,
          done: true,
          batchProcessed: 0,
          batchErrors: 0,
          offset: offset,
          totalUncached: 0,
          remaining: 0,
          percentComplete: 100,
          etaMinutesRemaining: 0,
          callAgain: false,
          message: 'All records backfilled!'
        })
      }
    }

    let processed = 0, errors = 0
    const newFailedIds = [...failedIds]

    for (const doc of batch) {
      await sleep(RATE_DELAY_MS)
      try {
        const modPath = doc.model === 'invoice' ? 'invoices' : doc.model === 'salesOrder' ? 'salesorders' : 'estimates'
        const detailRes = await fetch(
          `${BASE_URL}/${modPath}/${doc.booksId}?organization_id=${ORG_ID}`,
          { headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json' } }
        )
        if (!detailRes.ok) {
          errors++
          newFailedIds.push(doc.id)
          console.warn(`Detail fetch failed for ${doc.booksId}: ${detailRes.status}`)
          continue
        }

        const detailData: any = await detailRes.json()
        if (detailData.code !== 0) {
          errors++
          newFailedIds.push(doc.id)
          continue
        }

        const zohoDoc = detailData.invoice || detailData.salesorder || detailData.estimate
        if (!zohoDoc) {
          errors++
          newFailedIds.push(doc.id)
          continue
        }

        // Read current items, merge in the fetched data
        let currentDoc: any = null
        if (doc.model === 'invoice') currentDoc = await prisma.invoice.findUnique({ where: { id: doc.id } })
        else if (doc.model === 'salesOrder') currentDoc = await prisma.salesOrder.findUnique({ where: { id: doc.id } })
        else currentDoc = await prisma.quote.findUnique({ where: { id: doc.id } })
        if (!currentDoc) {
          errors++
          newFailedIds.push(doc.id)
          continue
        }

        const currentItems = (currentDoc.items as any) || {}
        currentItems.line_items = zohoDoc.line_items || []
        currentItems.custom_fields = zohoDoc.custom_fields || []
        currentItems.sub_total = parseFloat(zohoDoc.sub_total || 0)
        currentItems.balance = zohoDoc.balance ?? 0
        currentItems.customer_name = zohoDoc.customer_name || currentItems.customer_name || ''
        currentItems.shippingCharge = parseFloat(zohoDoc.shipping_charge || 0)
        if (zohoDoc.salesperson_name) currentItems.salesperson = zohoDoc.salesperson_name.toUpperCase().trim()
        if (zohoDoc.last_payment_date) currentItems.paymentDate = zohoDoc.last_payment_date
        currentItems.lastSyncedAt = new Date().toISOString()

        // Status resolution
        let status = currentDoc.status
        const zs = (zohoDoc.status || '').toLowerCase()
        if (zs === 'paid' || zohoDoc.balance === 0 || zs === 'closed' || zs === 'invoiced') status = 'Paid'
        else if (zs === 'void' || zs === 'voided') status = 'Void'
        else if (zs === 'writeoff' || zs === 'write_off') status = 'Writeoff'
        else if (zs === 'draft') status = 'Draft'
        else if (zohoDoc.status) status = zohoDoc.status.charAt(0).toUpperCase() + zohoDoc.status.slice(1)

        if (doc.model === 'invoice') await prisma.invoice.update({ where: { id: doc.id }, data: { status, items: currentItems, zohoId: doc.booksId } })
        else if (doc.model === 'salesOrder') await prisma.salesOrder.update({ where: { id: doc.id }, data: { status, items: currentItems, zohoId: doc.booksId } })
        else await prisma.quote.update({ where: { id: doc.id }, data: { status, items: currentItems, zohoId: doc.booksId } })

        processed++
      } catch (e: any) {
        errors++
        newFailedIds.push(doc.id)
        console.error(`Error processing ${doc.model} ${doc.id}:`, e.message)
      }
    }

    const [invTotal, soTotal, qtTotal] = await Promise.all([
      prisma.invoice.count(),
      prisma.salesOrder.count(),
      prisma.quote.count(),
    ])
    const totalRecords = invTotal + soTotal + qtTotal
    const cachedRecords = Math.max(0, totalRecords - remaining)
    const pct = totalRecords > 0 ? Math.round((cachedRecords / totalRecords) * 100) : 0
    const etaMin = Math.ceil((remaining * RATE_DELAY_MS) / 60000)

    const newOffset = offset + processed
    await saveCheckpoint({
      ...cp,
      phase2Offset: newOffset,
      phase2LastRun: new Date().toISOString(),
      phase2Processed: (cp.phase2Processed || 0) + processed,
      phase2FailedIds: newFailedIds
    })

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        success: true,
        phase: 2,
        done: remaining <= 0,
        batchProcessed: processed,
        batchErrors: errors,
        offset: newOffset,
        totalUncached,
        remaining,
        percentComplete: remaining <= 0 ? 100 : pct,
        etaMinutesRemaining: etaMin,
        callAgain: remaining > 0,
        message: remaining <= 0
          ? 'All records backfilled!'
          : `${pct}% done — ${remaining} records left (~${etaMin} min remaining). Call phase=2 again to continue.`
      })
    }
  }

  // ── PHASE 3: Full recalculate & fill ALL custom fields ──
  // Fetches detail from Zoho, runs calculateDocumentCosts, stores everything locally,
  // and pushes calculated values back to Zoho for any empty fields.
  // Processes invoices, SOs, and quotes.
  if (phase === '3') {
    const { calculateDocumentCosts } = await import('./lib/cost-calculations')
    const cp = await readCheckpoint()

    // Reset
    if (reset === '1') {
      await saveCheckpoint({ ...cp, phase3Offset: 0, phase3Processed: 0, phase3Errors: 0, phase3Pushed: 0, phase3Done: false, phase3DocType: 'Invoice' })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: 'Phase 3 checkpoint reset.' }) }
    }

    const token = await getZohoAccessToken()
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    const offset = parseInt(cp.phase3Offset || '0', 10)
    // Cycle through doc types: Invoice → SalesOrder → Quote
    const currentDocType: string = cp.phase3DocType || 'Invoice'

    // Find records with a Books ID (so we can fetch detail)
    let batch: any[] = []
    const booksIdPath = currentDocType === 'Invoice' ? 'booksInvoiceId'
      : currentDocType === 'SalesOrder' ? 'booksSalesOrderId'
      : 'booksEstimateId'
    const model = currentDocType === 'Invoice' ? prisma.invoice
      : currentDocType === 'SalesOrder' ? prisma.salesOrder
      : prisma.quote
    const orderField = currentDocType === 'Invoice' ? 'issueDate'
      : currentDocType === 'SalesOrder' ? 'orderDate'
      : 'issueDate'

    const where: any = {
      status: { notIn: ['Void', 'void'] },
    }

    if (currentDocType === 'Invoice') {
      where.OR = [
        { zohoId: { not: '' } },
        { items: { path: ['booksInvoiceId'], not: '' } }
      ]
    } else if (currentDocType === 'SalesOrder') {
      where.OR = [
        { zohoId: { not: null, notIn: [''] } },
        { items: { path: ['booksSalesOrderId'], not: '' } }
      ]
    } else {
      where.OR = [
        { zohoId: { not: null, notIn: [''] } },
        { items: { path: ['booksEstimateId'], not: '' } }
      ]
    }

    try {
      batch = await (model as any).findMany({
        where,
        select: { id: true, items: true, zohoId: true },
        skip: offset,
        take: PHASE3_BATCH_SIZE,
        orderBy: { [orderField]: 'desc' },
      })
    } catch (e: any) {
      console.error(`Phase 3 findMany error for ${currentDocType}:`, e.message)
      batch = []
    }

    // If no records left for this doc type, move to next
    if (batch.length === 0 && currentDocType !== 'Quote') {
      const nextType = currentDocType === 'Invoice' ? 'SalesOrder' : 'Quote'
      await saveCheckpoint({ ...cp, phase3DocType: nextType, phase3Offset: 0 })
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        success: true, phase: 3, done: false,
        message: `Finished ${currentDocType}s. Moving to ${nextType}s — call phase=3 again.`,
        callAgain: true,
      }) }
    }

    if (batch.length === 0) {
      await saveCheckpoint({ ...cp, phase3Done: true })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, phase: 3, done: true, message: 'All records fully processed!' }) }
    }

    let processed = 0, errors = 0, pushed = 0
    const results: any[] = []

    const zohoModule = currentDocType === 'Invoice' ? 'invoices'
      : currentDocType === 'SalesOrder' ? 'salesorders'
      : 'estimates'
    const zohoDocKey = currentDocType === 'Invoice' ? 'invoice'
      : currentDocType === 'SalesOrder' ? 'salesorder'
      : 'estimate'

    for (const record of batch) {
      try {
        const items = (record.items as any) || {}
        const booksId = record.zohoId || items[booksIdPath]
        if (!booksId) { errors++; continue }

        await sleep(RATE_DELAY_MS)

        // 1. Fetch full detail from Zoho
        const detailRes = await fetch(`${BASE_URL}/${zohoModule}/${booksId}?organization_id=${ORG_ID}`, { headers: authHeaders })
        if (!detailRes.ok) { errors++; continue }
        const detailData: any = await detailRes.json()
        if (detailData.code !== 0) { errors++; continue }
        const doc = detailData[zohoDocKey]
        if (!doc) { errors++; continue }

        // 1b. Check if invoice is paid
        const isPaidInvoice = currentDocType === 'Invoice' && (doc.status?.toLowerCase() === 'paid' || doc.balance === 0 || parseFloat(doc.balance || 0) <= 0)

        // 1c. Unpaid Tariff Logic: If unpaid and no tariff exists (and remove tariff is false), add it
        let shouldAddTariff = false
        let tariffAmount = 0
        if (currentDocType === 'Invoice' && !isPaidInvoice) {
          const existingAdjustment = parseFloat(doc.adjustment || 0)
          const removeTariff = doc.custom_fields?.some((f: any) => f.label?.toUpperCase().includes('REMOVE TARIFF') && (f.value === true || f.value === 'true'))
          if (existingAdjustment === 0 && !removeTariff) {
            let nonGiftDeadCost = 0
            for (const item of (doc.line_items || [])) {
              const isGift = item.rate === 0 || item.custom_fields?.some((cf: any) => cf.label?.toUpperCase().includes('GIFT') && (cf.value === true || cf.value === 'true'))
              if (!isGift) {
                nonGiftDeadCost += parseFloat(item.purchase_rate || 0) * parseFloat(item.quantity || 1)
              }
            }
            tariffAmount = parseFloat((nonGiftDeadCost * 0.125).toFixed(2))
            if (tariffAmount > 0) {
              shouldAddTariff = true
              doc.adjustment = tariffAmount
              doc.adjustment_description = "TARIFF SURCHARGE"
            }
          }
        }

        // 2. Run the full cost calculation engine
        let calc: any = null
        try {
          calc = await calculateDocumentCosts(doc)
        } catch (calcErr: any) {
          console.error(`Phase 3 calc error for ${booksId}:`, calcErr.message)
          // Fall back to raw extraction
        }

        // 3. Extract ALL custom field values from custom_field_hash
        const cfh = doc.custom_field_hash || {}
        const rawFields: Record<string, any> = {}
        for (const [key, val] of Object.entries(cfh)) {
          rawFields[key] = val
        }

        // 4. Build comprehensive items update
        const updatedItems: any = {
          ...items,
          // Core doc fields
          sub_total: parseFloat(doc.sub_total || items.sub_total || 0),
          total: parseFloat(doc.total || items.total || 0),
          balance: doc.balance ?? items.balance ?? 0,
          salesperson: doc.salesperson_name ? doc.salesperson_name.toUpperCase().trim() : items.salesperson,
          customer_name: doc.customer_name || items.customer_name,
          status: doc.status || items.status,
          date: doc.date || items.date,
          line_items: doc.line_items || items.line_items || [],
          custom_fields: doc.custom_fields || items.custom_fields || [],
          custom_field_hash: rawFields,
          lastSyncedAt: new Date().toISOString(),
        }

        // Calculated fields (from engine or raw extraction)
        if (calc) {
          updatedItems.deadCostSubjectToVig = calc.deadCostSubjectToVig
          updatedItems.deadCostNoVig = calc.deadCostNoVig
          updatedItems.deadCostTotal = calc.deadCostTotal
          updatedItems.vig = calc.vigRate
          updatedItems.deadCostPlusVig = calc.deadCostPlusVig
          updatedItems.profit = calc.profit
          updatedItems.deadProfitActual = calc.deadProfitActual
          updatedItems.commissionPercent = calc.commissionPct
          updatedItems.commission = calc.salesCommission
          updatedItems.marginPercent = calc.marginPercent
          updatedItems.ccFees = calc.ccFees
          updatedItems.additionalCosts = calc.additionalCosts
          updatedItems.insurance = calc.insurance
          updatedItems.lineItemDetails = calc.lineItemDetails
          updatedItems.itemsDcBreakdown = calc.lineItemBreakdownStrings
          updatedItems.isPaid = calc.isPaid
        } else {
          // Standardized extraction using canonical field catalog
          updatedItems.profit = extractProfit(doc)
          updatedItems.commission = extractCommissionAmount(doc)
          updatedItems.vig = extractVigRate(doc)
          updatedItems.deadCostTotal = extractDeadCostTotal(doc)
          updatedItems.deadCostSubjectToVig = parseFloat(cfh.cf_dead_cost_subject_to_vig_unformatted ?? 0) || 0
          updatedItems.deadCostNoVig = parseFloat(cfh.cf_dead_cost_no_vig_unformatted ?? 0) || 0
          updatedItems.deadCostPlusVig = parseFloat(cfh.cf_dead_cost_with_vig_unformatted ?? 0) || 0
          updatedItems.ccFees = extractCcFees(doc)
          updatedItems.additionalCosts = extractAdditionalCosts(doc)
          updatedItems.insurance = extractInsurance(doc)
        }


        // Non-calculated custom fields (user-input, preserve as-is)
        updatedItems.estimateNumber = cfh.cf_estimate_number ?? items.estimateNumber ?? null
        updatedItems.estimateDate = cfh.cf_estimate_date ?? items.estimateDate ?? null
        updatedItems.paidInFullDate = cfh.cf_paid_in_full_date ?? items.paidInFullDate ?? null
        updatedItems.commissionStatus = cfh.cf_commission_status ?? items.commissionStatus ?? null
        updatedItems.writtenOff = cfh.cf_written_off ?? items.writtenOff ?? false
        updatedItems.removeTariffSurcharge = cfh.cf_remove_tariff_surcharge ?? items.removeTariffSurcharge ?? false
        updatedItems.additionalCostNotes = cfh.cf_additional_cost_explanation ?? items.additionalCostNotes ?? null
        updatedItems.ccBreakdown = cfh.cf_cc_charge_s_breakdown ?? items.ccBreakdown ?? null
        updatedItems.purchaseOrderNumbers = cfh.cf_purchase_order_number_s ?? items.purchaseOrderNumbers ?? null
        updatedItems.reference = cfh.cf_reference ?? items.reference ?? null

        const actualShippingCost = extractActualShippingCost(doc)
        const shippingCostBreakdown = extractShippingCostBreakdown(doc)
        updatedItems.actualShippingCost = actualShippingCost
        updatedItems.shippingCostBreakdown = shippingCostBreakdown

        // 5. Update local DB
        if (currentDocType === 'Invoice') {
          await prisma.invoice.update({ where: { id: record.id }, data: { items: updatedItems, zohoId: booksId, actualShippingCost, shippingCostBreakdown } })
        } else if (currentDocType === 'SalesOrder') {
          await prisma.salesOrder.update({ where: { id: record.id }, data: { items: updatedItems, zohoId: booksId, actualShippingCost, shippingCostBreakdown } })
        } else {
          await prisma.quote.update({ where: { id: record.id }, data: { items: updatedItems, zohoId: booksId } })
        }

        // 6. Push empty calculated fields back to Zoho (only if we have calc results)
        if (calc && doc.custom_fields?.length) {
          const existingFields = doc.custom_fields || []
          const fieldMap: Record<string, any> = {
            "DEAD COST TOTAL": calc.deadCostTotal.toFixed(2),
            "DEAD COST SUBJECT TO VIG": calc.deadCostSubjectToVig.toFixed(2),
            "DEAD COST NO VIG": calc.deadCostNoVig.toFixed(2),
            "SALESPERSON VIG": calc.vigRate,
            "DEAD COST PLUS VIG": calc.deadCostPlusVig.toFixed(2),
            "PROFIT": calc.profit.toFixed(2),
            "COMMISSION FROM PROFIT %": calc.commissionPct,
            "SALES COMMISSION": calc.salesCommission.toFixed(2),
            "ITEMS DC BREAKDOWN": calc.lineItemBreakdownStrings.join("\n"),
          }
          if (calc.isPaid) {
            const paidField = existingFields.find((f: any) => f.label?.toUpperCase().includes("PAID IN FULL DATE"))
            if (paidField && !paidField.value) {
              fieldMap["PAID IN FULL DATE"] = doc.date || new Date().toISOString().split("T")[0]
            }
          }

          // Only push fields that are currently EMPTY in Zoho
          const fieldsToUpdate: any[] = []
          for (const [label, value] of Object.entries(fieldMap)) {
            const field = existingFields.find((f: any) => f.label?.toUpperCase().trim() === label)
            if (field && (!field.value || String(field.value).trim() === '' || String(field.value).trim() === '0' || String(field.value).trim() === '0.00')) {
              fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
            }
          }

          const payload: any = {}
          if (fieldsToUpdate.length > 0) {
            payload.custom_fields = fieldsToUpdate
          }
          if (shouldAddTariff) {
            payload.adjustment = tariffAmount
            payload.adjustment_description = "TARIFF SURCHARGE"
          }

          if (Object.keys(payload).length > 0) {
            await sleep(RATE_DELAY_MS)
            const putRes = await fetch(`${BASE_URL}/${zohoModule}/${booksId}?organization_id=${ORG_ID}`, {
              method: 'PUT',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            if (putRes.ok) pushed++
          }
        }

        processed++
        results.push({
          id: booksId, type: currentDocType,
          number: items.invoiceNumber || items.salesOrderNumber || items.estimateNumber,
          profit: (updatedItems.profit ?? 0).toFixed?.(2) ?? '0',
          commission: (updatedItems.commission ?? 0).toFixed?.(2) ?? '0',
          fieldsPushed: pushed > 0 ? 'yes' : 'no',
        })
      } catch (e: any) {
        errors++
        console.error(`Phase 3 error:`, e.message)
      }
    }

    const newOffset = offset + PHASE3_BATCH_SIZE
    await saveCheckpoint({
      ...cp, phase3Offset: newOffset, phase3DocType: currentDocType,
      phase3Processed: (cp.phase3Processed || 0) + processed,
      phase3Errors: (cp.phase3Errors || 0) + errors,
      phase3Pushed: (cp.phase3Pushed || 0) + pushed,
    })

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        success: true, phase: 3,
        docType: currentDocType,
        done: batch.length < PHASE3_BATCH_SIZE && currentDocType === 'Quote',
        batchProcessed: processed,
        batchErrors: errors,
        batchPushedToZoho: pushed,
        callAgain: true,
        results,
        message: `${currentDocType}: Processed ${processed}, pushed ${pushed} to Zoho — call again to continue.`
      })
    }
  }

  return {
    statusCode: 400, headers: cors,
    body: JSON.stringify({ error: 'Missing required param: phase=1, phase=2, phase=3, or status=1' })
  }
}
