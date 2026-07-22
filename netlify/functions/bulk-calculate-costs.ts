/**
 * bulk-calculate-costs.ts
 *
 * Iterates ALL documents (Invoices, Quotes/Estimates, SalesOrders) stored in the
 * local DB, fetches their full detail from Zoho Books, runs calculateDocumentCosts(),
 * stores the results locally, and marks each doc pendingCostSync=true so the
 * sync-costs-to-zoho function can push the values to Zoho on the next run.
 *
 * OVERLAP PREVENTION (3 layers):
 *   1. Global run lock  — SystemSetting "cost_calc_running" prevents concurrent runs.
 *   2. Doc-level check  — Skips if costsCalculatedAt >= zohoModifiedTime (doc unchanged).
 *   3. Field diff check — Only sets pendingCostSync=true when values actually changed.
 *
 * POST body params:
 *   docTypes    string[]  — ["invoices","quotes","salesorders"]  (all if omitted)
 *   force       boolean   — recalculate even if already up-to-date
 *   dryRun      boolean   — calculate but don't write to DB
 *   limit       number    — cap total docs processed per type (for testing)
 *   batchDelay  number    — ms to wait between batches of 10 (default 600)
 */

import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { calculateDocumentCosts } from "./lib/cost-calculations"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// ─── Global Run Lock ──────────────────────────────────────────────────────────

const LOCK_KEY = "cost_calc_running"
const LOCK_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes stale-lock timeout

async function acquireLock(): Promise<boolean> {
  try {
    const existing = await prisma.systemSetting.findUnique({ where: { key: LOCK_KEY } })
    if (existing) {
      const lock = JSON.parse(existing.value)
      if (lock.running && Date.now() - lock.startedAt < LOCK_TIMEOUT_MS) {
        return false // Another run is active
      }
    }
    await prisma.systemSetting.upsert({
      where: { key: LOCK_KEY },
      update: { value: JSON.stringify({ running: true, startedAt: Date.now() }) },
      create: { key: LOCK_KEY, value: JSON.stringify({ running: true, startedAt: Date.now() }) },
    })
    return true
  } catch {
    return false
  }
}

async function releaseLock() {
  try {
    await prisma.systemSetting.upsert({
      where: { key: LOCK_KEY },
      update: { value: JSON.stringify({ running: false, startedAt: 0 }) },
      create: { key: LOCK_KEY, value: JSON.stringify({ running: false, startedAt: 0 }) },
    })
  } catch { /* best-effort */ }
}

// ─── Field Map Builder (same as individual processors) ────────────────────────

function buildFieldsToUpdate(calc: any, zohoDoc: any, docType: string): any[] {
  const {
    deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
    vigRate, deadCostPlusVig, profit, deadProfitActual,
    commissionPct, salesCommission, isPaid, lineItemBreakdownStrings,
  } = calc

  const existingFields: any[] = zohoDoc.custom_fields || []
  const existingPaidDate = existingFields.find((f: any) =>
    f.label?.toUpperCase().includes("PAID IN FULL DATE")
  )

  const fieldMap: Record<string, any> = {
    "DEAD COST TOTAL":           deadCostTotal.toFixed(2),
    "DEAD COST SUBJECT TO VIG":  deadCostSubjectToVig.toFixed(2),
    "DEAD COST NO VIG":          deadCostNoVig.toFixed(2),
    "SALESPERSON VIG":           vigRate,
    "DEAD COST PLUS VIG":        deadCostPlusVig.toFixed(2),
    "PROFIT":                    profit.toFixed(2),
    "COMMISSION FROM PROFIT %":  commissionPct,
    "SALES COMMISSION":          salesCommission.toFixed(2),
    "ITEMS DC BREAKDOWN":        lineItemBreakdownStrings.join("\n"),
  }

  if (docType === "invoices" && isPaid && existingPaidDate && !existingPaidDate.value) {
    fieldMap["PAID IN FULL DATE"] = new Date().toISOString().split("T")[0]
  }

  const apiNameMap: Record<string, any> = {
    cf_dead_profit_actual: deadProfitActual.toFixed(2),
  }

  const fieldsToUpdate: any[] = []

  for (const [label, value] of Object.entries(fieldMap)) {
    const field = existingFields.find((f: any) => f.label?.toUpperCase().trim() === label)
    if (field) {
      if (String(field.value ?? "").trim() !== String(value).trim()) {
        fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
      }
    }
  }

  for (const [apiName, value] of Object.entries(apiNameMap)) {
    const field = existingFields.find((f: any) => f.api_name === apiName)
    if (field && String(field.value ?? "").trim() !== String(value).trim()) {
      if (!fieldsToUpdate.some((f: any) => f.customfield_id === field.customfield_id)) {
        fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
      }
    }
  }

  return fieldsToUpdate
}

