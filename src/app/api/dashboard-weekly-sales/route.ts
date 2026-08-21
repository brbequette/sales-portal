import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { extractDeadCostTotal, extractDeadProfit } from "@/lib/custom-field-extractor"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { hasValidTvSession } from "@/lib/tv-auth"

const terminalStatuses = new Set(["void", "voided", "declined", "cancelled", "canceled"])
const excludedPipelineStatuses = new Set([...terminalStatuses, "draft"])
const invoicedStatuses = new Set(["invoiced", "billed"])

const text = (value: unknown) => String(value || "").trim().toLowerCase()
const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const subtotal = (items: Record<string, unknown>, amount: number) =>
  number(items.sub_total ?? items.subTotal ?? amount)

// Arizona does not observe daylight saving time, so its business-day boundary
// is always UTC-07:00. Build explicit UTC instants instead of inheriting the
// container's timezone (which is UTC in self-hosted Docker).
const ARIZONA_UTC_OFFSET_HOURS = 7
const arizonaWeek = (now: Date) => {
  const arizonaNow = new Date(now.getTime() - ARIZONA_UTC_OFFSET_HOURS * 60 * 60 * 1000)
  const day = arizonaNow.getUTCDay()
  const monday = new Date(Date.UTC(
    arizonaNow.getUTCFullYear(),
    arizonaNow.getUTCMonth(),
    arizonaNow.getUTCDate() + (day === 0 ? -6 : 1 - day),
    ARIZONA_UTC_OFFSET_HOURS,
  ))
  const end = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
  return { monday, end }
}

export const dynamic = "force-dynamic"

const weeklyResponseCache = new Map<string, { expiresAt: number; payload: unknown }>()
const weeklyResponseInFlight = new Map<string, Promise<unknown>>()

export async function GET() {
  const session = await getServerSession(authOptions)
  const tvSession = session ? false : await hasValidTvSession()
  if (!session && !tvSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = String(session?.user?.role || "").toLowerCase()
  const privileged = tvSession || role.includes("admin") || role.includes("manager")
  const cacheKey = privileged ? "privileged" : `rep:${text(session?.user?.name)}`
  const cached = weeklyResponseCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.payload)

  let pending = weeklyResponseInFlight.get(cacheKey)
  if (!pending) {
    pending = buildWeeklyPayload(session, tvSession)
      .then(payload => {
        weeklyResponseCache.set(cacheKey, { payload, expiresAt: Date.now() + 15_000 })
        return payload
      })
      .finally(() => weeklyResponseInFlight.delete(cacheKey))
    weeklyResponseInFlight.set(cacheKey, pending)
  }

  return NextResponse.json(await pending)
}

