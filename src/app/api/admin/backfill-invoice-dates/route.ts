import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

type JsonRecord = Record<string, unknown>

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
    const start = scope === "range" ? dateFromValue(body.startDate) : null
    const endBase = scope === "range" ? dateFromValue(body.endDate) : null
    if (scope === "range" && (!start || !endBase)) {
      return NextResponse.json({ success: false, error: "A valid start and end date are required." }, { status: 400 })
    }
    const end = endBase ? new Date(endBase.getTime() + 24 * 60 * 60 * 1000 - 1) : null

    const [invoices, salesOrders, estimates] = await Promise.all([
      prisma.invoice.findMany({
        where: start && end ? { issueDate: { gte: start, lte: end } } : undefined,
        select: { id: true, invoiceNumber: true, zohoId: true, issueDate: true, items: true, salesOrderZohoId: true, salesorderNumber: true, estimateZohoId: true },
        orderBy: { issueDate: "desc" },
      }),
      prisma.salesOrder.findMany({ select: { zohoId: true, orderDate: true, items: true } }),
      prisma.quote.findMany({ select: { zohoId: true, items: true } }),
    ])

    const salesOrderDates = new Map<string, Date>()
    for (const order of salesOrders) {
      const items = (order.items as JsonRecord | null) || {}
      const keys = [order.zohoId, items.salesorder_id, items.sales_order_id, items.salesorder_number, items.salesOrderNumber]
      for (const key of keys.map(clean).filter(Boolean)) salesOrderDates.set(key, order.orderDate)
    }

    const estimateDates = new Map<string, Date>()
    for (const estimate of estimates) {
      const items = (estimate.items as JsonRecord | null) || {}
      const estimateDate = dateFromValue(first(items.date, items.estimate_date, items.estimateDate, items.created_time))
      if (!estimateDate) continue
      const keys = [estimate.zohoId, items.estimate_id, items.estimate_number, items.estimateNumber]
      for (const key of keys.map(clean).filter(Boolean)) estimateDates.set(key, estimateDate)
    }

    const changes: Array<{ id: string; invoiceNumber: string; from: string; to: string; source: "sales order" | "estimate"; items: JsonRecord }> = []
    for (const invoice of invoices) {
      const items = (invoice.items as JsonRecord | null) || {}
      const salesOrderKeys = [invoice.salesOrderZohoId, invoice.salesorderNumber, items.salesorder_id, items.sales_order_id, items.salesorder_number, items.salesOrderNumber].map(clean).filter(Boolean)
      const estimateKeys = [invoice.estimateZohoId, items.estimate_id, items.estimate_number, items.estimateNumber].map(clean).filter(Boolean)
      const salesOrderDate = salesOrderKeys.map(key => salesOrderDates.get(key)).find(Boolean)
      const estimateDate = estimateKeys.map(key => estimateDates.get(key)).find(Boolean)
      const sourceDate = salesOrderDate || estimateDate
      if (!sourceDate || dateKey(sourceDate) === dateKey(invoice.issueDate)) continue
      changes.push({
        id: invoice.id,
        invoiceNumber: String(invoice.invoiceNumber || items.invoiceNumber || items.invoice_number || invoice.zohoId),
        from: dateKey(invoice.issueDate), to: dateKey(sourceDate), source: salesOrderDate ? "sales order" : "estimate", items,
      })
    }

    if (apply && changes.length) {
      await prisma.$transaction(changes.map(change => prisma.invoice.update({
        where: { id: change.id },
        data: {
          issueDate: new Date(change.to + "T12:00:00.000Z"),
          items: {
            ...change.items,
            invoiceDateBeforeLinkedBackfill: change.items.invoiceDateBeforeLinkedBackfill || change.from,
            invoiceDateLinkedSource: change.source,
            invoiceDateLinkedBackfillAt: new Date().toISOString(),
          },
        },
      })))
    }

    const bySource = changes.reduce((result, change) => { result[change.source]++; return result }, { "sales order": 0, estimate: 0 })
    return NextResponse.json({
      success: true, applied: apply, scannedCount: invoices.length, matchedCount: changes.length,
      updatedCount: apply ? changes.length : 0, skippedCount: invoices.length - changes.length, bySource,
      sample: changes.slice(0, 25).map(({ invoiceNumber, from, to, source }) => ({ invoiceNumber, from, to, source })),
      message: apply
        ? `Updated ${changes.length} invoice dates (${bySource["sales order"]} from sales orders, ${bySource.estimate} from estimates).`
        : `Preview found ${changes.length} invoice dates to update (${bySource["sales order"]} from sales orders, ${bySource.estimate} from estimates).`,
    })
  } catch (error: unknown) {
    console.error("Backfill invoice dates error:", error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
