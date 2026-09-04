import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildPaymentPersistencePlan } from './sync-engine'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

describe('current persistence call graph characterization', () => {
  it('existing and auto-created invoice paths call payment sync before invoice update', () => {
    const source = read('netlify/functions/process-invoice-costs.ts')
    expect(source).toContain('syncInvoicePayments(booksInvoiceId, localInvoice.id)')
    expect(source).toContain('syncInvoicePayments(booksInvoiceId, newInvoice.id)')
    expect(source).toContain('await updateInvoiceRecord({')
    expect(source.indexOf('syncInvoicePayments(booksInvoiceId, localInvoice.id)')).toBeLessThan(source.indexOf('await updateInvoiceRecord({'))
  })

  it('syncInvoicePayments uses payment upsert keyed by Zoho payment id', () => {
    const plan = buildPaymentPersistencePlan([{ payment_id: 'p-1', amount: 4, date: '2026-01-01' }], 'inv-1')
    expect(plan.payments[0].sourcePaymentId).toBe('p-1')
    expect(plan.payments[0].create.zohoId).toBe('p-1')
  })

  it('updateInvoiceRecord maps calculated and payment summary fields', () => {
    const source = read('src/lib/sync-engine.ts')
    for (const field of ['computedProfit:', 'computedDeadCost:', 'computedVigRate:', 'paymentMade:', 'paymentExpected:', 'lastPaymentDate:', 'balance:', 'items:']) {
      expect(source).toContain(field)
    }
    expect(source).toContain('computedProfit:')
  })

  it('bulk, daily and webhook source paths reference shared invoice processing', () => {
    const bulk = read('netlify/functions/bulk-process-costs.ts')
    const daily = read('netlify/functions/daily-books-sync.ts')
    const webhook = read('netlify/functions/zoho-books-webhook.ts')
    expect(bulk).toMatch(/process-invoice-costs|calculateDocumentCosts/)
    expect(daily).toMatch(/process-invoice-costs|calculateDocumentCosts/)
    expect(webhook).toContain('processInvoiceCosts')
  })
  it('production files do not import the test-only applier wrapper', () => {
    const defining = read('src/lib/sync-engine.ts')
    expect(defining).toContain('__testOnlyApplyInvoicePersistencePlan')
    expect(defining).toContain("process.env.NODE_ENV !== 'test'")
    expect(defining).toMatch(/applyInvoicePersistencePlan\(plan: InvoicePersistencePlan, db: typeof prisma = prisma\)/)
    const consumers = ['netlify/functions/process-invoice-costs.ts', 'netlify/functions/bulk-process-costs.ts', 'netlify/functions/daily-books-sync.ts', 'netlify/functions/zoho-books-webhook.ts']
    for (const file of consumers) expect(read(file)).not.toContain('__testOnlyApplyInvoicePersistencePlan')
  })
})
