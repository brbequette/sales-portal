import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

/**
 * Bulk Process Costs -- calls the Netlify process-invoice-costs function directly
 * for each doc in a page, running up to 5 concurrently to reduce wall-clock time.
 *
 * Calls /.netlify/functions/process-invoice-costs instead of the Next.js wrapper
 * /api/process-invoice-costs to avoid the module-level PrismaClient crash that
 * occurs when Next.js statically imports zoho-auth.ts.
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

    const BATCH_CONCURRENCY = 5
    const BATCH_DELAY_MS    = 300

    // -- Resolve the base URL for Netlify function calls ----------------------
    // On Netlify: NETLIFY_URL or DEPLOY_URL is set. Locally: use localhost.
    const siteUrl = process.env.NETLIFY_URL ||
                    process.env.DEPLOY_URL  ||
                    process.env.NEXT_PUBLIC_SITE_URL ||
                    req.nextUrl.origin

    // -- Entity config --------------------------------------------------------
    const ENTITY_CONFIG: Record<string, {
      booksEndpoint: string; listKey: string; idField: string; numField: string
      netlifyFn: string; idBodyField: string; resultKey: string
    }> = {
      invoices:    { booksEndpoint: "invoices",    listKey: "invoices",    idField: "invoice_id",    numField: "invoice_number",    netlifyFn: "process-invoice-costs",    idBodyField: "invoiceId",    resultKey: "invoice"    },
      salesorders: { booksEndpoint: "salesorders", listKey: "salesorders", idField: "salesorder_id", numField: "salesorder_number", netlifyFn: "process-salesorder-costs", idBodyField: "salesorderId", resultKey: "salesorder" },
      estimates:   { booksEndpoint: "estimates",   listKey: "estimates",   idField: "estimate_id",   numField: "estimate_number",   netlifyFn: "process-quote-costs",      idBodyField: "estimateId",   resultKey: "quote"      },
    }
    const cfg = ENTITY_CONFIG[entity]
    if (!cfg) return NextResponse.json({ success: false, error: `Unknown entity: ${entity}` }, { status: 400 })

    // -- Zoho token (inline -- no module-level Prisma) -------------------------
    const ZOHO_DC  = process.env.ZOHO_DC || "com"
    const ORG_ID   = process.env.ZOHO_ORGANIZATION_ID || "664670946"
    const baseUrl  = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    let token: string | null = process.env.ZOHO_ACCESS_TOKEN || null
    if (!token && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
      const tokenRes = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
          client_id:     process.env.ZOHO_CLIENT_ID!,
          client_secret: process.env.ZOHO_CLIENT_SECRET!,
          grant_type:    "refresh_token",
        }).toString(),
      })
      const tokenData: any = await tokenRes.json()
      token = tokenData.access_token || null
    }
    if (!token) return NextResponse.json({ success: false, error: "No Zoho token available" }, { status: 500 })

    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // -- Status filter --------------------------------------------------------
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

    // -- Step 1: 1 list GET ---------------------------------------------------
    const sortParam = entity === "estimates" ? "" : "&sort_column=date&sort_order=D"
    const listRes = await fetch(
      `${baseUrl}/${cfg.booksEndpoint}?organization_id=${ORG_ID}&page=${page}&per_page=${perPage}${sortParam}${statusFilter}`,
      { headers: authHeaders }
    )
    if (!listRes.ok) return NextResponse.json({ success: false, error: `Zoho list error ${listRes.status}` }, { status: 500 })
    const listData: any = await listRes.json()
    if (listData.code !== 0) return NextResponse.json({ success: false, error: listData.message }, { status: 500 })

    const items: any[]  = listData[cfg.listKey] || []
    const hasMore       = listData.page_context?.has_more_page || false

    if (items.length === 0) {
      return NextResponse.json({ success: true, processed: 0, errors: 0, skipped: 0, hasMore: false, page, results: [] })
    }

    // -- Step 2: Parallel process via Netlify function URL --------------------
    const results: any[] = []
    let processed = 0, errors = 0, skipped = 0

    async function processOne(item: any): Promise<void> {
      const docNum   = item[cfg.numField]
      const customer = item.customer_name || ""
      const zohoId   = item[cfg.idField]

      try {
        const fnUrl = `${siteUrl}/.netlify/functions/${cfg.netlifyFn}`
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [cfg.idBodyField]: zohoId, skipLoopGuard: force }),
        })

        const contentType = res.headers.get("content-type") || ""
        if (!contentType.includes("application/json")) {
          throw new Error(`Function returned non-JSON (HTTP ${res.status}) -- check Netlify function logs`)
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
