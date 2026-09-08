import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '../..')
const handlerPath = path.join(repoRoot, 'netlify/functions/process-invoice-costs.ts')
const handler = fs.readFileSync(handlerPath, 'utf8')
const bulk = fs.readFileSync(path.join(repoRoot, 'netlify/functions/bulk-process-costs.ts'), 'utf8')
const daily = fs.readFileSync(path.join(repoRoot, 'netlify/functions/daily-books-sync.ts'), 'utf8')
const webhook = fs.readFileSync(path.join(repoRoot, 'netlify/functions/zoho-books-webhook.ts'), 'utf8')

describe('process-invoice-costs atomic handler routing', () => {
  it('routes the existing-invoice path through one existing-mode plan and applier', () => {
    expect(handler).toContain('mode: "existing"')
    expect(handler.match(/applyInvoicePersistencePlan\(plan\)/g)?.length).toBe(2)
    expect(handler).toContain('fetchInvoicePaymentsFromZoho')
  })

  it('routes the auto-created path through one create-mode plan', () => {
    expect(handler).toContain('mode: "create"')
    expect(handler).toContain('const createData: Prisma.InvoiceCreateInput')
    expect(handler).toContain('account: { connect: { id: account.id } }')
  })

  it('does not retain legacy persistence calls or a preliminary invoice upsert', () => {
    expect(handler).not.toContain('syncInvoicePayments(')
    expect(handler).not.toContain('updateInvoiceRecord(')
    expect(handler).not.toContain('prisma.invoice.upsert(')
    expect(handler).not.toContain('upsertFinancialReview(')
    expect(handler).not.toContain('resolveFinancialReview(')
  })

  it('includes payment, line-item and review actions in the plan', () => {
    expect(handler).toContain('payments: { ...paymentPlan, summary: paymentSummary }')
    expect(handler).toContain('lineItems: invoice.line_items')
    expect(handler).toContain('reviewUpserts')
    expect(handler).toContain('reviewResolutions')
  })

  it('preserves the approved review reason construction', () => {
    expect(handler).toContain("reasonCode: 'MISSING_GRAND_TOTAL'")
    expect(handler).toContain("reasonCode: 'NON_GIFT_NONPOSITIVE_PROFIT'")
    expect(handler).toContain('requiresManagerReview(profit')
    expect(handler).toContain('reviewResolutions')
  })

  it('keeps external failure before the applier', () => {
    expect(handler.indexOf('fetchInvoicePaymentsFromZoho')).toBeLessThan(handler.indexOf('applyInvoicePersistencePlan'))
    expect(handler.indexOf('calculateDocumentCosts')).toBeLessThan(handler.indexOf('applyInvoicePersistencePlan'))
  })

  it('retains the existing success and error response contract', () => {
    expect(handler).toContain('statusCode: 200')
    expect(handler).toContain('success: true')
    expect(handler).toContain('statusCode: 500')
    expect(handler).toContain('success: false')
  })

  it('records the bulk path explicitly for convergence review', () => {
    expect(bulk).toContain('bulk-process-costs')
    expect(bulk).not.toContain('applyInvoicePersistencePlan')
  })

  it('daily sync converges through the shared process handler or bulk path', () => {
    expect(daily).toMatch(/processInvoiceCostsForSystem|bulk-process-costs|process-invoice-costs/)
  })

  it('webhook processing converges through the shared process handler', () => {
    expect(webhook).toMatch(/processInvoiceCostsForSystem|process-invoice-costs|bulk-process-costs/)
  })

  it('does not duplicate atomic persistence in the routed handler', () => {
    expect(handler.match(/applyInvoicePersistencePlan\(plan\)/g)?.length).toBe(2)
    expect(handler).not.toContain('prisma.payment.')
    expect(handler).not.toContain('prisma.financialReview.')
  })
})
