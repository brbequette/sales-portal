export type RepStatsDocument = {
  subtotal: number
  profit: number
  costQuality: 'AUTHORITATIVE_STORED' | 'BLOCKED_MISSING_COST'
}

export type RepStatsTarget = {
  configured: boolean
  value: number | null
  metric: 'PROFIT' | 'SUBTOTAL'
  source: 'MONTHLY_VIG_GOAL' | 'DAILY_PROFIT_TARGET' | 'NOT_CONFIGURED'
}

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function combineRepStatsDocuments(invoices: RepStatsDocument[], salesOrders: RepStatsDocument[]) {
  const documents = [...invoices, ...salesOrders]
  return {
    revenue: cents(documents.reduce((sum, document) => sum + document.subtotal, 0)),
    profit: cents(documents.reduce((sum, document) => sum + document.profit, 0)),
    documentCount: documents.length,
    invoiceCount: invoices.length,
    salesOrderCount: salesOrders.length,
    blockedProfitCount: documents.filter(document => document.costQuality === 'BLOCKED_MISSING_COST').length,
  }
}

export function calculateTargetProgress(
  totals: { revenue: number; profit: number },
  target: RepStatsTarget,
): number | null {
  if (!target.configured || target.value == null || target.value <= 0) return null
  const actual = target.metric === 'SUBTOTAL' ? totals.revenue : totals.profit
  return actual / target.value * 100
}

export function countCompanyWorkdays(start: Date, end: Date, holidays: Set<string>) {
  let count = 0
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (cursor <= last) {
    const day = cursor.getUTCDay()
    const key = cursor.toISOString().slice(0, 10)
    if (day !== 0 && day !== 6 && !holidays.has(key)) count++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return count
}