// ─── Per-Document Type Processing ─────────────────────────────────────────────

type DocType = "invoices" | "quotes" | "salesorders"

interface ProcessOptions {
  force: boolean
  dryRun: boolean
  limit?: number
  batchDelay: number
  month?: string
}

interface DocResult {
  zohoId: string
  docNumber: string
  type: DocType
  status: "calculated" | "skipped" | "error" | "dry-run"
  reason?: string
  changedFields?: number
  profit?: number
  commission?: number
  vigRate?: number
}

interface RunStats {
  processed: number
  skipped: number
  errors: number
  totalChanged: number
  docs: DocResult[]
}

async function fetchZohoDoc(
  zohoId: string,
  docType: DocType,
  baseUrl: string,
  authHeaders: Record<string, string>
): Promise<{ doc: any; docNumber: string }> {
  if (docType === "invoices") {
    const res = await fetch(`${baseUrl}/invoices/${zohoId}?organization_id=${ORG_ID}`, { headers: authHeaders })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: any = await res.json()
    if (data.code !== 0) throw new Error(`Zoho: ${data.message}`)
    return { doc: data.invoice, docNumber: data.invoice.invoice_number }
  }
  if (docType === "quotes") {
    const res = await fetch(`${baseUrl}/estimates/${zohoId}?organization_id=${ORG_ID}`, { headers: authHeaders })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: any = await res.json()
    if (data.code !== 0) throw new Error(`Zoho: ${data.message}`)
    return { doc: data.estimate, docNumber: data.estimate.estimate_number }
  }
  // salesorders
  const res = await fetch(`${baseUrl}/salesorders/${zohoId}?organization_id=${ORG_ID}`, { headers: authHeaders })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: any = await res.json()
  if (data.code !== 0) throw new Error(`Zoho: ${data.message}`)
  return { doc: data.salesorder, docNumber: data.salesorder.salesorder_number }
}

