/**
 * Canonical document status rules for every sales / profit / commission total.
 *
 * Business rule (owner confirmed): an invoice counts toward sales, profit and
 * commission totals at ANY status — draft, sent, unpaid, overdue, partially
 * paid or paid. Only cancelled/voided paperwork is excluded, because those
 * documents no longer represent a sale. Payment status still decides WHEN a
 * commission half is earned, never whether the invoice is counted.
 *
 * Zoho Books' "Sales by Salesperson" report follows the same rule, which is why
 * portal totals that dropped drafts always read low against that report.
 */

/** Statuses that void the sale entirely. Nothing else may be excluded. */
export const CANCELLED_INVOICE_STATUSES = [
  "void",
  "voided",
  "cancelled",
  "canceled",
  "deleted",
] as const

/**
 * Receivables (pipeline / overdue / collections) intentionally ignore drafts
 * and paid invoices — an unsent draft is not money owed to the company.
 * This is a payment-tracking rule, never a sales rule.
 */
export const NON_RECEIVABLE_INVOICE_STATUSES = [
  ...CANCELLED_INVOICE_STATUSES,
  "draft",
  "paid",
  "closed",
  "written_off",
] as const

/** Sales orders that no longer belong in active (uninvoiced) pipeline. */
export const INACTIVE_SALES_ORDER_STATUSES = [
  ...CANCELLED_INVOICE_STATUSES,
  "declined",
  "orphaned",
  "draft",
  "invoiced",
  "billed",
  "converted",
  "closed",
] as const

const normalize = (status?: string | null) => String(status ?? "").trim().toLowerCase()

/** Zoho and legacy syncs write mixed casing, so match every common variant. */
const statusVariants = (statuses: readonly string[]) =>
  Array.from(
    new Set(
      statuses.flatMap(status => [
        status,
        status.toUpperCase(),
        status.charAt(0).toUpperCase() + status.slice(1),
      ]),
    ),
  )

export const CANCELLED_INVOICE_STATUS_VARIANTS = statusVariants(CANCELLED_INVOICE_STATUSES)
export const NON_RECEIVABLE_INVOICE_STATUS_VARIANTS = statusVariants(NON_RECEIVABLE_INVOICE_STATUSES)
export const INACTIVE_SALES_ORDER_STATUS_VARIANTS = statusVariants(INACTIVE_SALES_ORDER_STATUSES)

/** True when the document counts as a sale for revenue/profit/commission. */
export const isCountableInvoiceStatus = (status?: string | null) =>
  !(CANCELLED_INVOICE_STATUSES as readonly string[]).includes(normalize(status))

/** True when the invoice balance belongs in receivables / overdue reporting. */
export const isReceivableInvoiceStatus = (status?: string | null) =>
  !(NON_RECEIVABLE_INVOICE_STATUSES as readonly string[]).includes(normalize(status))

/** True when a sales order is still uninvoiced pipeline. */
export const isActiveSalesOrderStatus = (status?: string | null) =>
  !(INACTIVE_SALES_ORDER_STATUSES as readonly string[]).includes(normalize(status))

/** Prisma `where` fragment: every invoice that counts as a sale. */
export const countableInvoiceStatusFilter = () => ({ notIn: [...CANCELLED_INVOICE_STATUS_VARIANTS] })

/** Prisma `where` fragment: invoices whose balance is real receivable money. */
export const receivableInvoiceStatusFilter = () => ({ notIn: [...NON_RECEIVABLE_INVOICE_STATUS_VARIANTS] })

/** Prisma `where` fragment: sales orders still in active pipeline. */
export const activeSalesOrderStatusFilter = () => ({ notIn: [...INACTIVE_SALES_ORDER_STATUS_VARIANTS] })

/**
 * Calendar-month bounds in UTC. Zoho stores date-only values at either 00:00 or
 * 12:00 UTC, so any offset lower bound (for example Arizona's 07:00) silently
 * drops documents dated the 1st and pulls in documents dated the 1st of the
 * next month.
 */
export const utcMonthRange = (reference: Date = new Date()) => ({
  start: new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1)),
  end: new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1)),
})

/**
 * Planned (full) commission for an invoice, ignoring the historically corrupted
 * `computedFinal` column — some rows stored the entire invoice total there
 * instead of the 50% final half, which inflated every commission roll-up.
 */
export const plannedInvoiceCommission = (input: {
  storedCommission?: unknown
  legacyCommission?: unknown
  customCommission?: unknown
  computedUpfront?: unknown
  profit?: number
}) => {
  const stored = Number.parseFloat(String(input.storedCommission ?? ""))
  if (Number.isFinite(stored)) return stored
  const legacy = Number.parseFloat(String(input.legacyCommission ?? ""))
  if (Number.isFinite(legacy)) return legacy
  const custom = Number.parseFloat(String(input.customCommission ?? ""))
  if (Number.isFinite(custom)) return custom
  const upfront = Number.parseFloat(String(input.computedUpfront ?? ""))
  if (Number.isFinite(upfront)) return upfront * 2
  return (Number(input.profit) || 0) * 0.5
}
