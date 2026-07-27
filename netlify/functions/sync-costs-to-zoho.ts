/**
 * sync-costs-to-zoho.ts
 *
 * Reads all documents marked pendingCostSync=true from the DB and pushes
 * the pre-calculated custom field values to Zoho Books via PUT.
 *
 * The pendingZohoFields payload was assembled by bulk-calculate-costs.ts and
 * stored in items.pendingZohoFields — this function does NOT need to re-fetch
 * or re-calculate anything; it just executes the queued write operations.
 *
 * OVERLAP PREVENTION:
 *   1. Only processes docs where pendingCostSync=true
 *   2. Per-doc in-memory loop guard (same pattern as process-*-costs.ts)
 *   3. Sets pendingCostSync=false + lastCostSyncAt=now on success
 *   4. On failure: leaves pendingCostSync=true so it retries next run
 *
 * POST body params:
 *   docTypes    string[]  — which doc types to sync (all if omitted)
 *   dryRun      boolean   — log what would be sent without actually PUTting
 *   batchDelay  number    — ms delay between batches of 10 (default 1000)
 */

import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// In-memory loop guard — prevents pushing the same doc twice within 60s
// (guards against concurrent sync runs or Zoho callback recursion)
const recentlySynced = new Map<string, number>()
const LOOP_GUARD_TTL = 60_000

function isRecentlySynced(id: string): boolean {
  const t = recentlySynced.get(id)
  return !!(t && Date.now() - t < LOOP_GUARD_TTL)
}

function markSynced(id: string) {
  recentlySynced.set(id, Date.now())
  // Clean up stale entries
  for (const [k, t] of recentlySynced) {
    if (Date.now() - t > LOOP_GUARD_TTL * 2) recentlySynced.delete(k)
  }
}

type DocType = "invoices" | "quotes" | "salesorders"

interface SyncResult {
  zohoId: string
  docNumber?: string
  type: DocType
  status: "synced" | "skipped" | "error" | "no-fields" | "dry-run"
  fieldsUpdated?: number
  reason?: string
}

interface SyncStats {
  synced: number
  skipped: number
  errors: number
  total: number
  results: SyncResult[]
}

function zohoEndpoint(docType: DocType, zohoId: string): string {
  const base = `https://www.zohoapis.${ZOHO_DC}/books/v3`
  if (docType === "invoices")   return `${base}/invoices/${zohoId}?organization_id=${ORG_ID}`
  if (docType === "quotes")     return `${base}/estimates/${zohoId}?organization_id=${ORG_ID}`
  return                                `${base}/salesorders/${zohoId}?organization_id=${ORG_ID}`
}

