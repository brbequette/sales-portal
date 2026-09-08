import { describe, expect, it } from 'vitest'
import { buildPaymentPersistencePlan } from './sync-engine'

describe('payment persistence plan', () => {
  it('builds idempotent payment upserts and summary', () => {
    const plan = buildPaymentPersistencePlan([
      { payment_id: 'p1', invoice_id: 'z1', amount: 10, date: '2026-01-02' },
      { payment_id: 'p2', invoice_id: 'z1', amount: 15, date: '2026-01-03' },
    ], 'local-1')
    expect(plan.payments.map((p) => p.sourcePaymentId)).toEqual(['p1', 'p2'])
    expect(plan.summary.paymentMade).toBe(25)
    expect(plan.summary.paymentCount).toBe(2)
    expect(plan.summary.lastPaymentDate?.toISOString()).toContain('2026-01-03')
    expect(plan.payments[0].create).toMatchObject({ zohoId: 'p1', invoiceId: 'z1' })
    expect('invoiceDbId' in plan.payments[0].create).toBe(false)
    expect('invoice' in plan.payments[0].create).toBe(false)
  })

  it('returns an empty plan for invoices with no payments', () => {
    const plan = buildPaymentPersistencePlan([], 'local-1')
    expect(plan.payments).toEqual([])
    expect(plan.summary).toMatchObject({ paymentMade: 0, paymentCount: 0, lastPaymentDate: null })
  })
})
