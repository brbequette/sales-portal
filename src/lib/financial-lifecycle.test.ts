import { describe, expect, it } from 'vitest'
import { calculateTariffReversal, shouldGatePayout } from './financial-lifecycle'

describe('financial lifecycle rules', () => {
  it('calculates proportional partial and full tariff reversals', () => {
    expect(calculateTariffReversal(12.5, 5, 10, 4).amount).toBe(2)
    expect(calculateTariffReversal(12.5, 5, 10, 10).amount).toBe(5)
  })
  it('rounds reversals and caps cumulative amount at original tariff', () => {
    const r = calculateTariffReversal(5, 4, 3, 2, 4)
    expect(r.amount).toBe(1)
    expect(r.cumulative).toBe(5)
    expect(r.capped).toBe(true)
  })
  it('requires review when linkage or quantities are missing', () => {
    expect(calculateTariffReversal(5, 5, 0, 1).reviewRequired).toBe(true)
  })
  it('gates payout while open reviews exist', () => {
    expect(shouldGatePayout(1)).toBe(true)
    expect(shouldGatePayout(0)).toBe(false)
  })
})
