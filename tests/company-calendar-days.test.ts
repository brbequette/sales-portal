import { describe, expect, it } from 'vitest'
import { companyCalendarDaysBetween, normalizeWholeDaysRemaining } from '../src/lib/company-calendar-days'
import { classifyAtRiskInvoices, DEFAULT_CLAWBACK_SETTINGS, type InvoiceForClawback } from '../src/lib/clawback-calculator'

describe('whole days remaining to clawback', () => {
  it.each([
    [29.9, 29],
    [30.0, 30],
    [49.8, 49],
    [59.9, 59],
    [60.0, 60],
    [-0.1, 0],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeWholeDaysRemaining(input)).toBe(expected)
  })

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '49.8'])('marks %s unavailable', input => {
    expect(normalizeWholeDaysRemaining(input)).toBeNull()
  })

  it('uses Phoenix calendar boundaries instead of elapsed hours', () => {
    expect(companyCalendarDaysBetween('2026-09-20', '2026-09-21T00:30:00-07:00')).toBe(1)
    expect(companyCalendarDaysBetween('invalid', '2026-09-21T00:30:00-07:00')).toBeNull()
  })

  it.each([
    [29.9, 'critical', 29],
    [30.0, 'warning', 30],
    [49.8, 'warning', 49],
    [59.9, 'warning', 59],
    [60.0, 'watch', 60],
    [-0.1, 'critical', 0],
  ] as const)('uses normalized %s days for the %s tier', (remaining, urgency, normalized) => {
    const invoice = invoiceWithDaysOld(DEFAULT_CLAWBACK_SETTINGS.clawback_threshold_days - remaining)
    const [classified] = classifyAtRiskInvoices([invoice], DEFAULT_CLAWBACK_SETTINGS)
    expect(classified.daysToClawback).toBe(normalized)
    expect(classified.urgency).toBe(urgency)
  })

  it('sorts unavailable dates last and labels them unavailable', () => {
    const result = classifyAtRiskInvoices([
      invoiceWithDaysOld(null, 'missing'),
      invoiceWithDaysOld(80, 'valid'),
    ], DEFAULT_CLAWBACK_SETTINGS)
    expect(result.map(item => item.id)).toEqual(['valid', 'missing'])
    expect(result[1].daysToClawback).toBeNull()
    expect(result[1].urgency).toBe('unavailable')
  })
})

function invoiceWithDaysOld(daysOld: number | null, id = 'invoice'): InvoiceForClawback {
  return {
    id,
    issueDate: '2026-01-01',
    dueDate: daysOld == null ? null : '2026-01-31',
    amount: 100,
    deadCost: 20,
    deadProfit: 80,
    profit: 70,
    vigRate: 1.3,
    actualShippingCost: 0,
    isPaid: false,
    daysOld,
    repId: 'rep',
    accountName: 'Sanitized account',
    commission: { upfront: 10, final: 0, future: 10, total: 10 },
  }
}
