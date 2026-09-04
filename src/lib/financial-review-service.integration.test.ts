import { describe, expect, it, beforeEach } from 'vitest'
import { prisma } from '../../netlify/functions/lib/prisma'
import { upsertFinancialReview, resolveFinancialReview, hasOpenFinancialReview } from '../../netlify/functions/lib/financial-review-service'

const reviewMarker = `TEST-REVIEW-SVC-${Date.now()}-`

describe('FinancialReview persistence (disposable database)', () => {
  beforeEach(async () => { await prisma.financialReview.deleteMany({ where: { documentRef: { startsWith: reviewMarker } } }) })
  it('creates one review on replay and preserves creation metadata', async () => {
    const documentRef = `${reviewMarker}1`
    const first = await upsertFinancialReview({ documentType: 'INVOICE', documentRef, reasonCode: 'MISSING_GRAND_TOTAL', sourceType: 'test', sourceRecord: 'a', metadata: { first: true } })
    await new Promise(r => setTimeout(r, 2))
    const second = await upsertFinancialReview({ documentType: 'INVOICE', documentRef, reasonCode: 'MISSING_GRAND_TOTAL', sourceType: 'replay', sourceRecord: 'b', metadata: { second: true } })
    expect(second.id).toBe(first.id)
    expect(second.createdAt).toEqual(first.createdAt)
    expect(second.sourceType).toBe('replay')
  })
  it('resolves explicitly and allows different reasons to coexist', async () => {
    const documentRef = `${reviewMarker}2`
    await upsertFinancialReview({ documentType: 'INVOICE', documentRef, reasonCode: 'MISSING_GRAND_TOTAL' })
    await upsertFinancialReview({ documentType: 'INVOICE', documentRef, reasonCode: 'NON_GIFT_NONPOSITIVE_PROFIT' })
    await resolveFinancialReview({ documentType: 'INVOICE', documentRef, reasonCode: 'MISSING_GRAND_TOTAL', resolverId: 'system', resolutionNotes: 'corrected' })
    const rows = await prisma.financialReview.findMany({ where: { documentRef } })
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.reasonCode === 'MISSING_GRAND_TOTAL')?.status).toBe('RESOLVED')
    expect(rows.find(r => r.reasonCode === 'NON_GIFT_NONPOSITIVE_PROFIT')?.status).toBe('OPEN')
  })
  it('reports only open reviews and supports a transaction client', async () => {
    const documentRef = `${reviewMarker}OPEN`
    expect(await hasOpenFinancialReview('INVOICE', documentRef)).toBe(false)
    await upsertFinancialReview({ documentType: 'INVOICE', documentRef, reasonCode: 'MISSING_GRAND_TOTAL' })
    expect(await hasOpenFinancialReview('INVOICE', documentRef)).toBe(true)
    await resolveFinancialReview({ documentType: 'INVOICE', documentRef, reasonCode: 'MISSING_GRAND_TOTAL' })
    expect(await hasOpenFinancialReview('INVOICE', documentRef)).toBe(false)
    await prisma.$transaction(async (tx) => {
      const transactionRef = `${reviewMarker}TX`
      await upsertFinancialReview({ documentType: 'INVOICE', documentRef: transactionRef, reasonCode: 'MISSING_GRAND_TOTAL', db: tx })
      expect(await hasOpenFinancialReview('INVOICE', transactionRef, tx)).toBe(true)
    })
  })
})
