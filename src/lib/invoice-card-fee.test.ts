import { describe, expect, it } from 'vitest'
import { calculateCardProcessingFee, isCardPaymentMode, resolveCardFeeBase } from './invoice-card-fee'

describe('invoice card fee', () => {
  it('charges grand total including tax and shipping once', () => {
    expect(calculateCardProcessingFee(resolveCardFeeBase({ total: 125 }, 100).base)).toBe(5.63)
  })
  it('accepts a legitimate zero total and flags missing totals', () => {
    expect(resolveCardFeeBase({ total: 0 }, 100)).toEqual({ base: 0 })
    expect(resolveCardFeeBase({ total: null }, 100).reviewReason).toBe('MISSING_GRAND_TOTAL')
  })
  it('rounds a half-cent fee up without floating-point truncation', () => {
    expect(calculateCardProcessingFee(57)).toBe(2.57)
  })
  it.each(['Credit Card', 'Square - Card', 'AUTHORIZE.NET', 'Stripe'])('recognizes the established card mode %s', mode => {
    expect(isCardPaymentMode(mode)).toBe(true)
  })
  it.each(['ZELLE', 'Check', 'Cash', 'ACH TRANSFER', 'Authorize.Net eCheck', 'PayPal ACH', 'CREDIT NOTE', ''])('does not charge a card fee for %s', mode => {
    expect(isCardPaymentMode(mode)).toBe(false)
  })
})
