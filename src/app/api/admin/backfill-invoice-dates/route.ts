import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { getZohoAccessToken } from "@/lib/zoho-auth"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORG_ID || process.env.ZOHO_ORGANIZATION_ID

const clean = (value: unknown) => String(value ?? "").trim().toLowerCase()
const first = (...values: unknown[]) => values.find(value => clean(value))
const dateFromValue = (value: unknown): Date | null => {
  if (!value) return null
  const parsed = new Date(String(value).slice(0, 10) + "T12:00:00.000Z")
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
const dateKey = (value: Date) => value.toISOString().slice(0, 10)

export async function POST(request: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await request.json().catch(() => ({}))
    const scope = body.scope === "all" ? "all" : "range"
    const apply = body.apply === true
    const startBase = scope === "range" ? dateFromValue(body.startDate) : null
    const endBase = scope === "range" ? dateFromValue(body.endDate) : null
    if (scope === "range" && (!startBase || !endBase)) {
      return NextResponse.json({ success: false, error: "A valid start and end date are required." }, { status: 400 })
    }
    // Range inputs are inclusive calendar days. Use UTC day boundaries so rows
    // stored at either midnight or noon cannot fall out of the selected day.
    const start = startBase ? new Date(`${dateKey(startBase)}T00:00:00.000Z`) : null
    const end = endBase ? new Date(`${dateKey(endBase)}T23:59:59.999Z`) : null

    const invoiceRange = start && end ? Prisma.sql`WHERE "issueDate" >= ${start} AND "issueDate" <= ${end}` : Prisma.empty
    const [invoices, salesOrders, estimates] = await Promise.all([
      prisma.$queryRaw<Array<{
        id: string; invoiceNumber: string | null; zohoId: string | null; issueDate: Date;
        salesOrderZohoId: string | null; salesorderNumber: string | null; estimateZohoId: string | null;
        itemSalesOrderId: string | null; itemSalesOrderIdAlt: string | null; itemSalesOrderNumber: string | null; itemSalesOrderNumberAlt: string | null;
        itemEstimateId: string | null; itemEstimateNumber: string | null; itemEstimateNumberAlt: string | null;
        itemInvoiceNumber: string | null; itemInvoiceNumberAlt: string | null; originalDate: string | null;
      }>>(Prisma.sql`
        SELECT id, "invoiceNumber", "zohoId", "issueDate", "salesOrderZohoId", "salesorderNumber", "estimateZohoId",
          items->>'salesorder_id' AS "itemSalesOrderId", items->>'sales_order_id' AS "itemSalesOrderIdAlt",
          items->>'salesorder_number' AS "itemSalesOrderNumber", items->>'salesOrderNumber' AS "itemSalesOrderNumberAlt",
          items->>'estimate_id' AS "itemEstimateId", items->>'estimate_number' AS "itemEstimateNumber", items->>'estimateNumber' AS "itemEstimateNumberAlt",
          items->>'invoiceNumber' AS "itemInvoiceNumber", items->>'invoice_number' AS "itemInvoiceNumberAlt",
          items->>'invoiceDateBeforeLinkedBackfill' AS "originalDate"
        FROM "Invoice" ${invoiceRange} ORDER BY "issueDate" DESC
      `),
      prisma.$queryRaw<Array<{ zohoId: string | null; orderDate: Date; itemId: string | null; itemIdAlt: string | null; itemNumber: string | null; itemNumberAlt: string | null }>>(Prisma.sql`
        SELECT "zohoId", "orderDate", items->>'salesorder_id' AS "itemId", items->>'sales_order_id' AS "itemIdAlt",
          items->>'salesorder_number' AS "itemNumber", items->>'salesOrderNumber' AS "itemNumberAlt" FROM "SalesOrder"
      `),
      prisma.$queryRaw<Array<{ zohoId: string | null; date: string | null; estimateDate: string | null; createdTime: string | null; itemId: string | null; itemNumber: string | null; itemNumberAlt: string | null }>>(Prisma.sql`
        SELECT "zohoId", items->>'date' AS date, items->>'estimate_date' AS "estimateDate", items->>'created_time' AS "createdTime",
          items->>'estimate_id' AS "itemId", items->>'estimate_number' AS "itemNumber", items->>'estimateNumber' AS "itemNumberAlt" FROM "Quote"
      `),
    ])

    const salesOrderDates = new Map<string, Date>()
    for (const order of salesOrders) {
      const keys = [order.zohoId, order.itemId, order.itemIdAlt, order.itemNumber, order.itemNumberAlt]
      for (const key of keys.map(clean).filter(Boolean)) salesOrderDates.set(key, order.orderDate)
    }

    const estimateDates = new Map<string, Date>()
    for (const estimate of estimates) {
      const estimateDate = dateFromValue(first(estimate.date, estimate.estimateDate, estimate.createdTime))
      if (!estimateDate) continue
      const keys = [estimate.zohoId, estimate.itemId, estimate.itemNumber, estimate.itemNumberAlt]
      for (const key of keys.map(clean).filter(Boolean)) estimateDates.set(key, estimateDate)
    }

    const changes: Array<{ id: string; zohoId: string | null; invoiceNumber: string; from: string; to: string; source: "sales order" | "estimate"; originalDate: string | null }> = []
    for (const invoice of invoices) {
      const salesOrderKeys = [invoice.salesOrderZohoId, invoice.salesorderNumber, invoice.itemSalesOrderId, invoice.itemSalesOrderIdAlt, invoice.itemSalesOrderNumber, invoice.itemSalesOrderNumberAlt].map(clean).filter(Boolean)
      const estimateKeys = [invoice.estimateZohoId, invoice.itemEstimateId, invoice.itemEstimateNumber, invoice.itemEstimateNumberAlt].map(clean).filter(Boolean)
      const salesOrderDate = salesOrderKeys.map(key => salesOrderDates.get(key)).find(Boolean)
      const estimateDate = estimateKeys.map(key => estimateDates.get(key)).find(Boolean)
      const sourceDate = salesOrderDate || estimateDate
      if (!sourceDate || dateKey(sourceDate) === dateKey(invoice.issueDate)) continue
      changes.push({
        id: invoice.id, zohoId: invoice.zohoId,
        invoiceNumber: String(invoice.invoiceNumber || invoice.itemInvoiceNumber || invoice.itemInvoiceNumberAlt || invoice.zohoId),
        from: dateKey(invoice.issueDate), to: dateKey(sourceDate), source: salesOrderDate ? "sales order" : "estimate", originalDate: invoice.originalDate,
      })
    }

    let updatedCount = 0
    let zohoCalls = 0
    const failures: Array<{ invoiceNumber: string; zohoId: string | null; error: string }> = []
    if (apply && changes.length) {
      if (!ORG_ID) throw new Error("ZOHO_ORG_ID is not configured")
      const token = await getZohoAccessToken()
      const appliedAt = new Date().toISOString()
      for (let offset = 0; offset < changes.length; offset += 5) {
        await Promise.all(changes.slice(offset, offset + 5).map(async change => {
          if (!change.zohoId) {
            failures.push({ invoiceNumber: change.invoiceNumber, zohoId: null, error: "Missing Zoho Books invoice ID" })
            return
          }
          try {
            zohoCalls++
            const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${change.zohoId}?organization_id=${ORG_ID}`, {
              method: "PUT", signal: AbortSignal.timeout(20000),
              headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                date: change.to,
                reason: `Correcting invoice date to match linked ${change.source} date (${change.to}).`,
              }),
            })
            const result = await response.json().catch(() => ({})) as { code?: number; message?: string }
            if (!response.ok || (result.code != null && result.code !== 0)) throw new Error(result.message || `Zoho HTTP ${response.status}`)
            const auditPatch = JSON.stringify({
              date: change.to,
              invoiceDateBeforeLinkedBackfill: change.originalDate || change.from,
              invoiceDateLinkedSource: change.source,
              invoiceDateLinkedBackfillAt: appliedAt,
            })
            await prisma.$executeRaw(Prisma.sql`
              UPDATE "Invoice" SET
                "issueDate" = ${new Date(change.to + "T12:00:00.000Z")},
                "appModifiedAt" = NOW(), "lastSyncedAt" = NOW(), "syncConflict" = false, "updatedAt" = NOW(),
                items = COALESCE(items, '{}'::jsonb) || ${auditPatch}::jsonb
              WHERE id = ${change.id}
            `)
            updatedCount++
          } catch (error) {
            failures.push({ invoiceNumber: change.invoiceNumber, zohoId: change.zohoId, error: error instanceof Error ? error.message : "Unknown update error" })
          }
        }))
      }
    }

    const bySource = changes.reduce((result, change) => { result[change.source]++; return result }, { "sales order": 0, estimate: 0 })
    return NextResponse.json({
      success: true, applied: apply, scannedCount: invoices.length, matchedCount: changes.length,
      updatedCount, failedCount: failures.length, zohoCalls, skippedCount: invoices.length - changes.length, bySource,
      failures: failures.slice(0, 100),
      sample: changes.slice(0, 25).map(({ invoiceNumber, from, to, source }) => ({ invoiceNumber, from, to, source })),
      message: apply
        ? `Updated ${updatedCount} invoice dates in Zoho Books and the portal; ${failures.length} failed.`
        : `Preview found ${changes.length} invoice dates to update (${bySource["sales order"]} from sales orders, ${bySource.estimate} from estimates).`,
    })
  } catch (error: unknown) {
    console.error("Backfill invoice dates error:", error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
