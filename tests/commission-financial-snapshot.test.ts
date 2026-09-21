import { describe, expect, it } from 'vitest'
import { hasAuthoritativeInvoiceColumns } from '../src/lib/commission-financial-snapshot'

describe('commission authoritative invoice snapshots', () => {
  it('accepts legitimate numeric zero values', () => {
    expect(hasAuthoritativeInvoiceColumns(
      { computedDeadCost: 0, computedProfit: 0, computedDeadProfit: 0 },
      { salesCommission: 0 },
    )).toBe(true)
  })

  it('accepts stored numeric strings without treating them as missing', () => {
    expect(hasAuthoritativeInvoiceColumns(
      { computedDeadCost: '40.00', computedProfit: '-40.00', computedDeadProfit: '-40.00' },
      { cf_commission_amount_unformatted: '-20.00' },
    )).toBe(true)
  })

  it('fails closed when any authoritative component is absent', () => {
    expect(hasAuthoritativeInvoiceColumns(
      { computedDeadCost: 40, computedProfit: -40, computedDeadProfit: null },
      { salesCommission: -20 },
    )).toBe(false)
    expect(hasAuthoritativeInvoiceColumns(
      { computedDeadCost: 40, computedProfit: -40, computedDeadProfit: -40 },
      {},
    )).toBe(false)
  })
})
