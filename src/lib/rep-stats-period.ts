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

export interface RepStatsDateRangeOptions {
  customStartDate?: string | null
  customEndDate?: string | null
  monthParam?: string | null
  dateParam?: string | null
  now?: Date
}

export interface RepStatsResolvedDateRange {
  rangeStart: Date
  rangeEnd: Date
  weekStart: Date
  weekEnd: Date
  year: number
  month: number
}

export function resolveRepStatsDateRange(
  periodParam: string = 'this_month',
  options: RepStatsDateRangeOptions = {},
): RepStatsResolvedDateRange {
  const now = options.now || new Date()
  const offsetMs = 7 * 60 * 60 * 1000 // Arizona UTC-7 (no daylight saving time)
  const arizonaNow = new Date(now.getTime() - offsetMs)
  const year = arizonaNow.getUTCFullYear()
  const month = arizonaNow.getUTCMonth()
  const date = arizonaNow.getUTCDate()
  const day = arizonaNow.getUTCDay()

  let rangeStart: Date
  let rangeEnd: Date

  if (periodParam === 'all_time' || periodParam === 'all') {
    rangeStart = new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(2099, 11, 31, 23, 59, 59, 999))
  } else if (options.customStartDate && options.customEndDate) {
    rangeStart = new Date(options.customStartDate + 'T00:00:00.000Z')
    rangeEnd = new Date(options.customEndDate + 'T23:59:59.999Z')
  } else if (periodParam === 'today') {
    rangeStart = new Date(Date.UTC(year, month, date, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(year, month, date, 23, 59, 59, 999))
  } else if (periodParam === 'this_week') {
    const mondayDate = date + (day === 0 ? -6 : 1 - day)
    rangeStart = new Date(Date.UTC(year, month, mondayDate, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(year, month, mondayDate + 6, 23, 59, 59, 999))
  } else if (periodParam === 'this_month') {
    rangeStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
  } else if (periodParam === 'last_month') {
    rangeStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  } else if (periodParam === 'this_year') {
    rangeStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  } else if (periodParam === 'last_year') {
    rangeStart = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999))
  } else if (options.monthParam && /^\d{4}-\d{2}$/.test(options.monthParam)) {
    const [yyyy, mm] = options.monthParam.split('-')
    rangeStart = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, 1, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(parseInt(yyyy), parseInt(mm), 0, 23, 59, 59, 999))
  } else if (options.dateParam && /^\d{4}-\d{2}-\d{2}$/.test(options.dateParam)) {
    const [yyyy, mm, dd] = options.dateParam.split('-')
    rangeStart = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), 23, 59, 59, 999))
  } else {
    // Default to this_month
    rangeStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    rangeEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
  }

  // Week boundaries for weekly revenue calculation (Mon-Sun in Arizona time)
  const mondayDate = date + (day === 0 ? -6 : 1 - day)
  const weekStart = new Date(Date.UTC(year, month, mondayDate, 0, 0, 0, 0))
  const weekEnd = new Date(Date.UTC(year, month, mondayDate + 6, 23, 59, 59, 999))

  return { rangeStart, rangeEnd, weekStart, weekEnd, year, month: month + 1 }
}
