import { NextRequest, NextResponse } from "next/server"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"

export const maxDuration = 60

/**
 * Bulk Process Costs -- calls the per-document Next.js API routes
 * (/api/process-invoice-costs, /api/process-salesorder-costs, /api/process-quote-costs)
 * for each doc in a page, running up to 5 concurrently to reduce wall-clock time.
 *
 * POST body:
 *   entity:   'invoices' | 'salesorders' | 'estimates'  (default 'invoices')
 *   page:     number   (default 1)
 *   filter:   'all' | 'unpaid' | 'recent'               (default 'unpaid')
 *   perPage:  number   (default 25, max 50)
 *   force:    boolean  (skip loop-guard -- default false)
 */
export async function POST(req: NextRequest) {
  try {
    const body     = await req.json().catch(() => ({}))
    const entity   = body.entity   || "invoices"
    const page     = parseInt(body.page    || "1",  10)
    const filter   = body.filter   || "unpaid"
    const perPage  = Math.min(parseInt(body.perPage || "25", 10), 50)
    const force    = !!body.force
    const applyTariff = !!body.applyTariff

    const BATCH_CONCURRENCY = 5
    const BATCH_DELAY_MS    = 300


    // -- Entity config --------------------------------------------------------
    // Map each entity to its Next.js API route (which directly imports the handler code).
    // These routes work on Vercel — the old /.netlify/functions/... URLs do NOT.
    const ENTITY_CONFIG: Record<string, {
      booksEndpoint: string; listKey: string; idField: string; numField: string
      apiRoute: string; idBodyField: string; resultKey: string
    }> = {
      invoices:    { booksEndpoint: "invoices",    listKey: "invoices",    idField: "invoice_id",    numField: "invoice_number",    apiRoute: "/api/process-invoice-costs",    idBodyField: "invoiceId",    resultKey: "invoice"    },
      salesorders: { booksEndpoint: "salesorders", listKey: "salesorders", idField: "salesorder_id", numField: "salesorder_number", apiRoute: "/api/process-salesorder-costs", idBodyField: "salesorderId", resultKey: "salesorder" },
      estimates:   { booksEndpoint: "estimates",   listKey: "estimates",   idField: "estimate_id",   numField: "estimate_number",   apiRoute: "/api/process-quote-costs",      idBodyField: "estimateId",   resultKey: "quote"      },
    }
    const cfg = ENTITY_CONFIG[entity]
    if (!cfg) return NextResponse.json({ success: false, error: `Unknown entity: ${entity}` }, { status: 400 })

    // -- Zoho token (shared helper: memory cache → DB cache → OAuth refresh) ---
    const ORG_ID  = ZOHO_ORGANIZATION_ID
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    let tokenValue: string | null = null
    try {
      tokenValue = await getZohoAccessToken()
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Zoho auth failed: ${e.message}` }, { status: 500 })
    }
    if (!tokenValue) return NextResponse.json({ success: false, error: "No Zoho token available" }, { status: 500 })
    const token: string = tokenValue

    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // -- Status / date filter --------------------------------------------------
    let statusFilter = ""
    if (filter === "unpaid" && entity === "invoices") {
      statusFilter = "&status=sent,overdue,partially_paid"
    } else if (filter === "draft") {
      statusFilter = "&status=draft"
    } else if (filter === "recent") {
      const since = new Date(); since.setDate(since.getDate() - 90)
      statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
    } else if (filter === "daterange" && body.startDate && body.endDate) {
      statusFilter = `&date_start=${body.startDate}&date_end=${body.endDate}`
    }

    // -- Step 1: 1 list GET ---------------------------------------------------
    const sortParam = entity === "estimates" ? "" : "&sort_column=date&sort_order=D"
    const listRes = await fetch(
      `${baseUrl}/${cfg.booksEndpoint}?organization_id=${ORG_ID}&page=${page}&per_page=${perPage}${sortParam}${statusFilter}`, { signal: AbortSignal.timeout(15000), headers: authHeaders }
    )
    if (!listRes.ok) return NextResponse.json({ success: false, error: `Zoho list error ${listRes.status}` }, { status: 500 })
    const listData: any = await listRes.json()
    if (listData.code !== 0) return NextResponse.json({ success: false, error: listData.message }, { status: 500 })

    const items: any[]  = listData[cfg.listKey] || []
    const hasMore       = listData.page_context?.has_more_page || false

    if (items.length === 0) {
      return NextResponse.json({ success: true, processed: 0, errors: 0, skipped: 0, hasMore: false, page, results: [] })
    }

    // -- Step 2: Call each doc's Next.js API route directly (works on Vercel) --
    const results: any[] = []
    let processed = 0, errors = 0, skipped = 0
    // The per-document routes enforce the same NextAuth session as a direct
    // browser request. Preserve it for these server-to-server calls; without
    // this cookie every document is rejected with HTTP 401.
    const sessionCookie = req.headers.get("cookie") || ""

    async function processOne(item: any): Promise<void> {
      const docNum   = item[cfg.numField]
      const customer = item.customer_name || ""
      const zohoId   = item[cfg.idField]

      try {
        // Use Next.js API route (works on Vercel) — not /.netlify/functions/...
        const fnUrl = `${req.nextUrl.origin}${cfg.apiRoute}`
        const res = await fetch(fnUrl, { signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(sessionCookie ? { cookie: sessionCookie } : {}),
          },
          body: JSON.stringify({ [cfg.idBodyField]: zohoId, skipLoopGuard: force, applyTariff }),
        })

        const contentType = res.headers.get("content-type") || ""
        if (!contentType.includes("application/json")) {
          throw new Error(`API route returned non-JSON (HTTP ${res.status}) -- route may not exist or server error`)
        }

        const data: any = await res.json()
        if (data.success) {
          if (data.skipped) {
            skipped++
            results.push({ number: docNum, customer, status: "skipped", reason: data.reason })
          } else {
            processed++
            const doc = data[cfg.resultKey] || {}
            results.push({
              number: docNum, customer, status: "processed",
              vigRate:         doc.vigRate,
              profit:          doc.profit,
              commission:      doc.salesCommission,
              fieldsUpdated:   doc.fieldsUpdated   || 0,
              changesDetected: doc.changesDetected || 0,
            })
          }
        } else {
          errors++
          results.push({ number: docNum, customer, status: "error", error: data.error })
        }
      } catch (err: any) {
        errors++
        results.push({ number: docNum, customer, status: "error", error: err.message })
      }
    }

    for (let i = 0; i < items.length; i += BATCH_CONCURRENCY) {
      await Promise.all(items.slice(i, i + BATCH_CONCURRENCY).map(processOne))
      if (i + BATCH_CONCURRENCY < items.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    return NextResponse.json({
      success: true, entity, page,
      processed, errors, skipped,
      total: items.length, hasMore, results,
    })

  } catch (error: any) {
    console.error("Bulk process costs error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
