import { describe, expect, it } from 'vitest'
import { calculateCardProcessingFee, isGiftItem, isNoVigItem, resolveCardFeeBase, requiresManagerReview } from '../../netlify/functions/lib/cost-calculations'

describe('approved financial rules', () => {
  it('calculates card processing at 4.5% of grand total and rounds to cents', () => {
    expect(calculateCardProcessingFee(112.345)).toBe(5.06)
  })

  it('returns zero for non-positive or missing totals', () => {
    expect(calculateCardProcessingFee(0)).toBe(0)
    expect(calculateCardProcessingFee(Number.NaN)).toBe(0)
  })

  it('uses the configured rate and rounds only the final fee to cents', () => {
    expect(calculateCardProcessingFee(100, 4.5)).toBe(4.5)
    expect(calculateCardProcessingFee(99.99, 4.5)).toBe(4.5)
  })

  it('uses grand total first and flags legacy subtotal fallback', () => {
    expect(resolveCardFeeBase({ total_amount: 125 }, 100)).toEqual({ base: 125 })
    expect(resolveCardFeeBase({}, 100)).toEqual({ base: 100, reviewReason: 'MISSING_GRAND_TOTAL' })
  })

  it('classifies zero-price and explicit gift items as gifts', () => {
    expect(isGiftItem({ name: 'Promo Hat', rate: 10 })).toBe(true)
    expect(isGiftItem({ name: 'Blade', rate: 0 })).toBe(true)
  })

  it('keeps free blades subject to VIG while swag is exempt', () => {
    expect(isNoVigItem({ name: 'Diamond Blade', rate: 0 })).toBe(false)
    expect(isNoVigItem({ name: 'Promo Hat', rate: 0 })).toBe(true)
  })

  it('does not classify ordinary paid products as gifts or VIG-exempt', () => {
    const blade = { name: 'Specialty Diamond Blade', sku: 'SMX10EV', rate: 125 }
    expect(isGiftItem(blade)).toBe(false)
    expect(isNoVigItem(blade)).toBe(false)
  })

  it('honors explicit no-VIG flags for paid items', () => {
    expect(isNoVigItem({ name: 'Freight adjustment', rate: 25, no_vig: true })).toBe(true)
  })

  it('requires manager review for non-gift nonpositive profit only', () => {
    expect(requiresManagerReview(0, false)).toBe(true)
    expect(requiresManagerReview(-1, false)).toBe(true)
    expect(requiresManagerReview(0, true)).toBe(false)
  })
})
