import { describe, expect, it } from 'vitest'
import { documentReferences, groupDocumentLines, overviewDocument } from './collection-overview'

const line = { name: 'Blade', sku: 'B14', quantity: 2, rate: 50, item_total: 100 }
const doc = (id: string, lines: any[]) => overviewDocument({ id, items: { line_items: lines } }, id)
describe('collections document evidence', () => {
  it('uses explicit references, never a matching customer or amount', () => {
    expect(documentReferences({ accountId: 'same', amount: 100, items: { salesOrderNumber: 'SO-1', _zohoRaw: { salesorders: [{ salesorder_id: 'z1' }] } } }, 'salesorder')).toEqual(['SO-1', 'z1'])
    expect(documentReferences({ accountId: 'same', amount: 100 }, 'salesorder')).toEqual([])
  })
  it('groups identical documents without doubling quantities or losing repeated lines', () => {
    const groups = groupDocumentLines([doc('Invoice', [line, line]), doc('Order', [line, line]), doc('Estimate', [line])])
    expect(groups).toHaveLength(2)
    expect(groups[0].documents).toHaveLength(2)
    expect(groups[0].lines).toHaveLength(2)
    expect(groups[0].lines[0].quantity).toBe(2)
  })
  it('preserves quantity, price, discount, tax and cost differences', () => {
    const documents = [line, { ...line, quantity: 3 }, { ...line, rate: 45 }, { ...line, discount: 10 }, { ...line, tax_percentage: 8 }, { ...line, cost_price: 12 }].map((l, i) => doc(String(i), [l]))
    expect(groupDocumentLines(documents)).toHaveLength(6)
    expect(documents[0].lines[0].unitCost).toBeNull()
  })
})
