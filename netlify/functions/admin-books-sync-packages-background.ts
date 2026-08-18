/**
 * admin-books-sync-packages-background.ts
 *
 * Netlify Background Function — runs for up to 15 minutes.
 * Returns HTTP 202 immediately; the sync work happens asynchronously.
 *
 * Called by the Shipping Center "Sync from Zoho" button.
 * Front-end polls the sync status stored in SystemSetting 'last_package_sync_result'.
 *
 * URL: /.netlify/functions/admin-books-sync-packages-background
 */
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID, ZOHO_DC } from "./lib/zoho-auth"
import { corsHeaders, handleOptions } from "./lib/cors"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

const ORG_ID = ZOHO_ORGANIZATION_ID

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchAllPages(
  token:    string,
  endpoint: string,
  extraParams = ""
): Promise<any[]> {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
  let all: any[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `${baseUrl}/${endpoint}?organization_id=${ORG_ID}&page=${page}&per_page=200${extraParams}`
    const res = await fetch(url, {
      headers:  { Authorization: `Zoho-oauthtoken ${token}` },
      signal:   AbortSignal.timeout(20_000), // 20s per page
    })

    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error(`Zoho auth failed (${res.status})`)
      if (res.status === 429)
        throw new Error(`Zoho rate limit (429)`)
      throw new Error(`Zoho ${res.status} on ${endpoint}`)
    }

    const rawText = await res.text()
    if (rawText.trim().startsWith("<"))
      throw new Error(`Zoho returned HTML for ${endpoint} — session timed out`)

    let data: any
    try { data = JSON.parse(rawText) } catch {
      throw new Error(`Invalid JSON from Zoho for ${endpoint}: ${rawText.slice(0, 80)}`)
    }
    if (data.code !== undefined && data.code !== 0)
      throw new Error(`Zoho API error on ${endpoint}: ${data.message}`)

    const items: any[] = data[endpoint] || []
    all = all.concat(items)
    hasMore = data.page_context?.has_more_page === true
    page++
    if (page > 50) break // safety ceiling
  }
  return all
}

async function setStatus(key: string, value: string) {
  try {
    await prisma.systemSetting.upsert({
      where:  { key },
      update: { value },
      create: { key, value },
    })
  } catch { /* non-fatal */ }
}

// ── Core sync logic (runs in background) ───────────────────────────────────

