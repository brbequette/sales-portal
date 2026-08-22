/**
 * /api/admin/books/sync-conflicts
 *
 * GET  — list all documents with syncConflict = true, paginated by docType
 * POST — resolve a conflict (keep app / use zoho / dismiss)
 *
 * POST body:
 *   { action: 'resolve', docType: 'invoice'|'salesorder'|'quote',
 *     docId: string,
 *     resolution: 'app' | 'zoho' | 'dismiss' }
 *
 *   'app'     → keep all current app values; push custom_fields back to Zoho; clear flag
 *   'zoho'    → trigger a fresh process-*-costs run which will pull Zoho data; clear flag
 *   'dismiss' → clear the conflict flag without changing any data
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { requireAdministrator } from "@/lib/auth-helpers"
import { authOptions } from "@/lib/auth"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
const ORG_ID = ZOHO_ORGANIZATION_ID

// ---------------------------------------------------------------------------
// GET — list conflicts
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const session = await getServerSession(authOptions)
    if (!session || (session as any).user?.role !== 'Administrator') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50))

    const [invoices, salesOrders, quotes, totals] = await Promise.all([
      prisma.invoice.findMany({
        where: { syncConflict: true },
        select: {
          id: true, zohoId: true, status: true, issueDate: true,
          lastSyncedAt: true, lastZohoModifiedTime: true, appModifiedAt: true,
          conflictFields: true, items: true,
          account: { select: { name: true } },
        },
        orderBy: { lastZohoModifiedTime: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.salesOrder.findMany({
        where: { syncConflict: true },
        select: {
          id: true, zohoId: true, status: true, orderDate: true,
          lastSyncedAt: true, lastZohoModifiedTime: true, appModifiedAt: true,
          conflictFields: true, items: true,
          account: { select: { name: true } },
        },
        orderBy: { lastZohoModifiedTime: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.quote.findMany({
        where: { syncConflict: true },
        select: {
          id: true, zohoId: true, status: true, createdAt: true,
          lastSyncedAt: true, lastZohoModifiedTime: true, appModifiedAt: true,
          conflictFields: true, items: true,
          account: { select: { name: true } },
        },
        orderBy: { lastZohoModifiedTime: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      Promise.all([
        prisma.invoice.count({ where: { syncConflict: true } }),
        prisma.salesOrder.count({ where: { syncConflict: true } }),
        prisma.quote.count({ where: { syncConflict: true } }),
      ]),
    ])

    const [invCount, soCount, quoteCount] = totals
    const totalConflicts = invCount + soCount + quoteCount

    return NextResponse.json({
      totalConflicts,
      invoiceConflicts:    invCount,
      salesOrderConflicts: soCount,
      quoteConflicts:      quoteCount,
      invoices:    invoices.map(r => ({
        docType: "invoice",
        id: r.id, zohoId: r.zohoId,
        docNumber: (r.items as any)?.invoice_number ?? (r.items as any)?.invoiceNumber ?? r.zohoId,
        customer: r.account?.name,
        status: r.status, date: r.issueDate,
        lastSyncedAt: r.lastSyncedAt,
        lastZohoModifiedTime: r.lastZohoModifiedTime,
        appModifiedAt: r.appModifiedAt,
        recommendedSource: newestSource(r.appModifiedAt, r.lastZohoModifiedTime),
        conflictFields: r.conflictFields,
      })),
      salesOrders: salesOrders.map(r => ({
        docType: "salesorder",
        id: r.id, zohoId: r.zohoId,
        docNumber: (r.items as any)?.salesorder_number ?? (r.items as any)?.salesOrderNumber ?? r.zohoId,
        customer: r.account?.name,
        status: r.status, date: r.orderDate,
        lastSyncedAt: r.lastSyncedAt,
        lastZohoModifiedTime: r.lastZohoModifiedTime,
        appModifiedAt: r.appModifiedAt,
        recommendedSource: newestSource(r.appModifiedAt, r.lastZohoModifiedTime),
        conflictFields: r.conflictFields,
      })),
      quotes: quotes.map(r => ({
        docType: "quote",
        id: r.id, zohoId: r.zohoId,
        docNumber: (r.items as any)?.estimate_number ?? (r.items as any)?.estimateNumber ?? r.zohoId,
        customer: r.account?.name,
        status: r.status, date: r.createdAt,
        lastSyncedAt: r.lastSyncedAt,
        lastZohoModifiedTime: r.lastZohoModifiedTime,
        appModifiedAt: r.appModifiedAt,
        recommendedSource: newestSource(r.appModifiedAt, r.lastZohoModifiedTime),
        conflictFields: r.conflictFields,
      })),
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST — resolve a conflict
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const session = await getServerSession(authOptions)
    if (!session || (session as any).user?.role !== 'Administrator') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body       = await req.json()
    const { action, docType, docId, resolution } = body

    if (action !== "resolve") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
    if (!docId || !docType || !resolution) {
      return NextResponse.json({ error: "Missing docId, docType, or resolution" }, { status: 400 })
    }

    // ── DISMISS — just clear the flag ──────────────────────────────────────
    if (resolution === "dismiss") {
      await clearConflict(docType, docId)
      return NextResponse.json({ success: true, resolution: "dismiss" })
    }

    // ── APP wins — push app's current custom_fields back to Zoho ──────────
    if (resolution === "app") {
      const zohoId = await getZohoId(docType, docId)
      if (!zohoId) return NextResponse.json({ error: "Document not found" }, { status: 404 })

      const items = await getItems(docType, docId)
      // Rebuild custom field payload from the locally stored calculated values
      const customFields = buildCustomFieldsFromItems(items)

      if (customFields.length > 0) {
        const token   = await getZohoAccessToken()
        const endpoint = docTypeToEndpoint(docType)
        const zohoFieldId = docTypeToZohoId(docType, zohoId)
        const putRes  = await fetch(
          `https://www.zohoapis.${ZOHO_DC}/books/v3/${endpoint}/${zohoFieldId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
            method: "PUT",
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ custom_fields: customFields }),
          }
        )
        const putData = await putRes.json()
        if (!putRes.ok || putData.code !== 0) {
          return NextResponse.json({ error: `Zoho PUT failed: ${putData.message}` }, { status: 500 })
        }
      }

      await clearConflict(docType, docId, true)
      return NextResponse.json({ success: true, resolution: "app", fieldsWritten: customFields.length })
    }

    // ── ZOHO wins — mark pendingZohoFetch so next sync pulls fresh data ────
    if (resolution === "zoho") {
      await setPendingFetch(docType, docId)
      await clearConflict(docType, docId)
      return NextResponse.json({
        success: true,
        resolution: "zoho",
        message: "Document flagged for re-sync. Run 'Process All Documents' to pull fresh Zoho data.",
      })
    }

    return NextResponse.json({ error: "Invalid resolution" }, { status: 400 })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function clearConflict(docType: string, docId: string, markSynced = false) {
  const syncState = markSynced
    ? { lastSyncedAt: new Date(), appModifiedAt: new Date(), lastZohoModifiedTime: new Date() }
    : {}
  if (docType === "invoice") {
    await prisma.invoice.update({ where: { id: docId }, data: { syncConflict: false, conflictFields: Prisma.DbNull, ...syncState } })
  } else if (docType === "salesorder") {
    await prisma.salesOrder.update({ where: { id: docId }, data: { syncConflict: false, conflictFields: Prisma.DbNull, ...syncState } })
  } else {
    await prisma.quote.update({ where: { id: docId }, data: { syncConflict: false, conflictFields: Prisma.DbNull, ...syncState } })
  }
}

async function setPendingFetch(docType: string, docId: string) {
  if (docType === "invoice") {
    await prisma.invoice.update({ where: { id: docId }, data: { pendingZohoFetch: true } })
  } else if (docType === "salesorder") {
    await prisma.salesOrder.update({ where: { id: docId }, data: { pendingZohoFetch: true } })
  } else {
    await prisma.quote.update({ where: { id: docId }, data: { pendingZohoFetch: true } })
  }
}

async function getZohoId(docType: string, docId: string): Promise<string | null> {
  if (docType === "invoice") {
    const r = await prisma.invoice.findUnique({ where: { id: docId }, select: { zohoId: true } })
    return r?.zohoId ?? null
  } else if (docType === "salesorder") {
    const r = await prisma.salesOrder.findUnique({ where: { id: docId }, select: { zohoId: true } })
    return r?.zohoId ?? null
  } else {
    const r = await prisma.quote.findUnique({ where: { id: docId }, select: { zohoId: true } })
    return r?.zohoId ?? null
  }
}

async function getItems(docType: string, docId: string): Promise<Record<string, unknown>> {
  if (docType === "invoice") {
    const r = await prisma.invoice.findUnique({ where: { id: docId }, select: { items: true } })
    return (r?.items as Record<string, unknown>) ?? {}
  } else if (docType === "salesorder") {
    const r = await prisma.salesOrder.findUnique({ where: { id: docId }, select: { items: true } })
    return (r?.items as Record<string, unknown>) ?? {}
  } else {
    const r = await prisma.quote.findUnique({ where: { id: docId }, select: { items: true } })
    return (r?.items as Record<string, unknown>) ?? {}
  }
}

function docTypeToEndpoint(docType: string): string {
  return docType === "invoice" ? "invoices" : docType === "salesorder" ? "salesorders" : "estimates"
}

function docTypeToZohoId(docType: string, zohoId: string): string {
  return zohoId // already the Zoho ID
}

function newestSource(appModifiedAt: Date | null, zohoModifiedAt: Date | null): "app" | "zoho" {
  return (appModifiedAt?.getTime() ?? 0) >= (zohoModifiedAt?.getTime() ?? 0) ? "app" : "zoho"
}

// Rebuild the custom_fields array from locally stored calc values
function buildCustomFieldsFromItems(items: Record<string, unknown>): Array<{ label: string; value: unknown }> {
  const fields: Array<{ label: string; value: unknown }> = []
  const mapping: Record<string, string> = {
    deadCostTotal:     "Dead Cost",
    vigRate:           "VIG Rate",
    deadCostPlusVig:   "Dead Cost + VIG",
    deadProfitActual:  "Dead Profit",
    profit:            "Profit",
    commission:        "Commission",
    commissionPercent: "Commission %",
  }
  for (const [key, label] of Object.entries(mapping)) {
    if (items[key] !== undefined) {
      fields.push({ label, value: items[key] })
    }
  }
  return fields
}