async function buildWeeklyPayload(
  session: any,
  tvSession: boolean,
) {
  const now = new Date()
  const { monday, end: sunday } = arizonaWeek(now)
  const estimateCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  const [invoices, salesOrders, quotes] = await Promise.all([
    prisma.invoice.findMany({
      where: { issueDate: { gte: monday, lte: sunday } },
      select: {
        id: true, zohoId: true, amount: true, status: true, issueDate: true,
        items: true, salesOrderZohoId: true, estimateZohoId: true, salesorderNumber: true,
        computedDeadProfit: true, computedDeadCost: true, computedSalesperson: true,
      },
    }),
    prisma.salesOrder.findMany({
      where: { orderDate: { gte: monday, lte: sunday } },
      select: { id: true, zohoId: true, amount: true, status: true, orderDate: true, items: true },
    }),
    prisma.$queryRaw<Array<{
      id: string
      zohoId: string | null
      amount: number
      status: string
      quoteDate: Date | null
      items: Prisma.JsonValue
    }>>(Prisma.sql`
      SELECT
        id, "zohoId", amount, status, items,
        CASE
          WHEN COALESCE(items->>'date', items->>'estimate_date', items->>'estimateDate', '')
            ~ '^\\d{4}-\\d{2}-\\d{2}'
          THEN SUBSTRING(COALESCE(items->>'date', items->>'estimate_date', items->>'estimateDate') FROM 1 FOR 10)::date::timestamp
          ELSE NULL
        END AS "quoteDate"
      FROM "Quote"
      WHERE CASE
        WHEN COALESCE(items->>'date', items->>'estimate_date', items->>'estimateDate', '')
          ~ '^\\d{4}-\\d{2}-\\d{2}'
        THEN SUBSTRING(COALESCE(items->>'date', items->>'estimate_date', items->>'estimateDate') FROM 1 FOR 10)::date::timestamp
        ELSE NULL
      END BETWEEN ${estimateCutoff} AND ${now}
    `),
  ])
  // Conversion checks only need links that could match documents in the
  // current response. The former queries decoded every Invoice and
  // SalesOrder JSON record on every dashboard request.
  const weeklyOrderIds = salesOrders.map(order => String(order.zohoId || "")).filter(Boolean)
  const weeklyOrderNumbers = salesOrders
    .map(order => {
      const items = (order.items as Record<string, unknown>) || {}
      return String(items.salesorder_number || items.salesOrderNumber || "")
    })
    .filter(Boolean)
  const recentEstimateIds = quotes.map(quote => String(quote.zohoId || "")).filter(Boolean)
  const recentEstimateNumbers = quotes
    .map(quote => {
      const items = (quote.items as Record<string, unknown>) || {}
      return String(items.estimate_number || items.estimateNumber || "")
    })
    .filter(Boolean)

  const orderIdMatch = weeklyOrderIds.length
    ? Prisma.sql`("salesOrderZohoId" IN (${Prisma.join(weeklyOrderIds)}) OR items->>'salesorder_id' IN (${Prisma.join(weeklyOrderIds)}) OR items->>'sales_order_id' IN (${Prisma.join(weeklyOrderIds)}))`
    : Prisma.sql`FALSE`
  const orderNumberMatch = weeklyOrderNumbers.length
    ? Prisma.sql`("salesorderNumber" IN (${Prisma.join(weeklyOrderNumbers)}) OR items->>'salesorder_number' IN (${Prisma.join(weeklyOrderNumbers)}) OR items->>'salesOrderNumber' IN (${Prisma.join(weeklyOrderNumbers)}))`
    : Prisma.sql`FALSE`
  const estimateInvoiceMatch = recentEstimateIds.length
    ? Prisma.sql`("estimateZohoId" IN (${Prisma.join(recentEstimateIds)}) OR items->>'estimate_id' IN (${Prisma.join(recentEstimateIds)}))`
    : Prisma.sql`FALSE`
  const estimateOrderMatch = recentEstimateIds.length || recentEstimateNumbers.length
    ? Prisma.sql`(${recentEstimateIds.length ? Prisma.sql`items->>'estimate_id' IN (${Prisma.join(recentEstimateIds)})` : Prisma.sql`FALSE`} OR ${recentEstimateNumbers.length ? Prisma.sql`items->>'estimate_number' IN (${Prisma.join(recentEstimateNumbers)}) OR items->>'estimateNumber' IN (${Prisma.join(recentEstimateNumbers)})` : Prisma.sql`FALSE`})`
    : Prisma.sql`FALSE`

  const [invoiceLinks, salesOrderLinks] = await Promise.all([
    prisma.$queryRaw<Array<{
      salesOrderZohoId: string | null
      estimateZohoId: string | null
      salesorderNumber: string | null
      itemSalesOrderId: string | null
      itemSalesOrderIdAlt: string | null
      itemSalesOrderNumber: string | null
      itemSalesOrderNumberAlt: string | null
      itemEstimateId: string | null
    }>>(Prisma.sql`
      SELECT
        "salesOrderZohoId", "estimateZohoId", "salesorderNumber",
        items->>'salesorder_id' AS "itemSalesOrderId",
        items->>'sales_order_id' AS "itemSalesOrderIdAlt",
        items->>'salesorder_number' AS "itemSalesOrderNumber",
        items->>'salesOrderNumber' AS "itemSalesOrderNumberAlt",
        items->>'estimate_id' AS "itemEstimateId"
      FROM "Invoice"
      WHERE ${orderIdMatch} OR ${orderNumberMatch} OR ${estimateInvoiceMatch}
    `),
    prisma.$queryRaw<Array<{
      estimateId: string | null
      estimateNumber: string | null
      estimateNumberAlt: string | null
    }>>(Prisma.sql`
      SELECT
        items->>'estimate_id' AS "estimateId",
        items->>'estimate_number' AS "estimateNumber",
        items->>'estimateNumber' AS "estimateNumberAlt"
      FROM "SalesOrder"
      WHERE ${estimateOrderMatch}
    `),
  ])
  const invoicedSalesOrderIds = new Set<string>()
  const invoicedSalesOrderNumbers = new Set<string>()
  const invoicedEstimateIds = new Set<string>()
  const convertedEstimateIds = new Set<string>()
  const convertedEstimateNumbers = new Set<string>()

  for (const invoice of invoiceLinks) {
    ;[invoice.salesOrderZohoId, invoice.itemSalesOrderId, invoice.itemSalesOrderIdAlt]
      .map(text).filter(Boolean).forEach(value => invoicedSalesOrderIds.add(value))
    ;[invoice.salesorderNumber, invoice.itemSalesOrderNumber, invoice.itemSalesOrderNumberAlt]
      .map(text).filter(Boolean).forEach(value => invoicedSalesOrderNumbers.add(value))
    ;[invoice.estimateZohoId, invoice.itemEstimateId]
      .map(text).filter(Boolean).forEach(value => invoicedEstimateIds.add(value))
  }

  for (const order of salesOrderLinks) {
    ;[order.estimateId].map(text).filter(Boolean).forEach(value => convertedEstimateIds.add(value))
    ;[order.estimateNumber, order.estimateNumberAlt]
      .map(text).filter(Boolean).forEach(value => convertedEstimateNumbers.add(value))
  }

  const documents: Array<{ id: string; type: "invoice" | "salesorder" | "estimate"; subtotal: number; deadCost: number; profit: number; date: string; salesperson: string; costPending?: boolean }> = []
  const missingCostInvoiceIds: string[] = []
  const missingCostSalesOrderIds: string[] = []

  for (const invoice of invoices) {
    const status = text(invoice.status)
    // Draft invoices are invoices and must appear in weekly sales. Only terminal
    // records are excluded from invoice totals.
    if (terminalStatuses.has(status) || invoice.issueDate < monday || invoice.issueDate > sunday) continue
    const items = (invoice.items as Record<string, unknown>) || {}
    const invoiceSubtotal = subtotal(items, invoice.amount)
    const storedDeadCost = number(invoice.computedDeadCost ?? extractDeadCostTotal(items))
    const hasStoredDeadCost = invoiceSubtotal <= 0 || storedDeadCost > 0 || Boolean(items.costsCalculatedAt)
    if (!hasStoredDeadCost && invoice.zohoId) missingCostInvoiceIds.push(invoice.zohoId)
    documents.push({
      id: invoice.id,
      type: "invoice",
      subtotal: invoiceSubtotal,
      deadCost: hasStoredDeadCost ? storedDeadCost : 0,
      profit: hasStoredDeadCost ? number(invoice.computedDeadProfit ?? extractDeadProfit(items, invoiceSubtotal)) : 0,
      date: invoice.issueDate.toISOString(),
      salesperson: String(invoice.computedSalesperson || items.salesperson_name || items.salesperson || ""),
      costPending: !hasStoredDeadCost,
    })
  }

  for (const order of salesOrders) {
    const status = text(order.status)
    const items = (order.items as Record<string, unknown>) || {}
    const orderId = text(order.zohoId)
    const orderNumber = text(items.salesorder_number || items.salesOrderNumber)
    const converted = invoicedStatuses.has(status)
      || (orderId && invoicedSalesOrderIds.has(orderId))
      || (orderNumber && invoicedSalesOrderNumbers.has(orderNumber))
    if (converted || excludedPipelineStatuses.has(status) || order.orderDate < monday || order.orderDate > sunday) continue
    const orderSubtotal = subtotal(items, order.amount)
    const storedDeadCost = number(extractDeadCostTotal(items))
    const hasStoredDeadCost = orderSubtotal <= 0 || storedDeadCost > 0 || Boolean(items.costsCalculatedAt)
    if (!hasStoredDeadCost && order.zohoId) missingCostSalesOrderIds.push(order.zohoId)
    documents.push({
      id: order.id,
      type: "salesorder",
      subtotal: orderSubtotal,
      deadCost: hasStoredDeadCost ? storedDeadCost : 0,
      profit: hasStoredDeadCost ? number(extractDeadProfit(items, orderSubtotal)) : 0,
      date: order.orderDate.toISOString(),
      salesperson: String(items.salesperson_name || items.salesperson || ""),
      costPending: !hasStoredDeadCost,
    })
  }

  for (const quote of quotes) {
    const status = text(quote.status)
    const items = (quote.items as Record<string, unknown>) || {}
    const quoteDate = quote.quoteDate
    if (!quoteDate) continue
    const quoteId = text(quote.zohoId)
    const quoteNumber = text(items.estimate_number || items.estimateNumber)
    const converted = status === "converted" || invoicedStatuses.has(status)
      || (quoteId && (convertedEstimateIds.has(quoteId) || invoicedEstimateIds.has(quoteId)))
      || (quoteNumber && convertedEstimateNumbers.has(quoteNumber))
    if (converted || excludedPipelineStatuses.has(status) || quoteDate < estimateCutoff || quoteDate > now) continue
    documents.push({
      id: quote.id,
      type: "estimate",
      subtotal: subtotal(items, quote.amount),
      deadCost: number(extractDeadCostTotal(items)),
      profit: number(extractDeadProfit(items, subtotal(items, quote.amount))),
      date: quoteDate.toISOString(),
      salesperson: String(items.salesperson_name || items.salesperson || ""),
    })
  }

  const breakdown = documents.reduce((result, doc) => {
    result[doc.type] += doc.subtotal
    return result
  }, { invoice: 0, salesorder: 0, estimate: 0 })

  const role = String(session?.user?.role || "").toLowerCase()
  const privileged = tvSession || role.includes("admin") || role.includes("manager")
  const sessionName = text(session?.user?.name)
  const visibleDocuments = privileged
    ? documents
    : documents.filter((document) => text(document.salesperson) === sessionName)

  return {
    total: breakdown.invoice + breakdown.salesorder + breakdown.estimate,
    count: documents.length,
    breakdown,
    documents: visibleDocuments,
    missingCostInvoiceIds: privileged ? missingCostInvoiceIds.slice(0, 5) : [],
    missingCostSalesOrderIds: privileged ? missingCostSalesOrderIds.slice(0, 5) : [],
    range: {
      start: monday.toISOString(),
      end: sunday.toISOString(),
      estimateStart: estimateCutoff.toISOString(),
      estimateEnd: now.toISOString(),
      timeZone: "America/Phoenix",
    },
  }
}
