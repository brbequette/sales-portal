import { describe, expect, it } from 'vitest'
import { booksPaymentStatusFields } from './zoho-payment-status'

describe('Books payment status imports', () => {
  it('keeps an explicit void status instead of treating every payment as received', () => {
    expect(booksPaymentStatusFields({ payment_status: 'void', status: 'received' })).toEqual({ status: 'void' })
  })

  it('accepts either provider field and normalizes exported casing', () => {
    expect(booksPaymentStatusFields({ payment_status: ' Paid ' })).toEqual({ status: 'paid' })
    expect(booksPaymentStatusFields({ payment_status: ' ', status: 'VOID' })).toEqual({ status: 'void' })
  })

  it.each([{}, { payment_status: null }, { payment_status: '' }, { status: ' ' }, { payment_status: false }])(
    'preserves a verified status when a partial provider response omits it: %j',
    payment => {
      const existing = { status: 'void', amount: 1000 }
      expect({ ...existing, ...booksPaymentStatusFields(payment) }).toEqual(existing)
      expect(booksPaymentStatusFields(payment)).not.toHaveProperty('status')
    },
  )
})
