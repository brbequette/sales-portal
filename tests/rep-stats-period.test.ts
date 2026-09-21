import { describe, expect, it } from 'vitest'
import { calculateTargetProgress, combineRepStatsDocuments, countCompanyWorkdays } from '../src/lib/rep-stats-period'

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
})
