import { extractCommissionAmount, extractProfit } from "@/lib/custom-field-extractor"

export const HEADER_TERMINAL_STATUSES = new Set([
  "draft", "void", "voided", "declined", "cancelled", "canceled", "orphaned", "deleted",
])
export const HEADER_CONVERTED_ORDER_STATUSES = new Set(["invoiced", "billed", "partially_invoiced"])
export const HEADER_CLOSED_INVOICE_STATUSES = new Set(["paid", "closed"])

type JsonFields = Record<string, unknown>

export type HeaderInvoice = {
  amount: number
  balance: number | null
  status: string
  issueDate: Date
  dueDate: Date | null
  items: unknown
  computedProfit: number | null
  computedSalesperson: string | null
  syncConflict: boolean
  pendingZohoFetch: boolean
}

export type HeaderSalesOrder = {
  amount: number
  status: string
  orderDate: Date
  items: unknown
  syncConflict: boolean
  pendingZohoFetch: boolean
  linkedToInvoice: boolean
}

export type GlobalHeaderMetrics = {
  weeklySales: number
  mtdSales: number
  mtdProfit: number
  mtdCommission: number
  pipeline: number
  overdue: number
}

const text = (value: unknown) => String(value || "").trim().toLowerCase()
const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const fields = (items: unknown) => items && typeof items === "object" && !Array.isArray(items)
  ? items as JsonFields
  : {}

export function headerSubtotal(items: unknown, amount: number) {
  const itemFields = fields(items)
  const stored = number(itemFields.sub_total ?? itemFields.subTotal ?? itemFields.subtotal)
  return stored !== 0 ? stored : number(amount)
}

export function isExcludedHeaderSalesperson(value: unknown) {
  const name = String(value || "").toUpperCase()
  return name.includes("PAUL") && (name.includes("GENCUSKI") || name.includes("GENKUSKI"))
}

export function isResolvedHeaderDocument(document: { syncConflict: boolean; pendingZohoFetch: boolean }) {
  return document.syncConflict !== true && document.pendingZohoFetch !== true
}

export function isActiveHeaderInvoice(invoice: HeaderInvoice) {
  return isResolvedHeaderDocument(invoice) && !HEADER_TERMINAL_STATUSES.has(text(invoice.status))
}

export function isActiveUninvoicedHeaderOrder(order: HeaderSalesOrder) {
  const status = text(order.status)
  return isResolvedHeaderDocument(order)
    && !HEADER_TERMINAL_STATUSES.has(status)
    && !HEADER_CONVERTED_ORDER_STATUSES.has(status)
    && !order.linkedToInvoice
}

function arizonaPeriods(now: Date) {
  const offsetMs = 7 * 60 * 60 * 1000
  const arizonaNow = new Date(now.getTime() - offsetMs)
  const year = arizonaNow.getUTCFullYear()
  const month = arizonaNow.getUTCMonth()
  const date = arizonaNow.getUTCDate()
  const day = arizonaNow.getUTCDay()
  const weekStart = new Date(Date.UTC(year, month, date + (day === 0 ? -6 : 1 - day)))
  return {
    monthStart: new Date(Date.UTC(year, month, 1, 7)),
    monthEnd: new Date(Date.UTC(year, month + 1, 1, 7)),
    weekStart,
    weekEnd: new Date(weekStart.getTime() + 7 * 86_400_000),
  }
}

export function calculateGlobalHeaderMetrics(
  now: Date,
  invoices: HeaderInvoice[],
  salesOrders: HeaderSalesOrder[],
): GlobalHeaderMetrics {
  const { monthStart, monthEnd, weekStart, weekEnd } = arizonaPeriods(now)
  const totals: GlobalHeaderMetrics = {
    weeklySales: 0, mtdSales: 0, mtdProfit: 0, mtdCommission: 0, pipeline: 0, overdue: 0,
  }

  for (const invoice of invoices) {
    if (!isActiveHeaderInvoice(invoice)) continue
    const status = text(invoice.status)
    const subtotal = headerSubtotal(invoice.items, invoice.amount)
    const invoiceFields = fields(invoice.items)
    const salesperson = invoice.computedSalesperson
      || invoiceFields.salesperson_name
      || invoiceFields.salesperson
    const salesEligible = !isExcludedHeaderSalesperson(salesperson)

    if (salesEligible && invoice.issueDate >= weekStart && invoice.issueDate < weekEnd) {
      totals.weeklySales += subtotal
    }
    if (salesEligible && invoice.issueDate >= monthStart && invoice.issueDate < monthEnd) {
      totals.mtdSales += subtotal
      totals.mtdProfit += number(invoice.computedProfit ?? extractProfit(invoiceFields))
      totals.mtdCommission += number(extractCommissionAmount(invoiceFields))
    }

    const balance = number(invoice.balance)
    if (balance > 0 && !HEADER_CLOSED_INVOICE_STATUSES.has(status)) {
      totals.pipeline += balance
      if (status === "overdue" || (invoice.dueDate && invoice.dueDate < now)) totals.overdue += balance
    }
  }

  for (const order of salesOrders) {
    if (!isActiveUninvoicedHeaderOrder(order)) continue
    const orderFields = fields(order.items)
    const subtotal = headerSubtotal(orderFields, order.amount)
    const salesperson = orderFields.salesperson_name || orderFields.salesperson
    const salesEligible = !isExcludedHeaderSalesperson(salesperson)

    if (salesEligible && order.orderDate >= weekStart && order.orderDate < weekEnd) {
      totals.weeklySales += subtotal
    }
    if (salesEligible && order.orderDate >= monthStart && order.orderDate < monthEnd) {
      totals.mtdSales += subtotal
      totals.mtdProfit += number(extractProfit(orderFields))
      totals.mtdCommission += number(extractCommissionAmount(orderFields))
    }
    totals.pipeline += subtotal
  }

  return totals
}
