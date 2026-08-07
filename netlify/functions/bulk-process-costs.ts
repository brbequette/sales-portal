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
 *   entity:       'invoices' | 'salesorders' | 'estimates'  (default 'invoices')
 *   page:         number   (default 1)
 *   filter:       'all' | 'unpaid' | 'recent' | 'draft' | 'daterange'  (default 'unpaid')
 *   perPage:      number   (default 25, max 50)
 *   force:        boolean  (skip loop-guard — recalculate even if unchanged)
 *   applyTariff:  boolean  (default true for invoices — apply 12.5% tariff if adjustment is empty and Remove Tariff is not checked)
 *   startDate:    YYYY-MM-DD  (used when filter = 'daterange')
 *   endDate:      YYYY-MM-DD  (used when filter = 'daterange')
 */

import { Handler } from "@netlify/functions"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"
import { calculateDocumentCosts, buildFieldsToUpdate, isGiftItem } from "./lib/cost-calculations"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID  = ZOHO_ORGANIZATION_ID

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const BATCH_CONCURRENCY = 5
const BATCH_DELAY_MS    = 300
const TARIFF_RATE       = 0.125  // 12.5%

type EntityType = "invoices" | "salesorders" | "estimates"

const ENTITY_CONFIG: Record<EntityType, {
  booksPath: string; listKey: string; idField: string; numField: string
  detailKey: string; dbModel: string
}> = {
  invoices:    { booksPath: "invoices",    listKey: "invoices",    idField: "invoice_id",    numField: "invoice_number",    detailKey: "invoice",    dbModel: "invoice"    },
  salesorders: { booksPath: "salesorders", listKey: "salesorders", idField: "salesorder_id", numField: "salesorder_number", detailKey: "salesorder", dbModel: "salesOrder" },
  estimates:   { booksPath: "estimates",   listKey: "estimates",   idField: "estimate_id",   numField: "estimate_number",   detailKey: "estimate",   dbModel: "quote"      },
}

// ── Tariff helpers ────────────────────────────────────────────────────────────


function calcTariffAmount(doc: any): number {
  let nonGiftDeadCost = 0
  for (const item of (doc.line_items || [])) {
    if (!isGiftItem(item)) {
      nonGiftDeadCost += parseFloat(item.purchase_rate || 0) * parseFloat(item.quantity || 1)
    }
  }
  return parseFloat((nonGiftDeadCost * TARIFF_RATE).toFixed(2))
}

