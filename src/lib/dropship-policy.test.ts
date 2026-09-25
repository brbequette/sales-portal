import { describe, expect, it } from 'vitest'
import { isPioneerCalifornia, validateDirectDropshipEvidence } from './dropship-policy'

describe('direct dropship business policy', () => {
  it('blocks Pioneer direct shipment to a California destination', () => {
    expect(isPioneerCalifornia('Pioneer Supply', 'CA')).toBe(true)
    expect(isPioneerCalifornia('Pioneer Supply', 'California')).toBe(true)
    expect(isPioneerCalifornia('Pioneer Supply', 'IL')).toBe(false)
    expect(isPioneerCalifornia('CONTINENTAL ABRASIVES', 'CA')).toBe(false)
  })

  it('requires exact vendor, audited eligibility, and authoritative positive cost', () => {
    const base = { sku: 'RFD-50A060', vendor: 'v1', canDropship: true, costQuality: 'AUTHORITATIVE', unitCost: .36 }
    expect(validateDirectDropshipEvidence(base, 'v1')).toEqual({ allowed: true, unitCost: .36 })
    expect(validateDirectDropshipEvidence({ ...base, vendor: 'v2' }, 'v1').allowed).toBe(false)
    expect(validateDirectDropshipEvidence({ ...base, canDropship: null }, 'v1').allowed).toBe(false)
    expect(validateDirectDropshipEvidence({ ...base, costQuality: 'UNKNOWN' }, 'v1').allowed).toBe(false)
    expect(validateDirectDropshipEvidence({ ...base, unitCost: 0 }, 'v1').allowed).toBe(false)
  })
})