async function syncDocType(
  docType: DocType,
  token: string,
  dryRun: boolean,
  batchDelay: number,
  stats: SyncStats
) {
  const authHeaders = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  }

  // Find all pending docs of this type
  let pendingDocs: Array<{
    id: string
    zohoId: string | null
    items: any
  }> = []

  if (docType === "invoices") {
    pendingDocs = await prisma.invoice.findMany({
      where: { pendingCostSync: true, zohoId: { not: "" } },
      select: { id: true, zohoId: true, items: true },
    })
  } else if (docType === "quotes") {
    pendingDocs = await prisma.quote.findMany({
      where: { pendingCostSync: true, zohoId: { not: "" } },
      select: { id: true, zohoId: true, items: true },
    })
  } else {
    pendingDocs = await prisma.salesOrder.findMany({
      where: { pendingCostSync: true, zohoId: { not: "" } },
      select: { id: true, zohoId: true, items: true },
    })
  }

  stats.total += pendingDocs.length
  console.log(`\n📤 ${docType.toUpperCase()}: ${pendingDocs.length} docs pending sync`)

  const BATCH_SIZE = 10
  for (let i = 0; i < pendingDocs.length; i += BATCH_SIZE) {
    const batch = pendingDocs.slice(i, i + BATCH_SIZE)

    for (const doc of batch) {
      if (!doc.zohoId) continue

      const result: SyncResult = {
        zohoId: doc.zohoId,
        type: docType,
        status: "skipped",
      }

      // In-memory loop guard
      if (isRecentlySynced(doc.zohoId)) {
        result.status = "skipped"
        result.reason = "Loop guard: synced within 60s"
        stats.skipped++
        stats.results.push(result)
        continue
      }

      // Read the pre-built Zoho payload from items JSON
      const items = (doc.items as any) ?? {}
      const pendingZohoFields: any[] = items.pendingZohoFields ?? []

      if (pendingZohoFields.length === 0) {
        // No actual field changes — mark as done and move on
        const clearData = {
          pendingCostSync: false,
          lastCostSyncAt: new Date(),
        }
        if (docType === "invoices") await prisma.invoice.update({ where: { id: doc.id }, data: clearData })
        else if (docType === "quotes") await prisma.quote.update({ where: { id: doc.id }, data: clearData })
        else await prisma.salesOrder.update({ where: { id: doc.id }, data: clearData })

        result.status = "no-fields"
        result.reason = "No field changes to push — cleared flag"
        stats.skipped++
        stats.results.push(result)
        continue
      }

      // Extract doc number from items for logging
      result.docNumber =
        items.invoiceNumber || items.estimateNumber || items.salesOrderNumber ||
        `${docType}/${doc.zohoId}`

      if (dryRun) {
        result.status = "dry-run"
        result.reason = `Would push ${pendingZohoFields.length} fields`
        result.fieldsUpdated = pendingZohoFields.length
        stats.results.push(result)
        continue
      }

      try {
        markSynced(doc.zohoId)

        const url = zohoEndpoint(docType, doc.zohoId)
        const putRes = await fetch(url, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ custom_fields: pendingZohoFields }),
        })

        const putData: any = await putRes.json()

        if (!putRes.ok || putData.code !== 0) {
          throw new Error(`Zoho PUT failed: [${putData.code}] ${putData.message}`)
        }

        // Mark as synced in DB — clear pending flag, set lastCostSyncAt, clear stored payload
        const updatedItems = { ...items, pendingZohoFields: [], lastSyncedFields: pendingZohoFields }
        const markSyncedData = {
          pendingCostSync: false,
          lastCostSyncAt: new Date(),
          items: updatedItems,
        }

        if (docType === "invoices") {
          await prisma.invoice.update({ where: { id: doc.id }, data: markSyncedData })
        } else if (docType === "quotes") {
          await prisma.quote.update({ where: { id: doc.id }, data: markSyncedData })
        } else {
          await prisma.salesOrder.update({ where: { id: doc.id }, data: markSyncedData })
        }

        result.status = "synced"
        result.fieldsUpdated = pendingZohoFields.length
        stats.synced++

        console.log(`  ✅ ${docType} ${result.docNumber} — pushed ${pendingZohoFields.length} fields to Zoho`)
      } catch (err: any) {
        console.error(`  ❌ ${docType} ${doc.zohoId}: ${err.message}`)
        // Leave pendingCostSync=true so it retries on next run
        result.status = "error"
        result.reason = err.message
        stats.errors++
      }

      stats.results.push(result)
    }

    // Rate limiting between batches (Zoho Books rate limit: ~100 req/min)
    if (i + BATCH_SIZE < pendingDocs.length) {
      await new Promise((r) => setTimeout(r, batchDelay))
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

  const docTypes: DocType[] = body.docTypes || ["invoices", "quotes", "salesorders"]
  const dryRun = !!body.dryRun
  const batchDelay = body.batchDelay ? Number(body.batchDelay) : 1000

  const stats: SyncStats = { synced: 0, skipped: 0, errors: 0, total: 0, results: [] }
  const startTime = Date.now()

  try {
    const token = await getZohoAccessToken()
    if (!token) throw new Error("Failed to get Zoho access token")

    for (const docType of docTypes) {
      await syncDocType(docType, token, dryRun, batchDelay, stats)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(
      `\n🏁 Sync done in ${elapsed}s: ${stats.synced} synced, ${stats.skipped} skipped, ${stats.errors} errors (of ${stats.total} pending)`
    )

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        success: true,
        dryRun,
        elapsed: `${elapsed}s`,
        summary: {
          total:   stats.total,
          synced:  stats.synced,
          skipped: stats.skipped,
          errors:  stats.errors,
        },
        results: stats.results,
      }),
    }
  } catch (err: any) {
    console.error("sync-costs-to-zoho fatal error:", err)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: err.message }) }
  } finally {
    await prisma.$disconnect()
  }
}
