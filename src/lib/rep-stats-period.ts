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

export type RepStatsRosterCandidate = {
  repId: string
  isSalesperson: boolean
  yearInvoiceCount: number
  yearSalesOrderCount: number
}

export type RepStatsCompanyTargetMember = {
  target: RepStatsTarget
  revenue: number
  profit: number
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

export function eligibleRepIdsForYear(candidates: RepStatsRosterCandidate[]) {
  return new Set(candidates
    .filter(candidate => candidate.isSalesperson && candidate.yearInvoiceCount + candidate.yearSalesOrderCount > 0)
    .map(candidate => candidate.repId))
}

export function aggregateCompanyTarget(members: RepStatsCompanyTargetMember[]) {
  const missingTargetCount = members.filter(member => !member.target.configured || member.target.value == null || member.target.value <= 0).length
  const metrics = new Set(members.filter(member => member.target.configured).map(member => member.target.metric))
  const configured = members.length > 0 && missingTargetCount === 0 && metrics.size === 1
  const metric = metrics.size === 1 ? [...metrics][0] : null
  const target = configured ? cents(members.reduce((sum, member) => sum + (member.target.value || 0), 0)) : null
  const actual = metric === 'SUBTOTAL'
    ? cents(members.reduce((sum, member) => sum + member.revenue, 0))
    : cents(members.reduce((sum, member) => sum + member.profit, 0))
  return {
    configured,
    status: configured ? 'CONFIGURED' as const : 'INCOMPLETE_CONFIGURATION' as const,
    includedRepCount: members.length,
    missingTargetCount,
    metric,
    target,
    actual,
    progressPercent: configured && target ? actual / target * 100 : null,
  }
}

export function resolveRepStatsVigRate(
  repName: string,
  constantEnabled: boolean,
  constantValue: number | null,
  authoritativeRate: number,
) {
  const normalizedName = repName.trim().toLowerCase()
  if (normalizedName.includes('montgomery') || normalizedName.includes('monty morgan')) return 1.0
  return constantEnabled && constantValue != null ? constantValue : authoritativeRate
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