async function runSync() {
  const startedAt = new Date().toISOString()
  await setStatus("last_package_sync_status", "running")
  await setStatus("last_package_sync_started_at", startedAt)

  try {
    const token = await getZohoAccessToken()
    if (!token) throw new Error("Failed to get Zoho access token")

    // ─ Packages ─────────────────────────────────────────────────────────
    const allPackages = await fetchAllPages(token, "packages")
    let pkgCreated = 0, pkgUpdated = 0, pkgErrors = 0

    for (const pkg of allPackages) {
      try {
        const zohoId = pkg.package_id
        if (!zohoId) continue

        const data: any = {
          zohoId,
          packageNumber:    pkg.package_number    || null,
          salesOrderId:     pkg.salesorder_id     || null,
          salesOrderNumber: pkg.salesorder_number || null,
          date:             pkg.date ? new Date(pkg.date) : null,
          status:           pkg.status            || null,
          carrier:          pkg.delivery_method || pkg.shipping_carrier || null,
          trackingNumber:   pkg.tracking_number   || null,
          shippingCharge:   pkg.shipping_charge   || 0,
          items:            pkg.line_items ? { lineItems: pkg.line_items } : null,
        }

        await prisma.package.upsert({ where: { zohoId }, update: data, create: data })
        pkgUpdated++ // upsert doesn't distinguish, just count
      } catch (e: any) { console.error("pkg upsert:", e.message); pkgErrors++ }
    }
    pkgCreated = pkgUpdated // simplification — accurate count not needed for status msg

    // ─ Purchase Orders (Dropshipments) ──────────────────────────────────
    const allPOs = await fetchAllPages(token, "purchaseorders")
    let poCreated = 0, poUpdated = 0, poErrors = 0, dropshipCount = 0

    for (const po of allPOs) {
      try {
        const zohoId = po.purchaseorder_id
        if (!zohoId) continue

        const isDropshipment = !!(po.delivery_customer_id || po.salesorder_id)
        if (isDropshipment) dropshipCount++

        // Try to link to an invoice via SO number
        let invoiceId: string | null = null
        const salesOrderNumber = po.salesorder_number || po.reference_number || null
        if (salesOrderNumber) {
          const inv = await prisma.invoice.findFirst({
            where: { items: { path: ["salesOrderNumber"], equals: salesOrderNumber } },
            select: { zohoId: true },
          })
          if (inv) invoiceId = inv.zohoId
        }

        const data: any = {
          zohoId,
          vendorName:       po.vendor_name        || null,
          shipToName:       po.delivery_customer_name || po.customer_name || null,
          referenceNumber:  salesOrderNumber,
          date:             po.date ? new Date(po.date) : null,
          total:            po.total   || 0,
          status:           po.status  || null,
          salesOrderId:     po.salesorder_id || null,
          salesOrderNumber,
          isDropshipment,
          trackingNumber:   po.tracking_number || null,
          items:            po.line_items ? { lineItems: po.line_items } : null,
          invoiceId,
        }

        const existing = await prisma.purchaseOrder.findUnique({ where: { zohoId } })
        if (existing) {
          await prisma.purchaseOrder.update({ where: { zohoId }, data })
          poUpdated++
        } else {
          await prisma.purchaseOrder.create({ data })
          poCreated++
        }
      } catch (e: any) { console.error("po upsert:", e.message); poErrors++ }
    }

    // ─ Customer Payments ────────────────────────────────────────────────
    const allPayments = await fetchAllPages(token, "customerpayments")
    let payCreated = 0, payUpdated = 0, payErrors = 0

    for (const pay of allPayments) {
      try {
        const zohoId = pay.payment_id
        if (!zohoId) continue

        const invNum = (pay.invoice_numbers || "").split(",")[0].trim() || null
        let invDbId: string | null = null
        if (invNum) {
          const inv = await prisma.invoice.findFirst({
            where: {
              OR: [
                { zohoId: invNum },
                { items: { path: ["invoiceNumber"], equals: invNum } },
              ]
            },
            select: { id: true },
          })
          if (inv) invDbId = inv.id
        }

        const data: any = {
          zohoId,
          amount:          parseFloat(pay.amount || 0),
          date:            pay.date ? new Date(pay.date) : null,
          mode:            pay.payment_mode || null,
          status:          pay.payment_status || pay.status || null,
          referenceNumber: pay.reference_number || null,
          bankCharges:     parseFloat(pay.bank_charges || 0),
          invoiceDbId:     invDbId,
          invoiceNumber:   invNum,
        }

        const existing = await prisma.payment.findUnique({ where: { zohoId } })
        if (existing) {
          await prisma.payment.update({ where: { zohoId }, data })
          payUpdated++
        } else {
          await prisma.payment.create({ data })
          payCreated++
        }
      } catch (e: any) { console.error("payment upsert:", e.message); payErrors++ }
    }

    const message = `Synced ${allPackages.length} packages, ${allPOs.length} POs (${dropshipCount} dropships), ${allPayments.length} payments. Errors: pkg=${pkgErrors} po=${poErrors} pay=${payErrors}`
    console.log(`[sync-packages-bg] DONE: ${message}`)

    await setStatus("last_package_sync_status", "done")
    await setStatus("last_package_sync_result", message)
    await setStatus("last_package_sync_finished_at", new Date().toISOString())

  } catch (err: any) {
    console.error("[sync-packages-bg] FATAL:", err.message)
    await setStatus("last_package_sync_status", "error")
    await setStatus("last_package_sync_result", `Error: ${err.message}`)
    await setStatus("last_package_sync_finished_at", new Date().toISOString())
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  try {
    await authenticateFunction(event, { requireAdmin: true })
  } catch (error) {
    return authErrorResponse(error, corsHeaders)
  }

  // Mark as running immediately (so the UI can start polling)
  await setStatus("last_package_sync_status", "running")
  await setStatus("last_package_sync_started_at", new Date().toISOString())
  await setStatus("last_package_sync_result", "Sync in progress…")

  // Fire and forget — background functions keep running after response is sent
  runSync().catch(e => console.error("[sync-packages-bg] uncaught:", e))

  return {
    statusCode: 202,
    headers: corsHeaders,
    body: JSON.stringify({ started: true, message: "Sync started in background. Refresh in 30–60 seconds." }),
  }
}