async function processDocType(
  docType: DocType,
  token: string,
  opts: ProcessOptions,
  stats: RunStats
) {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
  const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

  // Fetch all DB records for this doc type
  let dbDocs: Array<{
    id: string
    zohoId: string | null
    costsCalculatedAt: Date | null
    zohoModifiedTime: Date | null
    items: any
  }> = []

  const selectFields = {
    id: true,
    zohoId: true,
    costsCalculatedAt: true,
    zohoModifiedTime: true,
    items: true,
  } as const

  if (docType === "invoices") {
    const whereClause: any = { zohoId: { not: "" } }
    if (opts.month) {
      whereClause.date = { startsWith: opts.month }
    }
    dbDocs = await prisma.invoice.findMany({ where: whereClause, select: selectFields })
  } else if (docType === "quotes") {
    dbDocs = await prisma.quote.findMany({ where: { zohoId: { not: "" } }, select: selectFields })
  } else {
    dbDocs = await prisma.salesOrder.findMany({ where: { zohoId: { not: "" } }, select: selectFields })
  }

  if (opts.limit) dbDocs = dbDocs.slice(0, opts.limit)

  console.log(`\n📋 ${docType.toUpperCase()}: ${dbDocs.length} docs in DB`)

  // Process in batches of 10 to respect Zoho rate limits
  const BATCH_SIZE = 10
  for (let i = 0; i < dbDocs.length; i += BATCH_SIZE) {
    const batch = dbDocs.slice(i, i + BATCH_SIZE)

    for (const dbDoc of batch) {
      if (!dbDoc.zohoId) continue

      const result: DocResult = {
        zohoId: dbDoc.zohoId,
        docNumber: "",
        type: docType,
        status: "skipped",
      }

      // ── Doc-level overlap check ──────────────────────────────────────────
      if (!opts.force && dbDoc.costsCalculatedAt) {
        const calcTime = new Date(dbDoc.costsCalculatedAt).getTime()
        const modTime = dbDoc.zohoModifiedTime ? new Date(dbDoc.zohoModifiedTime).getTime() : null

        // If calculated AFTER last Zoho modification, skip (data is current)
        if (modTime !== null && calcTime >= modTime) {
          result.status = "skipped"
          result.reason = "Costs current (calcTime >= zohoModifiedTime)"
          stats.skipped++
          stats.docs.push(result)
          continue
        }
        // If no modTime but was calculated within the last 24h, skip
        if (modTime === null && Date.now() - calcTime < 24 * 60 * 60 * 1000) {
          result.status = "skipped"
          result.reason = "Calculated within 24h, no Zoho modTime to compare"
          stats.skipped++
          stats.docs.push(result)
          continue
        }
      }

      if (opts.dryRun) {
        result.status = "dry-run"
        result.reason = "Would be recalculated"
        stats.docs.push(result)
        continue
      }

      try {
        // Fetch full Zoho document (needed for line_items with purchase_rate and custom_fields)
        const { doc: zohoDoc, docNumber } = await fetchZohoDoc(dbDoc.zohoId, docType, baseUrl, authHeaders)
        result.docNumber = docNumber

        // Calculate all cost/commission fields
        const calc = await calculateDocumentCosts(zohoDoc)
        const {
          deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
          vigRate, deadCostPlusVig, ccFees, additionalCosts, insurance,
          subTotal, profit, marginPercent, deadProfitActual,
          commissionPct, salesCommission, isPaid, lineItemBreakdownStrings,
        } = calc

        result.profit = profit
        result.commission = salesCommission
        result.vigRate = vigRate

        // ── Field-level diff — only update if values changed ──────────────
        const pendingZohoFields = buildFieldsToUpdate(calc, zohoDoc, docType)
        result.changedFields = pendingZohoFields.length

        // Build updated items object (preserves all existing items data)
        const existingItems = (dbDoc.items as any) ?? {}
        const updatedItems = {
          ...existingItems,
          // Calculated values (queryable without hitting Zoho)
          deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
          deadProfitActual, profit, marginPercent, subTotal,
          vigRate, ccFees, additionalCosts, insurance,
          commissionPct, salesCommission, isPaid,
          lineItemBreakdownStrings,
          // Sync payload — stored here so sync function doesn't need to re-fetch
          pendingZohoFields,
          costsCalculatedAt: new Date().toISOString(),
        }

        // Write to DB
        const now = new Date()
        const updateData = {
          items: updatedItems,
          costsCalculatedAt: now,
          pendingCostSync: pendingZohoFields.length > 0,
        }

        if (docType === "invoices") {
          await prisma.invoice.update({ where: { id: dbDoc.id }, data: updateData })
        } else if (docType === "quotes") {
          await prisma.quote.update({ where: { id: dbDoc.id }, data: updateData })
        } else {
          await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: updateData })
        }

        result.status = "calculated"
        if (pendingZohoFields.length > 0) stats.totalChanged++
        stats.processed++

        console.log(
          `  ✅ ${docType} ${docNumber} | Profit: $${profit.toFixed(2)} | Comm: $${salesCommission.toFixed(2)} | VIG: ${vigRate}x | ${pendingZohoFields.length} fields queued`
        )
      } catch (err: any) {
        console.error(`  ❌ ${docType} ${dbDoc.zohoId}: ${err.message}`)
        result.status = "error"
        result.reason = err.message
        stats.errors++
      }

      stats.docs.push(result)
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < dbDocs.length) {
      await new Promise((r) => setTimeout(r, opts.batchDelay))
    }
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  let body: any = {}
  try { body = JSON.parse(event.body || "{}") } catch { /* use defaults */ }

  const { docTypes, force, dryRun, limit, batchDelay, month } = body

  const opts: ProcessOptions = {
    force: force === true,
    dryRun: dryRun === true,
    limit: limit ? parseInt(limit, 10) : undefined,
    batchDelay: batchDelay ? parseInt(batchDelay, 10) : 600,
    month: month || undefined
  }

  // Acquire global lock (skip for dry runs)
  if (!opts.dryRun) {
    const locked = await acquireLock()
    if (!locked) {
      return {
        statusCode: 409,
        headers: CORS,
        body: JSON.stringify({
          success: false,
          error: "Another bulk calculation is already running. Wait ~30 minutes or check SystemSetting 'cost_calc_running'.",
        }),
      }
    }
  }

  const stats: RunStats = { processed: 0, skipped: 0, errors: 0, totalChanged: 0, docs: [] }
  const startTime = Date.now()

  try {
    const token = await getZohoAccessToken()
    if (!token) throw new Error("Failed to get Zoho access token")

    for (const docType of docTypes) {
      await processDocType(docType, token, opts, stats)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n🏁 Bulk calc done in ${elapsed}s: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.errors} errors, ${stats.totalChanged} queued for sync`)

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        success: true,
        elapsed: `${elapsed}s`,
        summary: {
          processed: stats.processed,
          skipped:   stats.skipped,
          errors:    stats.errors,
          queuedForSync: stats.totalChanged,
        },
        docs: stats.docs,
      }),
    }
  } catch (err: any) {
    console.error("bulk-calculate-costs fatal error:", err)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: err.message }) }
  } finally {
    if (!opts.dryRun) await releaseLock()
    await prisma.$disconnect()
  }
}