function hasTariffRemoveFlag(doc: any): boolean {
  for (const f of (doc.custom_fields || [])) {
    if ((f.label || '').toUpperCase().includes('REMOVE TARIFF')) {
      return f.value === true || f.value === 'true'
    }
  }
  return false
}
// ─────────────────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) }

  let body: any = {}
  try { body = JSON.parse(event.body || "{}") } catch { /* use defaults */ }

  const entity      = (body.entity  || "invoices") as EntityType
  const page        = parseInt(body.page    || "1",  10)
  const filter      = body.filter   || "unpaid"
  const perPage     = Math.min(parseInt(body.perPage || "25", 10), 50)
  const force       = !!body.force
  const startDate   = body.startDate as string | undefined   // YYYY-MM-DD
  const endDate     = body.endDate   as string | undefined   // YYYY-MM-DD
  // applyTariff defaults true for invoices only; explicitly pass false to disable
  const applyTariff = entity === "invoices" ? (body.applyTariff !== false) : false

  const cfg = ENTITY_CONFIG[entity]
  if (!cfg) return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: `Unknown entity: ${entity}` }) }

  try {
    const token = await getZohoAccessToken()
    if (!token) throw new Error("No Zoho token available")

    const baseUrl     = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // ── Status filter ──────────────────────────────────────────────────────
    let statusFilter = ""
    if (filter === "daterange" && startDate) {
      statusFilter = `&date_start=${startDate}`
      if (endDate) statusFilter += `&date_end=${endDate}`
    } else if (filter === "draft") {
      statusFilter = "&filter_by=Status.Draft"
    } else if (entity === "invoices") {
      if (filter === "unpaid") {
        statusFilter = "&filter_by=Status.Unpaid"
      } else if (filter === "recent") {
        const since = new Date(); since.setDate(since.getDate() - 90)
        statusFilter = `&date_start=${since.toISOString().split("T")[0]}`
      }
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

        // ── Tariff decision ──────────────────────────────────────────────
        // Apply 12.5% tariff as Zoho adjustment if:
        //   1. applyTariff is enabled (invoices only, user can uncheck)
        //   2. adjustment is currently empty / 0  →  not already applied
        //   3. "Remove Tariff Surcharge" custom field is NOT checked
        let tariffApplied = false
        let tariffAmount  = 0
        let tariffNote    = ""

        if (applyTariff) {
          const isPaidInvoice = doc.status?.toLowerCase() === 'paid' || doc.balance === 0 || parseFloat(doc.balance || 0) <= 0
          const existingAdj = parseFloat(doc.adjustment || 0)
          if (isPaidInvoice) {
            tariffNote = "Paid invoice - no tariff"
          } else if (existingAdj !== 0) {
            tariffNote = `adj already $${existingAdj}`
          } else if (hasTariffRemoveFlag(doc)) {
            tariffNote = "Remove Tariff checked"
          } else {
            tariffAmount = calcTariffAmount(doc)
            if (tariffAmount <= 0) tariffNote = "no non-gift cost"
          }
        }

        // ── PUT custom fields (if changed) ──────────────────────────────
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
            throw new Error(`PUT custom fields failed: [${putData.code}] ${putData.message}`)
          }
          console.log(`✅ ${entity} ${docNum} | VIG: ${vigRate} | Profit: $${profit.toFixed(2)} | ${fieldsToUpdate.length} fields updated`)
        } else if (!force && !applyTariff) {
          skipped++
          results.push({ number: docNum, customer, status: "skipped", reason: "No changes detected" })
          return
        }

        // ── PUT tariff adjustment (separate Zoho call — needs customer_id) ──
        if (applyTariff && tariffAmount > 0) {
          const tariffRes = await fetch(
            `${baseUrl}/${cfg.booksPath}/${zohoId}?organization_id=${ORG_ID}`,
            {
              method: "PUT",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({
                customer_id: doc.customer_id,
                adjustment: tariffAmount,
                adjustment_description: "TARIFF SURCHARGE",
              }),
            }
          )
          const tariffData: any = await tariffRes.json()
          if (!tariffRes.ok || tariffData.code !== 0) {
            console.warn(`Tariff PUT failed for ${docNum}: ${tariffData.message}`)
            tariffNote = `PUT failed: ${tariffData.message}`
          } else {
            tariffApplied = true
            console.log(`💰 Tariff $${tariffAmount} applied to ${docNum}`)
          }
        }

        // ── Update local DB ─────────────────────────────────────────────
        try {
          const dbRecord = await (prisma as any)[cfg.dbModel].findFirst({ where: { zohoId } })
          if (dbRecord) {
            const existingItems = (dbRecord.items as any) || {}

            // Extract cross-links from the full Zoho document (for document lifecycle)
            const crossLinks: Record<string, any> = {}
            if (entity === "invoices") {
              crossLinks.invoiceNumber    = doc.invoice_number  || existingItems.invoiceNumber
              crossLinks.salesOrderNumber = doc.salesorder_number || existingItems.salesOrderNumber
              crossLinks.estimateNumber   = doc.estimate_number   || existingItems.estimateNumber
              crossLinks.purchaseOrders   = doc.custom_fields?.find((f: any) =>
                f.api_name === "cf_purchase_order_number_s"
              )?.value || existingItems.purchaseOrders
            } else if (entity === "salesorders") {
              crossLinks.salesOrderNumber = doc.salesorder_number || existingItems.salesOrderNumber
              crossLinks.estimateNumber   = doc.estimate_number   || existingItems.estimateNumber
            } else {
              crossLinks.estimateNumber   = doc.estimate_number   || existingItems.estimateNumber
              crossLinks.salesOrderNumber = doc.salesorder_number || existingItems.salesOrderNumber
            }

            await (prisma as any)[cfg.dbModel].update({
              where: { id: dbRecord.id },
              data: {
                amount: subTotal,
                costsCalculatedAt: new Date(),
                zohoModifiedTime: doc.last_modified_time ? new Date(doc.last_modified_time) : undefined,
                pendingCostSync: false,
                items: {
                  ...existingItems,
                  sub_total: subTotal,
                  subTotal: subTotal,
                  // Cost calculations
                  deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
                  deadProfitActual, profit, marginPercent,
                  vigRate, ccFees, additionalCosts, insurance,
                  commissionPct, salesCommission, isPaid,
                  cf_salesperson_vig: vigRate,
                  lineItemBreakdownStrings, lineItemDetails,
                  pendingZohoFields: [],
                  // Fresh from Zoho — needed for portal display and document linking
                  ...crossLinks,
                  line_items:     doc.line_items    || existingItems.line_items    || [],
                  custom_fields:  doc.custom_fields || existingItems.custom_fields || [],
                  customer_name:  doc.customer_name || existingItems.customer_name,
                  salesperson:    doc.salesperson_name ? doc.salesperson_name.toUpperCase().trim() : existingItems.salesperson,
                  balance:        doc.balance ?? existingItems.balance,
                  ...(tariffApplied ? { tariffSurcharge: tariffAmount, adjustment: tariffAmount } : {}),
                  costsCalculatedAt: new Date().toISOString(),
                  lastSyncedAt:   new Date().toISOString(),
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
          tariff: applyTariff
            ? (tariffApplied ? `applied $${tariffAmount}` : `skipped (${tariffNote})`)
            : "disabled",
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
