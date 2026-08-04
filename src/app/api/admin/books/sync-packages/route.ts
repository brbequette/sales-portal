import { NextRequest, NextResponse } from "next/server"
import { PrismaClient, Prisma } from "@prisma/client"
import { getZohoAccessToken } from "@/lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID  = process.env.ZOHO_ORGANIZATION_ID || "664670946"

export const maxDuration = 60

// ── Helpers ────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const token = await getZohoAccessToken()
  if (!token) throw new Error("Failed to get Zoho access token")
  return token
}

/**
 * Fetch pages from Zoho with a timeout guard per request.
 * Stops after `maxPages` pages to avoid unbounded runs.
 */
async function fetchPages(
  token: string,
  url: string,
  listKey: string,
  maxPages = 15
): Promise<any[]> {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
  let all: any[] = []
  let page = 1
  let hasMore = true

  while (hasMore && page <= maxPages) {
    const separator = url.includes("?") ? "&" : "?"
    const fullUrl = `${baseUrl}/${url}${separator}organization_id=${ORG_ID}&page=${page}&per_page=200`
    const res = await fetch(fullUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal: AbortSignal.timeout(12_000), // 12s per page request
    })

    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error(`Zoho auth failed (${res.status}) — try again in a moment.`)
      if (res.status === 429)
        throw new Error(`Zoho rate limit hit — wait a minute and try again.`)
      if (res.status === 504)
        throw new Error(`Zoho gateway timeout (504) on ${listKey} — Zoho servers are busy.`)
      throw new Error(`Zoho API returned ${res.status} for ${listKey}`)
    }

    const rawText = await res.text()
    if (rawText.trim().startsWith("<"))
      throw new Error(`Zoho returned HTML for ${listKey} — session may have timed out. Try again.`)

    let data: any
    try { data = JSON.parse(rawText) } catch {
      throw new Error(`Invalid JSON from Zoho for ${listKey}: ${rawText.substring(0, 80)}`)
    }
    if (data.code !== undefined && data.code !== 0)
      throw new Error(`Zoho API error on ${listKey}: ${data.message}`)

    const items: any[] = data[listKey] || []
    all = all.concat(items)
    hasMore = data.page_context?.has_more_page === true
    page++
  }

  return all
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const token = await getToken()

    // Optional: ?since=30d or ?since=7d  (default: 30 days)
    const { searchParams } = new URL(req.url)
    const sinceParam = searchParams.get("since") ?? "30"
    const sinceDays  = Math.min(Math.max(parseInt(sinceParam) || 30, 1), 365)

    const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    // Zoho date filter format for packages/POs: YYYY-MM-DD
    const sinceDateStr = sinceDate.toISOString().split("T")[0]

    // ── Packages ──────────────────────────────────────────────────────────
    // Only pull non-draft packages from the last N days.
    // Using date filter avoids full-table scans that cause 504s.
    const pkgQuery = `packages?date_after=${sinceDateStr}&filter_by=Status.NotDraft`
    const allPackages = await fetchPages(token, pkgQuery, "packages", 20)

    let pkgCreated = 0, pkgUpdated = 0, pkgErrors = 0

    for (const pkg of allPackages) {
      try {
        const zohoId = pkg.package_id
        if (!zohoId) continue

        const packageData: Prisma.PackageCreateInput = {
          zohoId,
          packageNumber:    pkg.package_number     || null,
          salesOrderId:     pkg.salesorder_id      || null,
          salesOrderNumber: pkg.salesorder_number  || null,
          date:             pkg.date ? new Date(pkg.date) : null,
          status:           pkg.status             || null,
          carrier:          pkg.delivery_method || pkg.shipping_carrier || null,
          trackingNumber:   pkg.tracking_number    || null,
          shippingCharge:   pkg.shipping_charge    || 0,
          items:            pkg.line_items ? { lineItems: pkg.line_items } : Prisma.JsonNull,
        }

        const result = await prisma.package.upsert({
          where:  { zohoId },
          update: packageData as Prisma.PackageUpdateInput,
          create: packageData,
        })

        const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000
        if (isNew) pkgCreated++; else pkgUpdated++
      } catch (e: any) {
        console.error("Package upsert error:", e.message)
        pkgErrors++
      }
    }

    // ── Purchase Orders ────────────────────────────────────────────────────
    // Filter by date window and only pull open/billed (not cancelled drafts).
    const poQuery = `purchaseorders?date_after=${sinceDateStr}&filter_by=Status.Open,Status.Billed,Status.PartiallyBilled`
    const allPOs = await fetchPages(token, poQuery, "purchaseorders", 20)

    let poCreated = 0, poUpdated = 0, poErrors = 0, dropshipCount = 0

    for (const po of allPOs) {
      try {
        const zohoId = po.purchaseorder_id
        if (!zohoId) continue

        const isDropshipment = !!(po.delivery_customer_id || po.salesorder_id)
        if (isDropshipment) dropshipCount++

        const poData: Prisma.PurchaseOrderCreateInput = {
          zohoId,
          vendorName:       po.vendor_name             || null,
          shipToName:       po.delivery_customer_name || po.customer_name || null,
          referenceNumber:  po.reference_number || po.salesorder_number  || null,
          date:             po.date ? new Date(po.date) : null,
          total:            po.total           || 0,
          status:           po.status          || null,
          salesOrderId:     po.salesorder_id   || null,
          salesOrderNumber: po.salesorder_number || po.reference_number || null,
          isDropshipment,
          trackingNumber:   po.tracking_number || null,
          items:            po.line_items ? { lineItems: po.line_items } : Prisma.JsonNull,
        }

        const result = await prisma.purchaseOrder.upsert({
          where:  { zohoId },
          update: poData as Prisma.PurchaseOrderUpdateInput,
          create: poData,
        })

        const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000
        if (isNew) poCreated++; else poUpdated++
      } catch (e: any) {
        console.error("PO upsert error:", e.message)
        poErrors++
      }
    }

    return NextResponse.json({
      success: true,
      sinceDays,
      packages: {
        total:   allPackages.length,
        created: pkgCreated,
        updated: pkgUpdated,
        errors:  pkgErrors,
      },
      purchaseOrders: {
        total:        allPOs.length,
        dropshipments: dropshipCount,
        created:      poCreated,
        updated:      poUpdated,
        errors:       poErrors,
      },
      message: `Synced ${allPackages.length} packages (${pkgCreated} new) and ${allPOs.length} POs (${dropshipCount} dropshipments, ${poCreated} new) from the last ${sinceDays} days.`,
    })
  } catch (err: any) {
    console.error("sync-packages error:", err)
    const status = err.message?.includes("auth failed") ? 401
                 : err.message?.includes("rate limit")  ? 429
                 : 500
    return NextResponse.json({ error: err.message }, { status })
  }
}
