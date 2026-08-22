import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
const ORG_ID = ZOHO_ORGANIZATION_ID
import { calculateDocumentCosts, buildFieldsToUpdate } from "../../../../netlify/functions/lib/cost-calculations"
import { requireAdministrator } from "@/lib/auth-helpers"

/**
 * bulk-calculate-costs — Inline Next.js route (no Netlify proxy)
 *
 * Iterates ALL documents in the local DB, fetches full detail from Zoho Books,
 * runs calculateDocumentCosts(), stores results locally (pendingCostSync=true),
 * then AUTOMATICALLY triggers sync-costs-to-zoho to push the queued values.
 *
 * POST body: { docTypes?, force?, dryRun?, limit?, batchDelay?, month? }
 * GET: returns lock status (is a bulk calc currently running?)
 */

export const maxDuration = 60

const ZOHO_DC = process.env.ZOHO_DC || "com"

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

// ── Global Run Lock ────────────────────────────────────────────────────────────
const LOCK_KEY = "cost_calc_running"
const LOCK_TIMEOUT_MS = 30 * 60 * 1000 // 30-min stale lock

async function acquireLock(): Promise<boolean> {
  try {
    const existing = await prisma.systemSetting.findUnique({ where: { key: LOCK_KEY } })
    if (existing) {
      const lock = JSON.parse(existing.value)
      if (lock.running && Date.now() - lock.startedAt < LOCK_TIMEOUT_MS) return false
    }
    await prisma.systemSetting.upsert({
      where: { key: LOCK_KEY },
      update: { value: JSON.stringify({ running: true, startedAt: Date.now() }) },
      create: { key: LOCK_KEY, value: JSON.stringify({ running: true, startedAt: Date.now() }) },
    })
    return true
  } catch { return false }
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

// ── Per-Doc Type Processing ────────────────────────────────────────────────────
type DocType = "invoices" | "quotes" | "salesorders"

interface DocResult {
  zohoId: string; docNumber: string; type: DocType
  status: "calculated" | "skipped" | "error" | "dry-run"
  reason?: string; changedFields?: number
  profit?: number; commission?: number; vigRate?: number
}

interface RunStats {
  processed: number; skipped: number; errors: number; totalChanged: number; docs: DocResult[]
}

interface ProcessOptions {
  force: boolean; dryRun: boolean; limit?: number; batchDelay: number; month?: string
}

async function fetchZohoDoc(zohoId: string, docType: DocType, baseUrl: string, authHeaders: Record<string, string>) {
  if (docType === "invoices") {
    const res = await fetch(`${baseUrl}/invoices/${zohoId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000), headers: authHeaders })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: any = await res.json()
    if (data.code !== 0) throw new Error(`Zoho: ${data.message}`)
    return { doc: data.invoice, docNumber: data.invoice.invoice_number }
  }
  if (docType === "quotes") {
    const res = await fetch(`${baseUrl}/estimates/${zohoId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000), headers: authHeaders })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: any = await res.json()
    if (data.code !== 0) throw new Error(`Zoho: ${data.message}`)
    return { doc: data.estimate, docNumber: data.estimate.estimate_number }
  }
  const res = await fetch(`${baseUrl}/salesorders/${zohoId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000), headers: authHeaders })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: any = await res.json()
  if (data.code !== 0) throw new Error(`Zoho: ${data.message}`)
  return { doc: data.salesorder, docNumber: data.salesorder.salesorder_number }
}

async function processDocType(docType: DocType, token: string, opts: ProcessOptions, stats: RunStats) {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
  const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

  const selectFields = { id: true, zohoId: true, costsCalculatedAt: true, zohoModifiedTime: true, items: true } as const
  let dbDocs: any[] = []

  if (docType === "invoices") {
    const where: any = { zohoId: { not: "" } }
    if (opts.month) {
      const [yr, mo] = opts.month.split("-").map(Number)
      where.issueDate = { gte: new Date(yr, mo - 1, 1), lt: new Date(yr, mo, 1) }
    }
    dbDocs = await prisma.invoice.findMany({ where, select: selectFields })
  } else if (docType === "quotes") {
    dbDocs = await prisma.quote.findMany({ where: { zohoId: { not: "" } }, select: selectFields })
  } else {
    dbDocs = await prisma.salesOrder.findMany({ where: { zohoId: { not: "" } }, select: selectFields })
  }

  if (opts.limit) dbDocs = dbDocs.slice(0, opts.limit)
  console.log(`[bulk-calculate-costs] ${docType.toUpperCase()}: ${dbDocs.length} docs in DB`)

  const BATCH_SIZE = 10
  for (let i = 0; i < dbDocs.length; i += BATCH_SIZE) {
    const batch = dbDocs.slice(i, i + BATCH_SIZE)

    for (const dbDoc of batch) {
      if (!dbDoc.zohoId) continue

      const result: DocResult = { zohoId: dbDoc.zohoId, docNumber: "", type: docType, status: "skipped" }

      // Skip if costs are current
      if (!opts.force && dbDoc.costsCalculatedAt) {
        const calcTime = new Date(dbDoc.costsCalculatedAt).getTime()
        const modTime  = dbDoc.zohoModifiedTime ? new Date(dbDoc.zohoModifiedTime).getTime() : null
        const FRESHNESS = 5 * 60 * 1000 // 5 min buffer
        if (modTime !== null && calcTime >= modTime + FRESHNESS) {
          result.reason = "Costs current"; stats.skipped++; stats.docs.push(result); continue
        }
        if (modTime === null && Date.now() - calcTime < 12 * 60 * 60 * 1000) {
          result.reason = "Calculated within 12h, no Zoho modTime"; stats.skipped++; stats.docs.push(result); continue
        }
      }

      if (opts.dryRun) {
        result.status = "dry-run"; result.reason = "Would be recalculated"
        stats.docs.push(result); continue
      }

      try {
        const { doc: zohoDoc, docNumber } = await fetchZohoDoc(dbDoc.zohoId, docType, baseUrl, authHeaders)
        result.docNumber = docNumber

        const calc = await calculateDocumentCosts(zohoDoc)
        const {
          deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
          vigRate, deadCostPlusVig, ccFees, additionalCosts, insurance,
          subTotal, profit, marginPercent, deadProfitActual,
          commissionPct, salesCommission, isPaid, lineItemBreakdownStrings,
        } = calc

        result.profit = profit; result.commission = salesCommission; result.vigRate = vigRate

        const pendingZohoFields = buildFieldsToUpdate(calc, zohoDoc, docType)
        result.changedFields = pendingZohoFields.length

        const existingItems = (dbDoc.items as any) ?? {}
        const updatedItems = {
          ...existingItems,
          deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
          deadProfitActual, profit, marginPercent, subTotal,
          vigRate, ccFees, additionalCosts, insurance,
          commissionPct, salesCommission, isPaid, lineItemBreakdownStrings,
          pendingZohoFields,
          costsCalculatedAt: new Date().toISOString(),
        }

        const updateData = {
          amount: subTotal,
          items: updatedItems,
          costsCalculatedAt: new Date(),
          pendingCostSync: pendingZohoFields.length > 0,
        }

        if (docType === "invoices") await prisma.invoice.update({ where: { id: dbDoc.id }, data: updateData })
        else if (docType === "quotes") await prisma.quote.update({ where: { id: dbDoc.id }, data: updateData })
        else await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: updateData })

        result.status = "calculated"
        if (pendingZohoFields.length > 0) stats.totalChanged++
        stats.processed++
        console.log(`  ✓ ${docType} ${docNumber} | Profit: $${profit.toFixed(2)} | ${pendingZohoFields.length} fields queued`)
      } catch (err: any) {
        console.error(`  ✗ ${docType} ${dbDoc.zohoId}: ${err.message}`)
        result.status = "error"; result.reason = err.message; stats.errors++
      }
      stats.docs.push(result)
    }

    if (i + BATCH_SIZE < dbDocs.length) await new Promise((r) => setTimeout(r, opts.batchDelay))
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  let body: any = {}
  try { body = await req.json() } catch { /* use defaults */ }

  const docTypes: DocType[] = body.docTypes || ["invoices", "quotes", "salesorders"]
  const opts: ProcessOptions = {
    force: body.force === true,
    dryRun: body.dryRun === true,
    limit: body.limit ? parseInt(body.limit, 10) : undefined,
    batchDelay: body.batchDelay ? parseInt(body.batchDelay, 10) : 600,
    month: body.month || undefined,
  }

  // Acquire global lock (skip for dry runs)
  if (!opts.dryRun) {
    const locked = await acquireLock()
    if (!locked) {
      return NextResponse.json(
        { success: false, error: "Another bulk calculation is already running. Wait ~30 minutes." },
        { status: 409, headers: CORS }
      )
    }
  }

  const stats: RunStats = { processed: 0, skipped: 0, errors: 0, totalChanged: 0, docs: [] }
  const startTime = Date.now()

  try {
    // A dry run only evaluates which local records would be recalculated; it
    // exits before any Zoho request. This keeps development verification fully
    // isolated even though dev intentionally has no production Zoho secrets.
    const token = opts.dryRun ? "" : await getZohoAccessToken()
    if (!opts.dryRun && !token) throw new Error("Failed to get Zoho access token")

    for (const docType of docTypes) {
      await processDocType(docType, token, opts, stats)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(
      `[bulk-calculate-costs] Done in ${elapsed}s: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.errors} errors, ${stats.totalChanged} queued`
    )

    // ── AUTO-SYNC: immediately push queued fields to Zoho ──────────────────
    let syncResult: any = null
    if (!opts.dryRun && stats.totalChanged > 0) {
      try {
        const syncRes = await fetch(`${req.nextUrl.origin}/api/sync-costs-to-zoho`, {
          method: "POST",
          // The sync endpoint is independently admin-protected. Forward the
          // already-validated same-origin session so automatic sync does not
          // silently fail with 401 after a successful calculation run.
          headers: {
            "Content-Type": "application/json",
            cookie: req.headers.get("cookie") || "",
          },
          body: JSON.stringify({ docTypes }),
        })
        syncResult = await syncRes.json()
        console.log(`[bulk-calculate-costs] Auto-sync: ${syncResult?.summary?.synced ?? 0} synced to Zoho`)
      } catch (syncErr: any) {
        console.warn("[bulk-calculate-costs] Auto-sync failed (non-fatal):", syncErr.message)
        syncResult = { success: false, error: syncErr.message }
      }
    }

    return NextResponse.json({
      success: true,
      elapsed: `${elapsed}s`,
      summary: {
        processed: stats.processed,
        skipped:   stats.skipped,
        errors:    stats.errors,
        queuedForSync: stats.totalChanged,
      },
      autoSync: syncResult,
      docs: stats.docs,
    }, { headers: CORS })
  } catch (err: any) {
    console.error("[bulk-calculate-costs] Fatal error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS })
  } finally {
    if (!opts.dryRun) await releaseLock()
  }
}

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const lockSetting = await prisma.systemSetting.findUnique({ where: { key: LOCK_KEY } })
    let isRunning = false
    let startedAt: number | null = null
    if (lockSetting) {
      const lock = JSON.parse(lockSetting.value)
      isRunning = lock.running && Date.now() - lock.startedAt < LOCK_TIMEOUT_MS
      startedAt = lock.startedAt || null
    }
    return NextResponse.json({ isRunning, startedAt }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse("", { status: 204, headers: CORS })
}
