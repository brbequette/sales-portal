/**
 * bulk-process-costs.ts  (Netlify Function)
 *
 * Fetches one page of documents from Zoho Books, then calls process-invoice-costs
 * (or the equivalent) for each doc in the page, running up to 5 concurrently.
 *
 * Called directly as /.netlify/functions/bulk-process-costs from the UI.
 * This avoids all Next.js module-level PrismaClient initialization issues.
 *
 * POST body:
 *   entity:   'invoices' | 'salesorders' | 'estimates'  (default 'invoices')
 *   page:     number   (default 1)
 *   filter:   'all' | 'unpaid' | 'recent'               (default 'unpaid')
 *   perPage:  number   (default 25, max 50)
 *   force:    boolean  (skip loop-guard — recalculate even if unchanged)
 */

import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { calculateDocumentCosts, buildFieldsToUpdate } from "./lib/cost-calculations"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID  = process.env.ZOHO_ORGANIZATION_ID || "664670946"

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const BATCH_CONCURRENCY = 5
const BATCH_DELAY_MS    = 300

type EntityType = "invoices" | "salesorders" | "estimates"

const ENTITY_CONFIG: Record<EntityType, {
  booksPath: string; listKey: string; idField: string; numField: string
  detailKey: string; dbModel: string
}> = {
  invoices:    { booksPath: "invoices",    listKey: "invoices",    idField: "invoice_id",    numField: "invoice_number",    detailKey: "invoice",    dbModel: "invoice"    },
  salesorders: { booksPath: "salesorders", listKey: "salesorders", idField: "salesorder_id", numField: "salesorder_number", detailKey: "salesorder", dbModel: "salesOrder" },
  estimates:   { booksPath: "estimates",   listKey: "estimates",   idField: "estimate_id",   numField: "estimate_number",   detailKey: "estimate",   dbModel: "quote"      },
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) }

  let body: any = {}
  try { body = JSON.parse(event.body || "{}") } catch { /* use defaults */ }

  const entity  = (body.entity  || "invoices") as EntityType
  const page    = parseInt(body.page    || "1",  10)
  const filter  = body.filter   || "unpaid"
  const perPage = Math.min(parseInt(body.perPage || "25", 10), 50)
  const force   = !!body.force

  const cfg = ENTITY_CONFIG[entity]
  if (!cfg) return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: `Unknown entity: ${entity}` }) }

  try {
    const token = await getZohoAccessToken()
    if (!token) throw new Error("No Zoho token available")

    const baseUrl     = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // ── Status filter ──────────────────────────────────────────────────────
    let statusFilter = ""
    if (entity === "invoices") {
      if (filter === "unpaid") {
        // filter_by=Status.Unpaid returns sent + overdue + partially_paid
        statusFilter = "&filter_by=Status.Unpaid"
      } else if (filter === "recent") {
        const since = new Date(); since.setDate(since.getDate() - 90)
        statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
      }
      // filter === "all" → no filter
    } else if (filter === "recent") {
      const since = new Date(); since.setDate(since.getDate() - 90)
      statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
    }

    // ── 1 list GET for the whole page ──────────────────────────────────────
    const sortParam = entity === "estimates" ? "" : "&sort_column=date&sort_order=D"
    const listRes = await fetch(
      `${baseUrl}/${cfg.booksPath}?organization_id=${ORG_ID}&page=${page}&per_page=${perPage}${sortParam}${statusFilter}`,
      { headers: authHeaders }
    )
    if (!listRes.ok) throw new Error(`Zoho list error ${listRes.status}`)
    const listData: any = await listRes.json()
    if (listData.code !== 0) throw new Error(`Zoho: ${listData.message}`)

    const items: any[] = listData[cfg.listKey] || []
    const hasMore      = listData.page_context?.has_more_page || false

    if (items.length === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, processed: 0, errors: 0, skipped: 0, hasMore: false, page, results: [] }) }
    }

    // ── Parallel GET detail + calculate + PUT ──────────────────────────────
    const results: any[] = []
    let processed = 0, errors = 0, skipped = 0

    async function processOne(summary: any): Promise<void> {
      const zohoId   = summary[cfg.idField]
      const docNum   = summary[cfg.numField]
      const customer = summary.customer_name || ""

      try {
        // GET full detail with line_items + custom_fields
        const detailRes = await fetch(
          `${baseUrl}/${cfg.booksPath}/${zohoId}?organization_id=${ORG_ID}`,
          { headers: authHeaders }
        )
        if (!detailRes.ok) throw new Error(`GET detail HTTP ${detailRes.status}`)
        const detailData: any = await detailRes.json()
        if (detailData.code !== 0) throw new Error(`Zoho: ${detailData.message}`)
        const doc = detailData[cfg.detailKey]
        if (!doc) throw new Error("No document in Zoho response")

        // Calculate all cost/commission fields
        const calc = await calculateDocumentCosts(doc)
        const {
          deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
          deadProfitActual, profit, marginPercent, subTotal,
          vigRate, ccFees, additionalCosts, insurance,
          commissionPct, salesCommission, isPaid,
          lineItemBreakdownStrings, lineItemDetails,
        } = calc

        // Diff against existing fields — only push what changed
        const fieldsToUpdate = buildFieldsToUpdate(calc, doc, entity)

        // PUT to Zoho only if something changed
        if (fieldsToUpdate.length > 0) {
          const putRes = await fetch(
            `${baseUrl}/${cfg.booksPath}/${zohoId}?organization_id=${ORG_ID}`,
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
          console.log(`✅ ${entity} ${docNum} | VIG: ${vigRate} | Profit: $${profit.toFixed(2)} | ${fieldsToUpdate.length} fields updated`)
        } else {
          if (!force) {
            skipped++
            results.push({ number: docNum, customer, status: "skipped", reason: "No changes detected" })
            return
          }
        }

        // Update local DB
        try {
          const dbRecord = await (prisma as any)[cfg.dbModel].findFirst({ where: { zohoId } })
          if (dbRecord) {
            const existingItems = (dbRecord.items as any) || {}
            await (prisma as any)[cfg.dbModel].update({
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
                  cf_salesperson_vig: vigRate,
                  lineItemBreakdownStrings, lineItemDetails,
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
          fieldsUpdated: fieldsToUpdate.length,
        })
      } catch (err: any) {
        console.error(`❌ ${entity} ${docNum}: ${err.message}`)
        errors++
        results.push({ number: docNum, customer, status: "error", error: err.message })
      }
    }

    // Batched concurrency — 5 at a time with brief pause between batches
    for (let i = 0; i < items.length; i += BATCH_CONCURRENCY) {
      await Promise.all(items.slice(i, i + BATCH_CONCURRENCY).map(processOne))
      if (i + BATCH_CONCURRENCY < items.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        success: true, entity, page,
        processed, errors, skipped,
        total: items.length, hasMore, results,
      }),
    }
  } catch (err: any) {
    console.error("bulk-process-costs fatal:", err)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: err.message }) }
  } finally {
    await prisma.$disconnect()
  }
}
