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
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'
const BASE_URL = `https://www.zohoapis.${ZOHO_DC}/books/v3`

// How many records to process per Phase 2 invocation (fits in 26s Netlify timeout)
const BATCH_SIZE = 18
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

    const types: Array<{ module: string, idField: string, numField: string, dbModel: 'invoice' | 'salesOrder' | 'quote', itemsKey: string }> = [
      { module: 'invoices',    idField: 'invoice_id',    numField: 'invoice_number',    dbModel: 'invoice',     itemsKey: 'booksInvoiceId' },
      { module: 'salesorders', idField: 'salesorder_id', numField: 'salesorder_number', dbModel: 'salesOrder',  itemsKey: 'booksSalesOrderId' },
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
    const token = await getZohoAccessToken()
    const res = await fetch(
      `${BASE_URL}/${t.module}?organization_id=${ORG_ID}&page=${currentPage}&per_page=200`,
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
        if (t.dbModel === 'invoice')     await prisma.invoice.update({ where: { id: dbDoc.id }, data: { items: currentItems } })
        else if (t.dbModel === 'salesOrder') await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: { items: currentItems } })
        else                             await prisma.quote.update({ where: { id: dbDoc.id }, data: { items: currentItems } })
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
      await saveCheckpoint({ ...cp, phase2Offset: 0, phase2Reset: new Date().toISOString() })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: 'Phase 2 checkpoint reset to 0.' }) }
    }

    const offset = parseInt(cp.phase2Offset || '0', 10)

    // ── Concurrency lock ──────────────────────────────────────────────────────
    // If another invocation is already processing the same offset and started
    // less than 60 seconds ago, reject this call to prevent duplicate writes.
    const lockTs: number = cp.phase2LockTs || 0
    const lockOffset: number = cp.phase2LockOffset ?? -1
    const lockAge = Date.now() - lockTs
    if (lockOffset === offset && lockAge < 60_000) {
      return {
        statusCode: 429, headers: cors,
        body: JSON.stringify({ error: 'Another backfill batch is already running for this offset. Try again in a moment.', lockOffset, lockAge })
      }
    }
    // Claim the lock immediately — write it before doing any API calls
    await saveCheckpoint({ ...cp, phase2LockTs: Date.now(), phase2LockOffset: offset })

    const token = await getZohoAccessToken()

    console.log(`=== Backfill Phase 2: Fetching line items (offset ${offset}, batch ${BATCH_SIZE}) ===`)

    // Collect all uncached records across all three types
    type DocRef = { id: string; booksId: string; model: 'invoice' | 'salesOrder' | 'quote'; status: string }
    const uncached: DocRef[] = []

    // Invoices without line_items but with booksInvoiceId
    const invUncached = await prisma.invoice.findMany({
      select: { id: true, status: true, items: true },
      skip: 0,
      take: 20000,
    })
    for (const r of invUncached) {
      const items = r.items as any
      const hasLines = items?.line_items && Array.isArray(items.line_items) && items.line_items.length > 0
      const booksId = items?.booksInvoiceId
      if (!hasLines && booksId) uncached.push({ id: r.id, booksId, model: 'invoice', status: r.status || '' })
    }

    // SOs without line_items but with booksSalesOrderId
    const soUncached = await prisma.salesOrder.findMany({ select: { id: true, status: true, items: true } })
    for (const r of soUncached) {
      const items = r.items as any
      const hasLines = items?.line_items && Array.isArray(items.line_items) && items.line_items.length > 0
      const booksId = items?.booksSalesOrderId
      if (!hasLines && booksId) uncached.push({ id: r.id, booksId, model: 'salesOrder', status: r.status || '' })
    }

    // Quotes without line_items but with booksEstimateId
    const qtUncached = await prisma.quote.findMany({ select: { id: true, status: true, items: true } })
    for (const r of qtUncached) {
      const items = r.items as any
      const hasLines = items?.line_items && Array.isArray(items.line_items) && items.line_items.length > 0
      const booksId = items?.booksEstimateId
      if (!hasLines && booksId) uncached.push({ id: r.id, booksId, model: 'quote', status: r.status || '' })
    }

    const totalUncached = uncached.length
    const batch = uncached.slice(offset, offset + BATCH_SIZE)

    if (batch.length === 0) {
      await saveCheckpoint({ ...cp, phase2Done: true, phase2CompletedAt: new Date().toISOString() })
      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({ success: true, phase: 2, done: true, totalUncached, message: 'All records backfilled!' })
      }
    }

    let processed = 0, errors = 0

    for (const doc of batch) {
      await sleep(RATE_DELAY_MS)
      try {
        const modPath = doc.model === 'invoice' ? 'invoices' : doc.model === 'salesOrder' ? 'salesorders' : 'estimates'
        const detailRes = await fetch(
          `${BASE_URL}/${modPath}/${doc.booksId}?organization_id=${ORG_ID}`,
          { headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json' } }
        )
        if (!detailRes.ok) { errors++; console.warn(`Detail fetch failed for ${doc.booksId}: ${detailRes.status}`); continue }

        const detailData: any = await detailRes.json()
        if (detailData.code !== 0) { errors++; continue }

        const zohoDoc = detailData.invoice || detailData.salesorder || detailData.estimate
        if (!zohoDoc) { errors++; continue }

        // Read current items, merge in the fetched data
        let currentDoc: any = null
        if (doc.model === 'invoice') currentDoc = await prisma.invoice.findUnique({ where: { id: doc.id } })
        else if (doc.model === 'salesOrder') currentDoc = await prisma.salesOrder.findUnique({ where: { id: doc.id } })
        else currentDoc = await prisma.quote.findUnique({ where: { id: doc.id } })
        if (!currentDoc) { errors++; continue }

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

        if (doc.model === 'invoice') await prisma.invoice.update({ where: { id: doc.id }, data: { status, items: currentItems } })
        else if (doc.model === 'salesOrder') await prisma.salesOrder.update({ where: { id: doc.id }, data: { status, items: currentItems } })
        else await prisma.quote.update({ where: { id: doc.id }, data: { status, items: currentItems } })

        processed++
      } catch (e: any) {
        errors++
        console.error(`Error processing ${doc.model} ${doc.id}:`, e.message)
      }
    }

    const newOffset = offset + batch.length
    const remaining = totalUncached - newOffset
    const pct = Math.round((newOffset / totalUncached) * 100)
    const etaMin = Math.ceil((remaining * RATE_DELAY_MS) / 60000 / (BATCH_SIZE / batch.length))

    await saveCheckpoint({ ...cp, phase2Offset: newOffset, phase2LastRun: new Date().toISOString(), phase2Processed: (cp.phase2Processed || 0) + processed })

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
        percentComplete: pct,
        etaMinutesRemaining: etaMin,
        callAgain: remaining > 0,
        message: remaining > 0
          ? `${pct}% done — ${remaining} records left (~${etaMin} min remaining). Call phase=2 again to continue.`
          : 'All records backfilled!'
      })
    }
  }

  return {
    statusCode: 400, headers: cors,
    body: JSON.stringify({ error: 'Missing required param: phase=1, phase=2, or status=1' })
  }
}
