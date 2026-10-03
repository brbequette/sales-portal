import { describe, expect, it } from 'vitest'
import { evaluatePOReference, parseDocumentReference, purchaseOrderReferences } from './po-document-reference'
import { computePOMatchScore, rankPOMatches } from '../app/api/admin/orphans/suggest-matches/match-score'
const po = { poNumber: '9089', referenceNumber: 'INV 10870', shipToName: 'Steven Dubner Landscaping', date: '2026-07-02', total: 1561, items: { line_items: [{ sku: 'SMX10VTR4508C', quantity: 2 }] } }
const doc = { id: 'correct', invoiceNumber: '10870', account: { name: 'Steven Dubner Landscaping' }, issueDate: '2026-07-02', amount: 2500, items: { line_items: [{ sku: 'SMX10VTR4508C', quantity: 2 }] } }
describe('PO document-reference precedence', () => {
  it.each(['INV 10870', 'Invoice #10870', 'INV-10870', '10870', '  inv #10870  '])('normalizes %s exactly', referenceNumber => {
    expect(computePOMatchScore({ ...po, referenceNumber }, doc)).toMatchObject({ referenceStatus: 'exact', autoWriteEligible: false })
  })
  it('PO 9089 prefers 10870 and rejects the previously winning 10984', () => {
    const wrong = { ...doc, id: 'wrong', invoiceNumber: '10984' }
    expect(computePOMatchScore(po, wrong).score).toBe(0)
    expect(rankPOMatches(po, [wrong, doc]).map(r => r.doc.invoiceNumber)).toEqual(['10870'])
  })
  it('holds the live PO 9089 quantity conflict: 50 ordered versus 30 invoiced', () => {
    const actualPO = { ...po, items: { line_items: [{ sku: 'IF30PVR1412E', quantity: 50 }, { sku: 'SMX10VTR4508C', quantity: 50 }] } }
    const actualInvoice = { ...doc, items: { line_items: [{ sku: 'IF30PVR1412E', quantity: 50 }, { sku: 'SMX10VTR4508C', quantity: 30 }] } }
    expect(computePOMatchScore(actualPO, actualInvoice)).toMatchObject({ score: 0, referenceStatus: 'conflict', requiresReview: true })
    expect(rankPOMatches(actualPO, [actualInvoice, { ...actualInvoice, invoiceNumber: '10984' }])).toHaveLength(0)
  })
  it('does not reuse invoice quantities across repeated PO lines', () => {
    expect(computePOMatchScore({ ...po, items: { line_items: [{ sku: 'SMX10VTR4508C', quantity: 2 }, { sku: 'SMX10VTR4508C', quantity: 2 }] } }, doc).score).toBe(0)
  })
  it('accepts quantities split across invoice lines', () => {
    expect(computePOMatchScore(po, { ...doc, items: { line_items: [{ sku: 'SMX10VTR4508C', quantity: 1 }, { sku: 'SMX10VTR4508C', quantity: 1 }] } }).referenceStatus).toBe('exact')
  })
  it.each(['110870', '108700', '0010870'])('rejects numeric substring/zero collisions %s', invoiceNumber => {
    expect(computePOMatchScore(po, { ...doc, invoiceNumber }).score).toBe(0)
  })
  it('keeps document namespaces distinct', () => {
    expect(evaluatePOReference(po, { items: { salesorder_number: '10870' } }).conflict).toBe(true)
    expect(evaluatePOReference({ referenceNumber: 'SO 10870' }, { items: { salesorder_number: 'SO-10870' } }).exact).toBe(true)
    expect(evaluatePOReference({ referenceNumber: 'EST 10870' }, { items: { estimate_number: 'EST-10870' } }).exact).toBe(true)
  })
  it('allows invoice lineage to satisfy an explicit SO reference', () => {
    expect(evaluatePOReference({ salesOrderNumber: 'SO 42' }, { ...doc, salesorderNumber: 'SO-42' }).exact).toBe(true)
  })
  it.each(['INV 10870 / 10984', '10870,10984', 'INV 10870 dated 2026-07-02'])('holds ambiguous references %s', referenceNumber => {
    expect(rankPOMatches({ ...po, referenceNumber }, [doc])).toHaveLength(0)
  })
  it('does not discard alphanumeric identity', () => {
    expect(parseDocumentReference('INV-AB12')).toEqual({ kind: 'invoice', number: 'AB12' })
    expect(evaluatePOReference({ referenceNumber: 'INV-AB12' }, { invoiceNumber: 'CD12' }).conflict).toBe(true)
  })
  it('holds contradicting persisted and raw references', () => {
    expect(computePOMatchScore({ ...po, items: { ...po.items, reference_number: 'INV 10984' } }, doc).score).toBe(0)
  })
  it('does not infer invoice numbers from arbitrary packing-slip filenames', () => {
    expect(purchaseOrderReferences({ items: { attachment_name: 'packing_slip_10870.pdf' } }).refs).toHaveLength(0)
    expect(purchaseOrderReferences({ items: { attachment_name: 'invoice_10870.pdf' } }).refs).toHaveLength(1)
  })
  it('structured references take priority over filenames', () => {
    expect(evaluatePOReference({ ...po, items: { attachment_name: 'invoice_10984.pdf' } }, doc).exact).toBe(true)
  })
  it.each([
    { ...doc, account: { name: 'Unrelated Customer' } },
    { ...doc, issueDate: '2025-01-01' },
    { ...doc, items: { line_items: [{ sku: 'OTHER', quantity: 2 }] } },
    { ...doc, items: { line_items: [{ sku: 'SMX10VTR4508C', quantity: 1 }] } },
  ])('holds an exact reference with conflicting corroboration', conflict => {
    expect(computePOMatchScore(po, conflict)).toMatchObject({ score: 0, requiresReview: true, referenceStatus: 'conflict' })
    expect(rankPOMatches(po, [conflict, { ...doc, invoiceNumber: '10984' }])).toHaveLength(0)
  })
  it('blocks conflicting provider customer IDs despite matching names', () => {
    expect(computePOMatchScore({ ...po, items: { ...po.items, delivery_customer_id: 'a' } }, { ...doc, items: { ...doc.items, customer_id: 'b' } }).score).toBe(0)
  })
  it('keeps high-scoring fuzzy suggestions review-only', () => {
    const result = computePOMatchScore({ ...po, referenceNumber: null }, doc)
    expect(result.score).toBeGreaterThanOrEqual(85)
    expect(result).toMatchObject({ referenceStatus: 'fuzzy', requiresReview: true, autoWriteEligible: false })
  })
  it('retains duplicate exact matches for ambiguity review', () => {
    expect(rankPOMatches(po, [doc, { ...doc, id: 'duplicate' }])).toHaveLength(2)
  })
  it('requires exact reverse PO references, not substrings', () => {
    expect(evaluatePOReference({ poNumber: '9089' }, { items: { customer_po: 'PO-9089' } }).exact).toBe(true)
    expect(evaluatePOReference({ poNumber: '9089' }, { items: { customer_po: '19089' } }).exact).toBe(false)
  })
})
