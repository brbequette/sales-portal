import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
import { requireAdministrator } from "@/lib/auth-helpers"

const ORG_ID = ZOHO_ORGANIZATION_ID
/**
 * sync-costs-to-zoho — Inline Next.js route (no Netlify proxy)
 *
 * Reads all local DB documents with pendingCostSync=true and pushes
 * their pre-built pendingZohoFields payload to Zoho Books custom fields.
 * Called automatically after bulk-calculate-costs completes, and available
 * as a manual "Sync to Zoho" button in Admin > Books Scripts.
 *
 * POST body: { docTypes?: string[], dryRun?: boolean, batchDelay?: number }
 * GET: returns pending counts and last sync times
 */

const ZOHO_DC = process.env.ZOHO_DC || "com"

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

// In-memory loop guard (prevents re-entry when our PUT triggers Zoho workflows)
const recentlySynced = new Map<string, number>()
const LOOP_GUARD_TTL = 60_000

function isRecentlySynced(id: string) {
  const t = recentlySynced.get(id)
  return !!(t && Date.now() - t < LOOP_GUARD_TTL)
}
function markSynced(id: string) {
  recentlySynced.set(id, Date.now())
  for (const [k, t] of recentlySynced) {
    if (Date.now() - t > LOOP_GUARD_TTL * 2) recentlySynced.delete(k)
  }
}

type DocType = "invoices" | "quotes" | "salesorders"

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
  stats: { synced: number; skipped: number; errors: number; total: number; results: any[] }
) {
  const authHeaders = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  }

  let pendingDocs: Array<{ id: string; zohoId: string | null; items: any }> = []

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
  console.log(`[sync-costs-to-zoho] ${docType.toUpperCase()}: ${pendingDocs.length} docs pending`)

  const BATCH_SIZE = 10
  for (let i = 0; i < pendingDocs.length; i += BATCH_SIZE) {
    const batch = pendingDocs.slice(i, i + BATCH_SIZE)

    for (const doc of batch) {
      if (!doc.zohoId) continue

      const result: any = { zohoId: doc.zohoId, type: docType, status: "skipped" }

      if (isRecentlySynced(doc.zohoId)) {
        result.reason = "Loop guard: synced within 60s"
        stats.skipped++
        stats.results.push(result)
        continue
      }

      const items = (doc.items as any) ?? {}
      const pendingZohoFields: any[] = items.pendingZohoFields ?? []

      if (pendingZohoFields.length === 0) {
        // Nothing to push — clear the flag
        const clearData = { pendingCostSync: false, lastCostSyncAt: new Date() }
        if (docType === "invoices") await prisma.invoice.update({ where: { id: doc.id }, data: clearData })
        else if (docType === "quotes") await prisma.quote.update({ where: { id: doc.id }, data: clearData })
        else await prisma.salesOrder.update({ where: { id: doc.id }, data: clearData })

        result.status = "no-fields"
        result.reason = "No field changes — cleared flag"
        stats.skipped++
        stats.results.push(result)
        continue
      }

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
        const putRes = await fetch(url, { signal: AbortSignal.timeout(15000),
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ custom_fields: pendingZohoFields }),
        })
        const putData: any = await putRes.json()

        if (!putRes.ok || putData.code !== 0) {
          throw new Error(`Zoho PUT failed: [${putData.code}] ${putData.message}`)
        }

        // Clear pending flag and store what was pushed
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
        console.log(`  ✓ ${docType} ${result.docNumber} — pushed ${pendingZohoFields.length} fields`)
      } catch (err: any) {
        console.error(`  ✗ ${docType} ${doc.zohoId}: ${err.message}`)
        result.status = "error"
        result.reason = err.message
        stats.errors++
      }

      stats.results.push(result)
    }

    if (i + BATCH_SIZE < pendingDocs.length) {
      await new Promise((r) => setTimeout(r, batchDelay))
    }
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  let body: any = {}
  try { body = await req.json() } catch { /* use defaults */ }

  const docTypes: DocType[] = body.docTypes || ["invoices", "quotes", "salesorders"]
  const dryRun = !!body.dryRun
  const batchDelay = body.batchDelay ? Number(body.batchDelay) : 800

  const stats = { synced: 0, skipped: 0, errors: 0, total: 0, results: [] as any[] }
  const startTime = Date.now()

  try {
    const token = await getZohoAccessToken()
    if (!token) throw new Error("Failed to get Zoho access token")

    for (const docType of docTypes) {
      await syncDocType(docType, token, dryRun, batchDelay, stats)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[sync-costs-to-zoho] Done in ${elapsed}s: ${stats.synced} synced, ${stats.skipped} skipped, ${stats.errors} errors`)

    return NextResponse.json({
      success: true, dryRun,
      elapsed: `${elapsed}s`,
      summary: {
        total:   stats.total,
        synced:  stats.synced,
        skipped: stats.skipped,
        errors:  stats.errors,
      },
      results: stats.results,
    }, { headers: CORS })
  } catch (err: any) {
    console.error("[sync-costs-to-zoho] Fatal error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS })
  }
}

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const [pendingInvoices, pendingQuotes, pendingSOs] = await Promise.all([
      prisma.invoice.count({ where: { pendingCostSync: true } }),
      prisma.quote.count({ where: { pendingCostSync: true } }),
      prisma.salesOrder.count({ where: { pendingCostSync: true } }),
    ])

    const [lastInvoiceSync, lastQuoteSync, lastSOSync] = await Promise.all([
      prisma.invoice.findFirst({
        where: { lastCostSyncAt: { not: null } },
        orderBy: { lastCostSyncAt: "desc" },
        select: { lastCostSyncAt: true },
      }),
      prisma.quote.findFirst({
        where: { lastCostSyncAt: { not: null } },
        orderBy: { lastCostSyncAt: "desc" },
        select: { lastCostSyncAt: true },
      }),
      prisma.salesOrder.findFirst({
        where: { lastCostSyncAt: { not: null } },
        orderBy: { lastCostSyncAt: "desc" },
        select: { lastCostSyncAt: true },
      }),
    ])

    return NextResponse.json({
      pending: {
        invoices:    pendingInvoices,
        quotes:      pendingQuotes,
        salesOrders: pendingSOs,
        total:       pendingInvoices + pendingQuotes + pendingSOs,
      },
      lastSync: {
        invoices:    lastInvoiceSync?.lastCostSyncAt ?? null,
        quotes:      lastQuoteSync?.lastCostSyncAt ?? null,
        salesOrders: lastSOSync?.lastCostSyncAt ?? null,
      },
    }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse("", { status: 204, headers: CORS })
}
