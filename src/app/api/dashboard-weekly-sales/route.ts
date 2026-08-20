import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { extractProfit } from "@/lib/custom-field-extractor"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { hasValidTvSession } from "@/lib/tv-auth"

const excludedStatuses = new Set(["void", "voided", "draft", "declined", "cancelled", "canceled"])
const invoicedStatuses = new Set(["invoiced", "billed"])

const text = (value: unknown) => String(value || "").trim().toLowerCase()
const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const itemDate = (items: Record<string, unknown>, fallback: Date) => {
  const raw = items.date || items.estimate_date || items.salesorder_date || items.created_time
  const parsed = raw ? new Date(String(raw)) : fallback
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}
const subtotal = (items: Record<string, unknown>, amount: number) =>
  number(items.sub_total ?? items.subTotal ?? amount)

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  const tvSession = session ? false : await hasValidTvSession()
  if (!session && !tvSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  const [invoices, invoiceLinks, salesOrders, salesOrderLinks, quotes] = await Promise.all([
    prisma.invoice.findMany({
      where: { issueDate: { gte: monday, lte: sunday } },
      select: {
        id: true, zohoId: true, amount: true, status: true, issueDate: true,
        items: true, salesOrderZohoId: true, estimateZohoId: true, salesorderNumber: true,
        computedProfit: true, computedSalesperson: true,
      },
    }),
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
    `),
    prisma.salesOrder.findMany({
      where: { orderDate: { gte: monday, lte: sunday } },
      select: { id: true, zohoId: true, amount: true, status: true, orderDate: true, items: true },
    }),
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
    `),
    prisma.quote.findMany({
      select: { id: true, zohoId: true, amount: true, status: true, createdAt: true, items: true },
    }),
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

  const documents: Array<{ id: string; type: "invoice" | "salesorder" | "estimate"; subtotal: number; profit: number; date: string; salesperson: string }> = []

  for (const invoice of invoices) {
    const status = text(invoice.status)
    if (excludedStatuses.has(status) || invoice.issueDate < monday || invoice.issueDate > sunday) continue
    const items = (invoice.items as Record<string, unknown>) || {}
    documents.push({
      id: invoice.id,
      type: "invoice",
      subtotal: subtotal(items, invoice.amount),
      profit: number(invoice.computedProfit ?? extractProfit(items)),
      date: invoice.issueDate.toISOString(),
      salesperson: String(invoice.computedSalesperson || items.salesperson_name || items.salesperson || ""),
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
    if (converted || excludedStatuses.has(status) || order.orderDate < monday || order.orderDate > sunday) continue
    documents.push({
      id: order.id,
      type: "salesorder",
      subtotal: subtotal(items, order.amount),
      profit: number(extractProfit(items)),
      date: order.orderDate.toISOString(),
      salesperson: String(items.salesperson_name || items.salesperson || ""),
    })
  }

  for (const quote of quotes) {
    const status = text(quote.status)
    const items = (quote.items as Record<string, unknown>) || {}
    const quoteDate = itemDate(items, quote.createdAt)
    const quoteId = text(quote.zohoId)
    const quoteNumber = text(items.estimate_number || items.estimateNumber)
    const converted = status === "converted"
      || (quoteId && (convertedEstimateIds.has(quoteId) || invoicedEstimateIds.has(quoteId)))
      || (quoteNumber && convertedEstimateNumbers.has(quoteNumber))
    if (converted || excludedStatuses.has(status) || quoteDate < monday || quoteDate > sunday) continue
    documents.push({
      id: quote.id,
      type: "estimate",
      subtotal: subtotal(items, quote.amount),
      profit: number(extractProfit(items)),
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

  return NextResponse.json({
    total: breakdown.invoice + breakdown.salesorder + breakdown.estimate,
    count: documents.length,
    breakdown,
    documents: visibleDocuments,
    range: { start: monday.toISOString(), end: sunday.toISOString() },
  })
}
