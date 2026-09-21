import { describe, expect, it } from 'vitest'
import { aggregateCompanyTarget, calculateTargetProgress, combineRepStatsDocuments, countCompanyWorkdays, eligibleRepIdsForYear, resolveRepStatsVigRate } from '../src/lib/rep-stats-period'

describe('Rep Stats canonical period contract', () => {
  it('combines 15 invoices and 2 eligible uninvoiced orders without losing cents', () => {
    const invoices = Array.from({ length: 15 }, (_, index) => ({ subtotal: index === 0 ? 26_281.14 : 1_000, profit: index === 0 ? -1_678.32 : 1_000, costQuality: 'AUTHORITATIVE_STORED' as const }))
    const orders = [
      { subtotal: 4_499.75, profit: 1_799.90, costQuality: 'AUTHORITATIVE_STORED' as const },
      { subtotal: 0, profit: 0, costQuality: 'AUTHORITATIVE_STORED' as const },
    ]
    expect(combineRepStatsDocuments(invoices, orders)).toEqual({ revenue: 44_780.89, profit: 14_121.58, documentCount: 17, invoiceCount: 15, salesOrderCount: 2, blockedProfitCount: 0 })
  })

  it('keeps revenue visible while blocked profit remains zero', () => {
    expect(combineRepStatsDocuments([], [{ subtotal: 99.95, profit: 0, costQuality: 'BLOCKED_MISSING_COST' }])).toMatchObject({ revenue: 99.95, profit: 0, blockedProfitCount: 1 })
  })

  it('calculates configured target progress using its declared metric', () => {
    expect(calculateTargetProgress({ revenue: 40_000, profit: 10_500 }, { configured: true, value: 21_000, metric: 'PROFIT', source: 'DAILY_PROFIT_TARGET' })).toBe(50)
    expect(calculateTargetProgress({ revenue: 40_000, profit: 10_500 }, { configured: true, value: 50_000, metric: 'SUBTOTAL', source: 'MONTHLY_VIG_GOAL' })).toBe(80)
  })

  it('returns unavailable progress for missing targets', () => {
    expect(calculateTargetProgress({ revenue: 100, profit: 50 }, { configured: false, value: null, metric: 'PROFIT', source: 'NOT_CONFIGURED' })).toBeNull()
  })

  it('uses weekdays minus configured company holidays', () => {
    expect(countCompanyWorkdays(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-30T23:59:59Z'), new Set(['2026-09-07']))).toBe(21)
  })

  it('uses selected-year sales activity and salesperson status for a stable roster', () => {
    const eligible = eligibleRepIdsForYear([
      { repId: 'ross', isSalesperson: true, yearInvoiceCount: 9, yearSalesOrderCount: 0 },
      { repId: 'monty', isSalesperson: true, yearInvoiceCount: 0, yearSalesOrderCount: 2 },
      { repId: 'zero-month', isSalesperson: true, yearInvoiceCount: 1, yearSalesOrderCount: 0 },
      { repId: 'admin-only', isSalesperson: false, yearInvoiceCount: 0, yearSalesOrderCount: 0 },
      { repId: 'service', isSalesperson: false, yearInvoiceCount: 0, yearSalesOrderCount: 0 },
      { repId: 'inactive', isSalesperson: false, yearInvoiceCount: 3, yearSalesOrderCount: 0 },
      { repId: 'empty-login', isSalesperson: true, yearInvoiceCount: 0, yearSalesOrderCount: 0 },
    ])
    expect([...eligible]).toEqual(['ross', 'monty', 'zero-month'])
  })

  it('aggregates company targets only from eligible roster members', () => {
    const target = { configured: true, value: 21_000, metric: 'PROFIT' as const, source: 'DAILY_PROFIT_TARGET' as const }
    expect(aggregateCompanyTarget([
      { target, revenue: 26_248.50, profit: 7_798.91 },
      { target, revenue: 18_532.39, profit: 6_322.67 },
    ])).toMatchObject({ configured: true, includedRepCount: 2, missingTargetCount: 0, target: 42_000, actual: 14_121.58, progressPercent: 33.62280952380952 })
  })

  it('reports incomplete configuration only when an eligible rep lacks a target', () => {
    const result = aggregateCompanyTarget([
      { target: { configured: true, value: 21_000, metric: 'PROFIT', source: 'DAILY_PROFIT_TARGET' }, revenue: 100, profit: 50 },
      { target: { configured: false, value: null, metric: 'PROFIT', source: 'NOT_CONFIGURED' }, revenue: 0, profit: 0 },
    ])
    expect(result).toMatchObject({ configured: false, status: 'INCOMPLETE_CONFIGURATION', includedRepCount: 2, missingTargetCount: 1, target: null, progressPercent: null })
  })

  it('keeps Monty at permanent 1.0 VIG and uses authoritative VIG for other reps', () => {
    expect(resolveRepStatsVigRate('MONTGOMERY MORGAN', false, null, 1.5)).toBe(1.0)
    expect(resolveRepStatsVigRate('ROSS HAISLER', false, null, 1.3)).toBe(1.3)
    expect(resolveRepStatsVigRate('ROSS HAISLER', true, 1.4, 1.3)).toBe(1.4)
  })
})
