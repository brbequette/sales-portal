import { describe, expect, it } from 'vitest'
import { normalizeReviewMetadata } from '../../netlify/functions/lib/financial-review-service'
import { Prisma } from '@prisma/client'

describe('financial review metadata', () => {
  it('accepts nested JSON', () => expect(normalizeReviewMetadata({ a: [1, true, { b: 'ok' }] })).toEqual({ a: [1, true, { b: 'ok' }] }))
  it('preserves omission', () => expect(normalizeReviewMetadata(undefined)).toBeUndefined())
  it('supports explicit JSON null', () => expect(normalizeReviewMetadata(null)).toBe(Prisma.JsonNull))
  it('keeps null nested in objects as JSON null', () => expect(normalizeReviewMetadata({ nested: null })).toEqual({ nested: null }))
  it('keeps null nested in arrays as JSON null', () => expect(normalizeReviewMetadata([null, { nested: null }])).toEqual([null, { nested: null }]))
  it('rejects unsupported values', () => {
    expect(() => normalizeReviewMetadata({ bad: BigInt(1) })).toThrow()
    expect(() => normalizeReviewMetadata({ bad: Number.NaN })).toThrow()
  })
})
