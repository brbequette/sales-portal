import { NextRequest, NextResponse } from "next/server"
import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient()

const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"

import { getZohoAccessToken } from "@/lib/zoho-auth"

async function getToken(): Promise<string> {
  const token = await getZohoAccessToken()
  if (!token) throw new Error("Failed to get Zoho access token")
  return token
}

async function fetchAllPages(baseUrl: string, token: string, endpoint: string): Promise<any[]> {
  let all: any[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `${baseUrl}/${endpoint}?organization_id=${ORG_ID}&page=${page}&per_page=200`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Zoho auth failed (${res.status}) -- token may be expired. Try again in a minute.`)
      }
      if (res.status === 429) {
        throw new Error(`Zoho rate limit hit -- wait a minute and try again.`)
      }
      if (res.status === 504) {
        throw new Error(`Zoho gateway timeout (504) on ${endpoint} -- Zoho servers are busy. Wait a moment and try again.`)
      }
      throw new Error(`Zoho API returned ${res.status} for ${endpoint}`)
    }

    const rawText = await res.text()
    if (rawText.trim().startsWith('<')) {
      throw new Error(`Zoho returned HTML instead of JSON for ${endpoint} -- session may have timed out. Try again in a minute.`)
    }

    let data: any
    try { data = JSON.parse(rawText) } catch {
      throw new Error(`Invalid JSON from Zoho for ${endpoint}: ${rawText.substring(0, 80)}`)
    }

    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`Zoho API error on ${endpoint}: ${data.message}`)
    }

    const items = data[endpoint] || []
    all = all.concat(items)

    hasMore = data.page_context?.has_more_page || false
    page++
    if (page > 50) break
  }

  return all
}

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const token = await getToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // -- Sync Packages --
    const allPackages = await fetchAllPages(baseUrl, token, "packages")

    let pkgCreated = 0, pkgUpdated = 0, pkgErrors = 0

    for (const pkg of allPackages) {
      try {
        const zohoId = pkg.package_id
        if (!zohoId) continue

        const packageData: any = {
          zohoId,
          packageNumber: pkg.package_number || null,
          salesOrderId: pkg.salesorder_id || null,
          salesOrderNumber: pkg.salesorder_number || null,
          date: pkg.date ? new Date(pkg.date) : null,
          status: pkg.status || null,
          carrier: pkg.delivery_method || pkg.shipping_carrier || null,
          trackingNumber: pkg.tracking_number || null,
          shippingCharge: pkg.shipping_charge || 0,
          items: pkg.line_items ? { lineItems: pkg.line_items } : Prisma.JsonNull,
        }

        // Use upsert: 1 DB query instead of 2 (find + create/update)
        const result = await prisma.package.upsert({
          where: { zohoId },
          update: packageData,
          create: packageData,
        })

        // Prisma upsert doesn't directly tell us if it created or updated,
        // so track via whether the record existed before by checking createdAt ~ updatedAt
        const wasCreated = result.createdAt && result.updatedAt &&
          Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000
        if (wasCreated) pkgCreated++
        else pkgUpdated++
      } catch (e: any) {
        console.error("Package upsert error:", e.message)
        pkgErrors++
      }
    }

    // -- Sync Dropshipment POs --
    const allPOs = await fetchAllPages(baseUrl, token, "purchaseorders")

    let poCreated = 0, poUpdated = 0, poErrors = 0, dropshipCount = 0

    for (const po of allPOs) {
      try {
        const zohoId = po.purchaseorder_id
        if (!zohoId) continue

        // Check if this PO is a dropshipment (has delivery_customer_id or salesorder_id)
        const isDropshipment = !!(po.delivery_customer_id || po.salesorder_id)
        if (isDropshipment) dropshipCount++

        const poData: any = {
          zohoId,
          vendorName: po.vendor_name || null,
          shipToName: po.delivery_customer_name || po.customer_name || null,
          referenceNumber: po.reference_number || po.salesorder_number || null,
          date: po.date ? new Date(po.date) : null,
          total: po.total || 0,
          status: po.status || null,
          salesOrderId: po.salesorder_id || null,
          salesOrderNumber: po.salesorder_number || po.reference_number || null,
          isDropshipment,
          trackingNumber: po.tracking_number || null,
          items: po.line_items ? { lineItems: po.line_items } : Prisma.JsonNull,
        }

        // Use upsert: 1 DB query instead of 2
        const result = await prisma.purchaseOrder.upsert({
          where: { zohoId },
          update: poData,
          create: poData,
        })

        const wasCreated = result.createdAt && result.updatedAt &&
          Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000
        if (wasCreated) poCreated++
        else poUpdated++
      } catch (e: any) {
        console.error("PO upsert error:", e.message)
        poErrors++
      }
    }

    return NextResponse.json({
      success: true,
      packages: { total: allPackages.length, created: pkgCreated, updated: pkgUpdated, errors: pkgErrors },
      purchaseOrders: { total: allPOs.length, dropshipments: dropshipCount, created: poCreated, updated: poUpdated, errors: poErrors },
      message: `Synced ${allPackages.length} packages (${pkgCreated} new) and ${allPOs.length} POs (${dropshipCount} dropshipments, ${poCreated} new).`,
    })
  } catch (err: any) {
    console.error("sync-packages error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
