import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { buildCompleteInvoicePersistencePlan, buildStoredLineItemPersistencePlan, mergeInvoiceJson, type PaymentPersistencePlan } from './sync-engine'

describe('invoice persistence plan builders', () => {
  it('merges incoming JSON without mutating the source', () => {
    const source = { total: 10, nested: { keep: true } }
    const merged = mergeInvoiceJson({ existing: true, total: 1 }, { patch: source, preserveUndefined: true, preserveNull: true })
    expect(merged).toEqual({ existing: true, total: 10, nested: { keep: true } })
    expect(source).toEqual({ total: 10, nested: { keep: true } })
  })
  it('preserves explicit null and skips undefined patch values', () => {
    expect(mergeInvoiceJson({ keep: true }, { patch: { nullable: null, absent: undefined }, preserveUndefined: true, preserveNull: true })).toEqual({ keep: true, nullable: null })
  })
  it('builds deterministic replacement line-item inputs', () => {
    const plan = buildStoredLineItemPersistencePlan('invoice-1', [{ line_item_id: 'line-1', name: 'Blade', quantity: 2, rate: 5, item_total: 10 }])
    expect(plan.replace).toBe(true)
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ invoiceId: 'invoice-1', zohoLineItemId: 'invoice:invoice-1:line-1', quantity: 2, unitPrice: 5, total: 10 })
  })

  const payments: PaymentPersistencePlan = {
    payments: [],
    summary: { paymentMade: 0, paymentExpected: null, lastPaymentDate: null, balance: null, paymentCount: 0 },
  }

  const updateData: Prisma.InvoiceUpdateInput = {
    status: 'paid',
    amount: 125,
    paymentMade: 125,
    paymentExpected: 125,
    balance: 0,
    computedProfit: 40,
    computedVigRate: 1.3,
    items: { legacy: true, nullable: null },
  }

  const createData: Prisma.InvoiceCreateInput = {
    zohoId: 'zoho-builder-1',
    account: { connect: { id: 'account-builder-1' } },
    status: 'paid',
    amount: 125,
    issueDate: new Date('2026-01-01T00:00:00.000Z'),
    dueDate: null,
    items: { legacy: true, nullable: null },
  }

  it.each([
    ['existing invoice', {
      mode: 'existing' as const,
      localInvoiceId: 'local-builder-1',
      zohoId: 'zoho-builder-1',
      updateData,
      lineItems: [{ name: 'Blade' }],
      payments,
      reviewUpserts: [{ documentType: 'invoice', documentRef: 'zoho-builder-1', reasonCode: 'MISSING_GRAND_TOTAL' }],
      reviewResolutions: [],
    }],
    ['auto-created invoice', {
      mode: 'create' as const,
      zohoId: 'zoho-builder-1',
      createData,
      updateData,
      lineItems: [{ name: 'Blade' }],
      payments,
      reviewUpserts: [],
      reviewResolutions: [{ documentType: 'invoice', documentRef: 'zoho-builder-1', reasonCode: 'MISSING_GRAND_TOTAL' }],
    }],
  ])('preserves complete %s mapping without mutation', (_name, input) => {
    const before = structuredClone(input)
    const plan = buildCompleteInvoicePersistencePlan(input)
    expect(input).toEqual(before)
    expect(plan.mode).toBe(input.mode === 'existing' ? 'update-existing' : 'create-or-update')
    expect(plan.identity.zohoId).toBe(input.zohoId)
    expect(plan.updateData).toEqual(updateData)
    expect(plan.lineItems).toBe(input.lineItems)
    expect(plan.payments).toBe(payments)
    expect(plan.reviewUpserts).toBe(input.reviewUpserts)
    expect(plan.reviewResolutions).toBe(input.reviewResolutions)
    if (input.mode === 'create') expect('createData' in plan && plan.createData).toEqual(createData)
    else expect('createData' in plan).toBe(false)
  })

  it('represents zero, false, null and omitted values exactly', () => {
    const plan = buildCompleteInvoicePersistencePlan({
      mode: 'existing', localInvoiceId: 'local-builder-2', zohoId: 'zoho-builder-2',
      updateData: { amount: 0, paymentMade: 0, pendingZohoFetch: false, dueDate: null, items: undefined },
      lineItems: [], payments, reviewUpserts: [], reviewResolutions: [],
    })
    expect(plan.updateData).toEqual({ amount: 0, paymentMade: 0, pendingZohoFetch: false, dueDate: null, items: undefined })
  })

  it('covers every legacy invoice field represented by the builder inputs', () => {
    const legacyFields = ['status', 'amount', 'paymentMade', 'paymentExpected', 'balance', 'computedProfit', 'computedVigRate', 'items'] as const
    for (const field of legacyFields) expect(field in updateData).toBe(true)
    expect(Object.keys(updateData).sort()).toEqual([...legacyFields].sort())
  })
})
