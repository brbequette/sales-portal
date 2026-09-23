const DAY_MS = 86_400_000

/**
 * Sales reporting assigns Saturday and Sunday invoices to the following
 * Monday. The source invoice date remains unchanged in Zoho Books and the DB.
 */
export function invoiceReportingDate(value: Date | string): Date {
  const date = new Date(value)
  const day = date.getUTCDay()
  if (day === 6) return new Date(date.getTime() + 2 * DAY_MS)
  if (day === 0) return new Date(date.getTime() + DAY_MS)
  return date
}

export function reportingInvoiceQueryStart(periodStart: Date): Date {
  return new Date(periodStart.getTime() - 2 * DAY_MS)
}
