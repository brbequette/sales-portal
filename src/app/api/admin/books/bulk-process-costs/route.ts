import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

/**
 * Bulk Process Costs — fetches one page from Zoho, then calls the individual
 * cost-processor routes (process-invoice-costs, etc.) in parallel batches of 5.
 *
 * This keeps the proven process-* routes as the single source of truth for
 * cost calculation logic while cutting wall-clock time by ~5x vs sequential.
 *
 * API calls per page of 25:
 *   1 list GET  +  25 detail GETs (inside process-* routes)  +  25 PUTs  = 51
 *   All detail GETs+PUTs run 5-at-a-time concurrently.
 *
 * POST body:
 *   entity:   'invoices' | 'salesorders' | 'estimates'  (default 'invoices')
 *   page:     number   (default 1)
 *   filter:   'all' | 'unpaid' | 'recent'               (default 'unpaid')
 *   perPage:  number   (default 25, max 50)
 *   force:    boolean  (skip loop-guard — default false)
 */
export async function POST(req: NextRequest) {
  try {
    const body     = await req.json().catch(() => ({}))
    const entity   = body.entity   || "invoices"
    const page     = parseInt(body.page    || "1",  10)
    const filter   = body.filter   || "unpaid"
    const perPage  = Math.min(parseInt(body.perPage || "25", 10), 50)
    const force    = !!body.force

    const BATCH_CONCURRENCY = 5    // parallel calls per batch
    const BATCH_DELAY_MS    = 300  // ms between batches (Zoho rate-limit safety)

    const { getZohoAccessToken } = await import("../../../../../../netlify/functions/lib/zoho-auth")

    const ZOHO_DC = process.env.ZOHO_DC || "com"
    const ORG_ID  = process.env.ZOHO_ORGANIZATION_ID || "664670946"
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    const token = await getZohoAccessToken()
    if (!token) return NextResponse.json({ success: false, error: "No Zoho token" }, { status: 500 })
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // ── Entity config ────────────────────────────────────────────────────────
    const ENTITY_CONFIG: Record<string, {
      listPath: string; listKey: string; idField: string; numField: string; processRoute: string; idBodyField: string; resultKey: string
    }> = {
      invoices:    { listPath: "invoices",    listKey: "invoices",    idField: "invoice_id",    numField: "invoice_number",    processRoute: "/api/process-invoice-costs",    idBodyField: "invoiceId",    resultKey: "invoice"    },
      salesorders: { listPath: "salesorders", listKey: "salesorders", idField: "salesorder_id", numField: "salesorder_number", processRoute: "/api/process-salesorder-costs", idBodyField: "salesorderId", resultKey: "salesorder" },
      estimates:   { listPath: "estimates",   listKey: "estimates",   idField: "estimate_id",   numField: "estimate_number",   processRoute: "/api/process-quote-costs",      idBodyField: "estimateId",   resultKey: "quote"      },
    }
    const cfg = ENTITY_CONFIG[entity]
    if (!cfg) return NextResponse.json({ success: false, error: `Unknown entity: ${entity}` }, { status: 400 })

    // ── Status filter ────────────────────────────────────────────────────────
    let statusFilter = ""
    if (entity === "invoices") {
      if (filter === "unpaid") statusFilter = "&status=sent,overdue,partially_paid"
      else if (filter === "recent") {
        const since = new Date(); since.setDate(since.getDate() - 90)
        statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
      }
    } else if (filter === "recent") {
      const since = new Date(); since.setDate(since.getDate() - 90)
      statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
    }

    // ── Step 1: 1 list GET for the whole page ────────────────────────────────
    const sortParam = entity === "estimates" ? "" : "&sort_column=date&sort_order=D"
    const listRes = await fetch(
      `${baseUrl}/${cfg.listPath}?organization_id=${ORG_ID}&page=${page}&per_page=${perPage}${sortParam}${statusFilter}`,
      { headers: authHeaders }
    )
    if (!listRes.ok) return NextResponse.json({ success: false, error: `Zoho list error ${listRes.status}` }, { status: 500 })
    const listData: any = await listRes.json()
    if (listData.code !== 0) return NextResponse.json({ success: false, error: listData.message }, { status: 500 })

    const items: any[] = listData[cfg.listKey] || []
    const hasMore: boolean = listData.page_context?.has_more_page || false

    if (items.length === 0) {
      return NextResponse.json({ success: true, processed: 0, errors: 0, skipped: 0, hasMore: false, page, results: [] })
    }

    // ── Step 2: Parallel process in batches of BATCH_CONCURRENCY ─────────────
    const origin = req.nextUrl.origin
    const results: any[] = []
    let processed = 0, errors = 0, skipped = 0

    async function processOne(item: any): Promise<void> {
      const docNum   = item[cfg.numField]
      const customer = item.customer_name || ""
      const zohoId   = item[cfg.idField]

      try {
        const res = await fetch(`${origin}${cfg.processRoute}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [cfg.idBodyField]: zohoId, skipLoopGuard: force }),
        })

        // Guard: if response is not JSON (e.g. HTML 500), surface the status code
        const contentType = res.headers.get("content-type") || ""
        if (!contentType.includes("application/json")) {
          throw new Error(`Process route returned non-JSON (HTTP ${res.status})`)
        }

        const data: any = await res.json()
        if (data.success) {
          if (data.skipped) {
            skipped++
            results.push({ number: docNum, customer, status: "skipped", reason: data.reason || "Loop guard" })
          } else {
            processed++
            const doc = data[cfg.resultKey] || {}
            results.push({
              number: docNum, customer, status: "processed",
              vigRate:         doc.vigRate,
              profit:          doc.profit?.toFixed?.(2) ?? doc.profit,
              commission:      doc.salesCommission?.toFixed?.(2) ?? doc.salesCommission,
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

    // Run in batches to stay under Zoho 100 req/min rate limit
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
