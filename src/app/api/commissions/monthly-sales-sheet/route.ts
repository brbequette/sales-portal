import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type JsonRecord = Record<string, unknown>

const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}
const number = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}
const text = (...values: unknown[]) => values.find(value => typeof value === "string" && value.trim())?.toString().trim() || ""
const normalizeName = (value: string) => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "")
  const aliases: Record<string, string> = { ben: "benjamin", monty: "montgomery", ricky: "richard" }
  return aliases[normalized] || normalized
}

function salesperson(items: unknown) {
  const data = record(items)
  const lines = Array.isArray(data.line_items) ? data.line_items.map(record) : []
  return text(data.salespersonName, data.salesperson_name, data.cf_salesperson, lines[0]?.salesperson_name, lines[0]?.cf_salesperson)
}

function documentNumber(items: unknown, rawData: unknown, fallback: string, ...keys: string[]) {
  const raw = record(rawData)
  const sources = [record(items), raw, record(raw.salesorder), record(raw.estimate), record(raw.invoice)]
  return text(...sources.flatMap(source => keys.map(key => source[key])), fallback)
}

function financials(items: unknown, amount: number, fallbackVig = 1.3) {
  const data = record(items)
  const deadCost = number(data.deadCostTotal, data.dead_cost_total, data.deadCost, data.cf_dead_cost_total)
  const deadProfit = number(data.deadProfitActual, data.dead_profit_actual, amount - deadCost)
  const profit = number(data.profit, data.netProfit, data.net_profit, deadProfit)
  return {
    deadCost,
    deadProfit,
    profit,
    vigRate: number(data.vigRate, data.vig_rate, data.cf_salesperson_vig, fallbackVig),
    estimatedCommission: number(data.salesCommission, data.sales_commission, data.cf_sales_commission),
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const params = request.nextUrl.searchParams
  const repId = params.get("repId") || ""
  const year = Number(params.get("year"))
  const month = Number(params.get("month"))
  if (!repId || !Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    return NextResponse.json({ error: "repId, year, and month are required" }, { status: 400 })
  }

  const rep = await prisma.user.findUnique({ where: { id: repId }, select: { id: true, name: true } })
  if (!rep) return NextResponse.json({ error: "Representative not found" }, { status: 404 })

  const role = String(session.user.role || "").toLowerCase()
  const sessionRepId = String((session.user as { dbId?: string }).dbId || "")
  const privileged = role.includes("admin") || role.includes("manager")
  if (!privileged && sessionRepId !== repId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 1))
  const [draftInvoices, salesOrders, linkedInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: { issueDate: { gte: start, lt: end }, status: { equals: "draft", mode: "insensitive" } },
      include: { account: { select: { id: true, ownerId: true, name: true } } },
    }),
    prisma.salesOrder.findMany({
      where: { orderDate: { gte: start, lt: end } },
      include: { account: { select: { id: true, ownerId: true, name: true } } },
    }),
    prisma.invoice.findMany({
      where: { OR: [{ salesOrderZohoId: { not: null } }, { estimateZohoId: { not: null } }] },
      select: { salesOrderZohoId: true, estimateZohoId: true, salesorderNumber: true },
    }),
  ])

  const repName = normalizeName(rep.name || "")
  const belongsToRep = (doc: { items: unknown; account: { ownerId: string } }) => {
    const assigned = normalizeName(salesperson(doc.items))
    return doc.account.ownerId === repId || (!!assigned && (assigned === repName || assigned.includes(repName) || repName.includes(assigned)))
  }
  const linkedSalesOrders = new Set(linkedInvoices.flatMap(i => [i.salesOrderZohoId, i.salesorderNumber].filter(Boolean)))
  const excludedSalesOrderStatuses = new Set(["invoiced", "converted", "closed", "void", "voided", "cancelled", "canceled"])

  const documents = [
    ...draftInvoices.filter(belongsToRep).map(invoice => {
      const f = financials(invoice.items, invoice.amount, invoice.computedVigRate || 1.3)
      return {
        id: invoice.id, zohoId: invoice.zohoId, documentType: "invoice", isDraft: true,
        documentNumber: invoice.computedInvoiceNumber || invoice.invoiceNumber || documentNumber(invoice.items, invoice.rawData, invoice.zohoId, "invoiceNumber", "invoice_number"),
        accountName: invoice.account.name, issueDate: invoice.issueDate, amount: invoice.amount,
        deadCost: invoice.computedDeadCost ?? f.deadCost, deadProfit: invoice.computedDeadProfit ?? f.deadProfit,
        profit: invoice.computedProfit ?? f.profit, vigRate: invoice.computedVigRate ?? f.vigRate,
        estimatedCommission: number(
          record(invoice.items).salesCommission,
          record(invoice.items).commission,
          f.estimatedCommission,
        ),
        status: invoice.status,
      }
    }),
    ...salesOrders.filter(belongsToRep).filter(order => {
      const num = documentNumber(order.items, order.rawData, "", "salesOrderNumber", "salesorderNumber", "salesorder_number", "sales_order_number")
      return !excludedSalesOrderStatuses.has(order.status.toLowerCase()) && !linkedSalesOrders.has(order.zohoId) && !linkedSalesOrders.has(num)
    }).map(order => ({
      id: order.id, zohoId: order.zohoId, documentType: "salesorder", isDraft: false,
      documentNumber: documentNumber(order.items, order.rawData, order.zohoId || order.id, "salesOrderNumber", "salesorderNumber", "salesorder_number", "sales_order_number"),
      accountName: order.account.name, issueDate: order.orderDate, amount: order.amount,
      ...financials(order.items, order.amount), status: order.status,
    })),
  ]

  return NextResponse.json({ documents })
}
