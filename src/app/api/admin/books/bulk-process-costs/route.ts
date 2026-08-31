import { NextRequest, NextResponse } from "next/server"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
import { requireAdministrator } from "@/lib/auth-helpers"
import { processInvoiceCostsForSystem } from "../../../../../../netlify/functions/process-invoice-costs"
import { processSalesOrderCostsForSystem } from "../../../../../../netlify/functions/process-salesorder-costs"
import { processQuoteCostsForSystem } from "../../../../../../netlify/functions/process-quote-costs"
import { executeSyncCostsToZoho } from "@/app/api/sync-costs-to-zoho/route"

export const maxDuration = 60

/**
 * Bulk Process Costs -- runs the per-document calculation and sync handlers
 * directly in-process for each doc in a page, running up to 5 concurrently to reduce wall-clock time.
 *
 * POST body:
 *   entity:       'invoices' | 'salesorders' | 'estimates'  (default 'invoices')
 *   page:         number   (default 1)
 *   filter:       'all' | 'unpaid' | 'recent' | 'daterange' | 'draft'  (default 'unpaid')
 *   perPage:      number   (default 25, max 50)
 *   force:        boolean  (skip loop-guard -- default false)
 *   applyTariff:  boolean  (default true for invoices)
 *   startDate:    string   (used when filter = 'daterange')
 *   endDate:      string   (used when filter = 'daterange')
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body     = await req.json().catch(() => ({}))
    const entity   = body.entity   || "invoices"
    const page     = parseInt(body.page    || "1",  10)
    const filter   = body.filter   || "unpaid"
    const perPage  = Math.min(parseInt(body.perPage || "25", 10), 50)
    const force    = !!body.force
    const applyTariff = !!body.applyTariff

    const BATCH_CONCURRENCY = 5
    const BATCH_DELAY_MS    = 300

    const ENTITY_CONFIG: Record<string, {
      booksEndpoint: string; listKey: string; idField: string; numField: string; resultKey: string
    }> = {
      invoices:    { booksEndpoint: "invoices",    listKey: "invoices",    idField: "invoice_id",    numField: "invoice_number",    resultKey: "invoice"    },
      salesorders: { booksEndpoint: "salesorders", listKey: "salesorders", idField: "salesorder_id", numField: "salesorder_number", resultKey: "salesorder" },
      estimates:   { booksEndpoint: "estimates",   listKey: "estimates",   idField: "estimate_id",   numField: "estimate_number",   resultKey: "quote"      },
    }
    const cfg = ENTITY_CONFIG[entity]
    if (!cfg) return NextResponse.json({ success: false, error: `Unknown entity: ${entity}` }, { status: 400 })

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
    if (filter === "daterange" && (body.startDate || body.endDate)) {
      if (body.startDate) statusFilter += `&date_start=${body.startDate}`
      if (body.endDate) statusFilter += `&date_end=${body.endDate}`
    } else if (filter === "draft") {
      statusFilter = "&status=draft"
    } else if (filter === "unpaid" && entity === "invoices") {
      statusFilter = "&status=sent,overdue,partially_paid"
    } else if (filter === "recent") {
      const since = new Date(); since.setDate(since.getDate() - 90)
      statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
    }

    // -- Step 1: 1 list GET ---------------------------------------------------
    const sortParam = entity === "estimates" ? "" : "&sort_column=date&sort_order=D"
    const listRes = await fetch(
      `${baseUrl}/${cfg.booksEndpoint}?organization_id=${ORG_ID}&page=${page}&per_page=${perPage}${sortParam}${statusFilter}`,
      { signal: AbortSignal.timeout(15000), headers: authHeaders }
    )
    if (!listRes.ok) return NextResponse.json({ success: false, error: `Zoho list error ${listRes.status}` }, { status: 500 })
    const listData: any = await listRes.json()
    if (listData.code !== 0) return NextResponse.json({ success: false, error: listData.message }, { status: 500 })

    const items: any[]  = listData[cfg.listKey] || []
    const hasMore       = listData.page_context?.has_more_page || false

    if (items.length === 0) {
      return NextResponse.json({ success: true, processed: 0, errors: 0, skipped: 0, hasMore: false, page, results: [] })
    }

    // -- Step 2: Directly execute each doc's calculation handler in-process ---
    const results: any[] = []
    let processed = 0, errors = 0, skipped = 0

    async function processOne(item: any): Promise<void> {
      const docNum   = item[cfg.numField]
      const customer = item.customer_name || ""
      const zohoId   = item[cfg.idField]

      try {
        let handlerRes: any = null

        if (entity === "invoices") {
          handlerRes = await processInvoiceCostsForSystem(zohoId, {
            invoiceNumber: docNum,
            skipLoopGuard: force,
            applyTariff,
          })
        } else if (entity === "salesorders") {
          handlerRes = await processSalesOrderCostsForSystem(zohoId, docNum, {
            skipLoopGuard: force,
          })
        } else if (entity === "estimates") {
          handlerRes = await processQuoteCostsForSystem(zohoId, docNum, {
            skipLoopGuard: force,
          })
        }

        const data: any = JSON.parse(handlerRes?.body || "{}")
        if (handlerRes?.statusCode === 200 && data.success) {
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
              commission:      doc.salesCommission ?? doc.commission ?? 0,
              fieldsUpdated:   doc.fieldsUpdated   || 0,
              changesDetected: doc.changesDetected || 0,
            })
          }
        } else {
          errors++
          results.push({ number: docNum, customer, status: "error", error: data.error || `Error status ${handlerRes?.statusCode}` })
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

    // Auto-sync processed document changes directly to Zoho Books
    let autoSyncResult: any = null
    if (processed > 0) {
      try {
        const docTypesMap: Record<string, "invoices" | "salesorders" | "quotes"> = {
          invoices: "invoices",
          salesorders: "salesorders",
          estimates: "quotes",
        }
        const targetType = docTypesMap[entity] || "invoices"
        autoSyncResult = await executeSyncCostsToZoho({ docTypes: [targetType] })
      } catch (syncErr: any) {
        console.warn("[bulk-process-costs] In-process auto-sync warning:", syncErr.message)
        autoSyncResult = { success: false, error: syncErr.message }
      }
    }

    return NextResponse.json({
      success: true, entity, page,
      processed, errors, skipped,
      total: items.length, hasMore, results,
      autoSync: autoSyncResult,
    })

  } catch (error: any) {
    console.error("Bulk process costs error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
