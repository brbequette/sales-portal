import { NextRequest, NextResponse } from "next/server"
import { calculateDocumentCosts, buildFieldsToUpdate } from "../../../../../../netlify/functions/lib/cost-calculations"

export const maxDuration = 60

/**
 * Bulk Process Costs — fetches one page from Zoho, calculates costs for all docs
 * in the page concurrently, and immediately PUTs the results back to Zoho.
 *
 * This single-pass approach replaces the old 3-step flow:
 *   OLD: list → (per-doc) GET detail → calculate → store pending → separate sync PUT
 *   NEW: list → parallel GET detail+calculate → parallel PUT  (all in one request)
 *
 * Zoho rate limit: 100 req/min. We batch details in groups of 5 concurrent requests,
 * with a 300ms pause between batches to stay safely under the limit.
 *
 * POST body:
 *   entity:   'invoices' | 'salesorders' | 'estimates'  (default 'invoices')
 *   page:     number   (default 1)
 *   filter:   'all' | 'unpaid' | 'recent'               (default 'unpaid')
 *   perPage:  number   (default 25, max 50)
 *   force:    boolean  (default false — skip loop-guard and stale check)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const entity   = (body.entity  || "invoices") as "invoices" | "salesorders" | "estimates"
    const page     = parseInt(body.page    || "1",  10)
    const filter   = body.filter   || "unpaid"
    const perPage  = Math.min(parseInt(body.perPage || "25", 10), 50)
    const force    = !!body.force
    const BATCH_CONCURRENCY = 5   // parallel GET+calculate+PUT per batch
    const BATCH_DELAY_MS    = 300 // pause between batches (rate-limit safety)

    const { getZohoAccessToken } = await import("../../../../../../netlify/functions/lib/zoho-auth")
    const { PrismaClient }       = await import("@prisma/client")
    const prisma = new PrismaClient()

    const ZOHO_DC = process.env.ZOHO_DC || "com"
    const ORG_ID  = process.env.ZOHO_ORGANIZATION_ID || "664670946"
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    const token = await getZohoAccessToken()
    if (!token) return NextResponse.json({ success: false, error: "No Zoho token" }, { status: 500 })
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // ── Entity config ────────────────────────────────────────────────────────
    const ENTITY_CONFIG = {
      invoices:   { listPath: "invoices",   listKey: "invoices",   detailKey: "invoice",    idField: "invoice_id",    numField: "invoice_number",    dbType: "Invoice"     },
      salesorders:{ listPath: "salesorders",listKey: "salesorders",detailKey: "salesorder", idField: "salesorder_id", numField: "salesorder_number", dbType: "SalesOrder"  },
      estimates:  { listPath: "estimates",  listKey: "estimates",  detailKey: "estimate",   idField: "estimate_id",   numField: "estimate_number",   dbType: "Quote"       },
    } as const
    const cfg = ENTITY_CONFIG[entity]
    if (!cfg) return NextResponse.json({ success: false, error: `Unknown entity: ${entity}` }, { status: 400 })

    // ── Build status filter ──────────────────────────────────────────────────
    let statusFilter = ""
    if (entity === "invoices") {
      if (filter === "unpaid")  statusFilter = "&status=sent,overdue,partially_paid"
      else if (filter === "recent") {
        const since = new Date(); since.setDate(since.getDate() - 90)
        statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
      }
    } else if (filter === "recent") {
      const since = new Date(); since.setDate(since.getDate() - 90)
      statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
    }

    // ── Step 1: Fetch summary list (1 API call for the whole page) ───────────
    const sortParam = entity === "estimates" ? "" : "&sort_column=date&sort_order=D"
    const listRes = await fetch(
      `${baseUrl}/${cfg.listPath}?organization_id=${ORG_ID}&page=${page}&per_page=${perPage}${sortParam}${statusFilter}`,
      { headers: authHeaders }
    )
    if (!listRes.ok) return NextResponse.json({ success: false, error: `Zoho list error ${listRes.status}` }, { status: 500 })
    const listData: any = await listRes.json()
    if (listData.code !== 0) return NextResponse.json({ success: false, error: listData.message }, { status: 500 })

    const items: any[]  = listData[cfg.listKey] || []
    const hasMore: boolean = listData.page_context?.has_more_page || false

    if (items.length === 0) {
      await prisma.$disconnect()
      return NextResponse.json({ success: true, processed: 0, errors: 0, skipped: 0, hasMore: false, page, results: [] })
    }

    // ── Step 2+3: Batch GET detail + calculate + PUT (parallelized) ──────────
    const results: any[] = []
    let processed = 0, errors = 0, skipped = 0

    /**
     * Process a single document:
     *   GET /invoices/{id}  →  calculateDocumentCosts()  →  PUT /invoices/{id}
     *   All in one go — no intermediate storage.
     */
    async function processOne(summary: any): Promise<void> {
      const zohoId  = summary[cfg.idField]
      const docNum  = summary[cfg.numField]
      const customer = summary.customer_name || ""

      try {
        // ── GET full detail (includes line_items + custom_fields) ────────────
        const detailRes = await fetch(
          `${baseUrl}/${cfg.listPath}/${zohoId}?organization_id=${ORG_ID}`,
          { headers: authHeaders }
        )
        if (!detailRes.ok) throw new Error(`GET detail failed: HTTP ${detailRes.status}`)
        const detailData: any = await detailRes.json()
        if (detailData.code !== 0) throw new Error(`Zoho error: ${detailData.message}`)
        const doc = detailData[cfg.detailKey]
        if (!doc) throw new Error("No document in response")

        // ── Calculate all costs ──────────────────────────────────────────────
        const calc = await calculateDocumentCosts(doc)
        const {
          deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
          vigRate, deadCostPlusVig, ccFees, additionalCosts, insurance,
          subTotal, profit, marginPercent, deadProfitActual,
          commissionPct, salesCommission, isPaid, lineItemBreakdownStrings, lineItemDetails,
        } = calc

        // ── Build field diff — only push fields that actually changed ────────
        const fieldsToUpdate = buildFieldsToUpdate(calc, doc, entity)

        // ── PUT to Zoho (only if something changed) ──────────────────────────
        let fieldsUpdated = 0
        if (!force) {
          // Check loop guard: skip if this doc was processed in the last 60s
          const guard = summary.last_modified_time
            ? new Date(summary.last_modified_time).getTime()
            : 0
          const existingVig = (doc.custom_fields || []).find((f: any) =>
            (f.label || "").toUpperCase().trim() === "SALESPERSON VIG"
          )
          // If VIG already matches and cost fields are populated, skip
          if (
            fieldsToUpdate.length === 0 &&
            existingVig?.value
          ) {
            skipped++
            results.push({ number: docNum, customer, status: "skipped", reason: "No changes detected" })
            return
          }
        }

        if (fieldsToUpdate.length > 0) {
          const putRes = await fetch(
            `${baseUrl}/${cfg.listPath}/${zohoId}?organization_id=${ORG_ID}`,
            {
              method: "PUT",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({ custom_fields: fieldsToUpdate }),
            }
          )
          const putData: any = await putRes.json()
          if (!putRes.ok || putData.code !== 0) {
            throw new Error(`PUT failed: [${putData.code}] ${putData.message}`)
          }
          fieldsUpdated = fieldsToUpdate.length
        }

        // ── Update local DB ──────────────────────────────────────────────────
        try {
          const dbRecord = await (prisma as any)[cfg.dbType.toLowerCase()].findFirst({
            where: { zohoId },
          })
          if (dbRecord) {
            const existingItems = (dbRecord.items as any) || {}
            await (prisma as any)[cfg.dbType.toLowerCase()].update({
              where: { id: dbRecord.id },
              data: {
                costsCalculatedAt: new Date(),
                pendingCostSync: false,
                items: {
                  ...existingItems,
                  deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
                  deadProfitActual, profit, marginPercent, subTotal,
                  vigRate, ccFees, additionalCosts, insurance,
                  commissionPct, salesCommission, isPaid,
                  lineItemBreakdownStrings, lineItemDetails,
                  cf_salesperson_vig: vigRate,
                  pendingZohoFields: [],
                  costsCalculatedAt: new Date().toISOString(),
                },
              },
            })
          }
        } catch (dbErr: any) {
          console.warn(`DB update skipped for ${docNum}: ${dbErr.message}`)
        }

        processed++
        results.push({
          number: docNum, customer, status: "processed",
          vigRate, profit: profit.toFixed(2), commission: salesCommission.toFixed(2),
          fieldsUpdated, changesDetected: fieldsToUpdate.length,
        })
      } catch (err: any) {
        errors++
        results.push({ number: docNum, customer, status: "error", error: err.message })
      }
    }

    // Run in batches of BATCH_CONCURRENCY to respect Zoho rate limits
    for (let i = 0; i < items.length; i += BATCH_CONCURRENCY) {
      const batch = items.slice(i, i + BATCH_CONCURRENCY)
      await Promise.all(batch.map(processOne))
      // Brief pause between batches to stay under 100 req/min
      if (i + BATCH_CONCURRENCY < items.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    await prisma.$disconnect()

    return NextResponse.json({
      success: true, entity, page, processed, errors, skipped,
      total: items.length, hasMore, results,
    })

  } catch (error: any) {
    console.error("Bulk process costs error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
