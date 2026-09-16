import { extractCustomFieldValue } from "@/lib/custom-field-extractor"

export const HEADER_TERMINAL_STATUSES = new Set([
  "draft", "void", "voided", "declined", "cancelled", "canceled", "orphaned", "deleted",
  "written_off", "writeoff", "write_off", "written off", "bad debt",
])
export const HEADER_CONVERTED_ORDER_STATUSES = new Set(["converted", "invoiced", "billed", "partially_invoiced"])
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
  accountOwnerId?: string | null
}

export type HeaderSalesOrder = {
  amount: number
  status: string
  orderDate: Date
  items: unknown
  syncConflict: boolean
  pendingZohoFetch: boolean
  linkedToInvoice: boolean
  accountOwnerId?: string | null
}

export type GlobalHeaderScope = "company" | "personal"
export type GlobalHeaderIdentity = { id?: string | null; name?: string | null; role?: string | null }

export type GlobalHeaderMetrics = {
  weeklySales: number
  mtdSales: number
  mtdProfit: number
  mtdCommission: number
  pipeline: number
  overdue: number
}

export type GlobalHeaderSummary = GlobalHeaderMetrics & { scope: GlobalHeaderScope }

const text = (value: unknown) => String(value || "").trim().toLowerCase()
export const financialNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  const negative = raw.startsWith("(") && raw.endsWith(")")
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""))
  if (negative && Number.isFinite(parsed)) return -Math.abs(parsed)
  return Number.isFinite(parsed) ? parsed : 0
}
const fields = (items: unknown) => items && typeof items === "object" && !Array.isArray(items)
  ? items as JsonFields
  : {}

export function headerSubtotal(items: unknown, amount: number) {
  const itemFields = fields(items)
  const stored = financialNumber(itemFields.sub_total ?? itemFields.subTotal ?? itemFields.subtotal)
  return stored !== 0 ? stored : financialNumber(amount)
}

export function headerProfit(items: unknown, computedProfit?: number | null) {
  if (computedProfit !== null && computedProfit !== undefined) return financialNumber(computedProfit)
  return financialNumber(
    extractCustomFieldValue(items, "cf_estimated_profit", null)
      ?? extractCustomFieldValue(items, "cf_profit", null)
      ?? extractCustomFieldValue(items, "profit", null),
  )
}

export function headerCommission(items: unknown) {
  return financialNumber(
    extractCustomFieldValue(items, "cf_commission_amount", null)
      ?? extractCustomFieldValue(items, "cf_commision_amount", null)
      ?? extractCustomFieldValue(items, "salesCommission", null)
      ?? extractCustomFieldValue(items, "sales_commission", null)
      ?? extractCustomFieldValue(items, "commission", null),
  )
}

export function resolveGlobalHeaderScope(role: unknown): GlobalHeaderScope {
  const normalized = text(role)
  return normalized === "master_admin"
    || normalized === "admin"
    || normalized === "administrator"
    || normalized.includes("manager")
    || normalized.includes("collections")
    ? "company"
    : "personal"
}

const canonicalPerson = (value: unknown) => {
  const normalized = text(value).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ")
  return normalized
    .replace(/^ben /, "benjamin ")
    .replace(/^monty /, "montgomery ")
    .replace(/^ricky /, "richard ")
    .replace(/^rick /, "richard ")
    .trim()
}

function salesperson(items: unknown, computed?: unknown) {
  const itemFields = fields(items)
  return computed || itemFields.salesorder_salesperson_name || itemFields.salesperson_name || itemFields.salesperson || ""
}

function matchesPersonalScope(ownerId: unknown, assignedSalesperson: unknown, identity: GlobalHeaderIdentity) {
  const identityId = String(identity.id || "")
  const ownerMatch = Boolean(identityId && String(ownerId || "") === identityId)
  const identityName = canonicalPerson(identity.name)
  const salespersonMatch = Boolean(identityName && canonicalPerson(assignedSalesperson) === identityName)
  return ownerMatch || salespersonMatch
}

export function scopeGlobalHeaderDocuments(
  scope: GlobalHeaderScope,
  identity: GlobalHeaderIdentity,
  invoices: HeaderInvoice[],
  salesOrders: HeaderSalesOrder[],
) {
  if (scope === "company") return { invoices, salesOrders }
  return {
    invoices: invoices.filter(invoice => matchesPersonalScope(
      invoice.accountOwnerId,
      salesperson(invoice.items, invoice.computedSalesperson),
      identity,
    )),
    salesOrders: salesOrders.filter(order => matchesPersonalScope(
      order.accountOwnerId,
      salesperson(order.items),
      identity,
    )),
  }
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
    // Zoho date-only document values are stored at UTC midnight or noon.
    // Querying from 07:00 UTC drops valid first-of-month midnight records.
    monthStart: new Date(Date.UTC(year, month, 1)),
    monthEnd: new Date(Date.UTC(year, month + 1, 1)),
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
    if (invoice.issueDate >= weekStart && invoice.issueDate < weekEnd) {
      totals.weeklySales += subtotal
    }
    if (invoice.issueDate >= monthStart && invoice.issueDate < monthEnd) {
      totals.mtdSales += subtotal
      totals.mtdProfit += headerProfit(invoiceFields, invoice.computedProfit)
      totals.mtdCommission += headerCommission(invoiceFields)
    }

    const balance = financialNumber(invoice.balance)
    if (balance > 0 && !HEADER_CLOSED_INVOICE_STATUSES.has(status)) {
      totals.pipeline += balance
      if (status === "overdue" || (invoice.dueDate && invoice.dueDate < now)) totals.overdue += balance
    }
  }

  for (const order of salesOrders) {
    if (!isActiveUninvoicedHeaderOrder(order)) continue
    const orderFields = fields(order.items)
    const subtotal = headerSubtotal(orderFields, order.amount)
    if (order.orderDate >= weekStart && order.orderDate < weekEnd) {
      totals.weeklySales += subtotal
    }
    if (order.orderDate >= monthStart && order.orderDate < monthEnd) {
      totals.mtdSales += subtotal
      totals.mtdProfit += headerProfit(orderFields)
      totals.mtdCommission += headerCommission(orderFields)
    }
    totals.pipeline += subtotal
  }

  return Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, Math.round((value + Number.EPSILON) * 100) / 100]),
  ) as GlobalHeaderMetrics
}

export function parseGlobalHeaderSummary(payload: unknown): GlobalHeaderSummary | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const summary = record.summary
  if (!summary || typeof summary !== "object") return null
  const values = summary as Record<string, unknown>
  const scope = record.scope
  const keys: Array<keyof GlobalHeaderMetrics> = ["weeklySales", "mtdSales", "mtdProfit", "mtdCommission", "pipeline", "overdue"]
  if ((scope !== "company" && scope !== "personal") || keys.some(key => typeof values[key] !== "number" || !Number.isFinite(values[key]))) return null
  return {
    scope,
    weeklySales: values.weeklySales as number,
    mtdSales: values.mtdSales as number,
    mtdProfit: values.mtdProfit as number,
    mtdCommission: values.mtdCommission as number,
    pipeline: values.pipeline as number,
    overdue: values.overdue as number,
  }
}
