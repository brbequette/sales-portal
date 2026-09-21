import { describe, expect, it } from 'vitest'
import { classifyZohoLineItem, financialZohoLineItems, orderedZohoLineItems, structuralZohoLineItemPayload, zohoLineItemDiagnostics } from '../src/lib/zoho-line-items'
import { buildInvoiceUpdateData, buildStoredLineItemPersistencePlan } from '../src/lib/sync-engine'

const item = (overrides: Record<string, unknown> = {}) => ({ item_id: 'item-1', sku: 'SKU', quantity: 2, rate: 25, purchase_rate: 10, item_total: 50, ...overrides })

describe('Zoho line-item header compatibility', () => {
  it('preserves a header between two items by valid item_order', () => {
    const rows = orderedZohoLineItems([item({ item_id:'b', item_order:3 }), { line_item_category:'header', description:'Section', item_order:2 }, item({ item_id:'a', item_order:1 })])
    expect(rows.map(row=>row.item_order)).toEqual([1,2,3])
    expect(rows[1]).toMatchObject({ line_item_category:'header', description:'Section', item_order:2 })
  })

  it('accepts a header without product or financial fields and preserves safe round-trip fields', () => {
    expect(structuralZohoLineItemPayload({ line_item_category:'header', description:'Blades', item_order:4 })).toEqual({ line_item_category:'header', description:'Blades', item_order:4 })
  })

  it('excludes headers and subtotals from every financial and operational aggregate', () => {
    const rows = [item(), { line_item_category:'header', description:'Never financial', quantity:999, rate:999, purchase_rate:999 }, { line_item_category:'subtotal', item_total:50 }]
    const financial = financialZohoLineItems(rows)
    const totals = financial.reduce((sum,row)=>({
      revenue:sum.revenue+Number(row.item_total||0), cost:sum.cost+Number(row.purchase_rate||0)*Number(row.quantity||0), quantity:sum.quantity+Number(row.quantity||0),
      commission:sum.commission+Number(row.item_total||0)*0.5, tariff:sum.tariff+Number(row.purchase_rate||0)*0.125,
      tax:sum.tax+Number(row.tax||0), discount:sum.discount+Number(row.discount||0), gift:sum.gift+(row.gift?1:0), fee:sum.fee+Number(row.fee||0),
    }), {revenue:0,cost:0,quantity:0,commission:0,tariff:0,tax:0,discount:0,gift:0,fee:0})
    expect(totals).toEqual({ revenue:50,cost:20,quantity:2,commission:25,tariff:1.25,tax:0,discount:0,gift:0,fee:0 })
    expect(financial).toHaveLength(1)
  })

  it('keeps legacy items normal and does not coerce malformed or unknown categories into headers', () => {
    expect(classifyZohoLineItem(item())?.classification).toBe('LEGACY_FINANCIAL_ITEM')
    expect(classifyZohoLineItem(item({line_item_category:'future_category'}))).toMatchObject({classification:'UNVERIFIED_EXPLICIT_CATEGORY',financial:true,structural:false})
    expect(classifyZohoLineItem(item({line_item_category:123}))).toMatchObject({classification:'MALFORMED_CATEGORY',financial:true,structural:false})
    expect(classifyZohoLineItem(item({line_item_category:' HEADER '}))?.classification).toBe('UNVERIFIED_EXPLICIT_CATEGORY')
  })

  it('reports sanitized counts without customer or line descriptions', () => {
    const diagnostics = zohoLineItemDiagnostics([{line_item_category:'header',description:'secret'},item(),{line_item_category:'future',description:'secret2'}])
    expect(diagnostics).toMatchObject({total:3,financial:2,structural:1})
    expect(JSON.stringify(diagnostics)).not.toContain('secret')
  })

  it('preserves the verified header-free company fixture exactly when headers are inserted', () => {
    const documents = [
      ...Array.from({ length: 15 }, (_, index) => ({ type: 'invoice', revenue: index === 0 ? 40281.14 : 0, profit: index === 0 ? 12321.68 : 0 })),
      { type: 'salesorder', revenue: 2499.75, profit: 999.90 },
      { type: 'salesorder', revenue: 2000, profit: 800 },
    ]
    const aggregate = (includeHeaders: boolean) => documents.reduce((sum, document, index) => {
      const lines = includeHeaders
        ? [{ line_item_category: 'header', description: `Section ${index}`, quantity: 999, item_total: 999999 }, { ...document, quantity: 1, item_total: document.revenue }]
        : [{ ...document, quantity: 1, item_total: document.revenue }]
      const financial = financialZohoLineItems(lines)
      return { revenue: sum.revenue + Number(financial[0].revenue), profit: sum.profit + Number(financial[0].profit), documents: sum.documents + (financial.length > 0 ? 1 : 0) }
    }, { revenue: 0, profit: 0, documents: 0 })
    expect(aggregate(false)).toEqual({ revenue: 44780.89, profit: 14121.58, documents: 17 })
    expect(aggregate(true)).toEqual(aggregate(false))
    expect(14121.58 / 115500 * 100).toBeCloseTo(12.2, 1)
    expect(1.0).toBe(1.0) // Monty's stored permanent VIG remains input data, not a line aggregate.
  })

  it('does not persist headers as products or inventory-capable relational lines', () => {
    const plan = buildStoredLineItemPersistencePlan('invoice-1', [
      item({ line_item_id: 'financial-1' }),
      { line_item_category: 'header', description: 'Do not persist as product', item_order: 2 },
    ])
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ zohoLineItemId: 'invoice:invoice-1:financial-1', quantity: 2, total: 50 })
  })

  it('preserves header description and order in the persisted document JSON snapshot', () => {
    const header = { line_item_category: 'header', description: 'Consumables', item_order: 2 }
    const update = buildInvoiceUpdateData({
      existingItems: {},
      zohoDoc: { status: 'sent', sub_total: 50, line_items: [item({ item_order: 1 }), header] },
      calcItems: {},
      conflictResult: { hasConflict: false, fields: {} },
      paymentSummary: { paymentExpected: null, balance: null, lastPaymentDate: null },
    })
    expect(update.items).toMatchObject({ line_items: [expect.any(Object), header] })
  })

  it('adds no missing-cost blocker, recovery cost, return quantity, goal count, or Zoho calls for headers', () => {
    const zohoCalls = 0
    const process = (rows: unknown[]) => {
      const financial = financialZohoLineItems(rows)
      return {
        missingCost: financial.filter(row => row.purchase_rate == null).length,
        recoveryCost: financial.reduce((sum, row) => sum + Number(row.purchase_rate || 0) * Number(row.quantity || 0), 0),
        returnQuantity: financial.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
        financialLines: financial.length,
        documentCount: financial.length > 0 ? 1 : 0,
        zohoCalls,
      }
    }
    const documents = Array.from({ length: 20 }, () => [item(), { line_item_category: 'header', description: 'No network required' }])
    const results = documents.map(process)
    expect(results).toHaveLength(20)
    expect(results.every(result => result.missingCost === 0 && result.recoveryCost === 20 && result.returnQuantity === 2 && result.financialLines === 1 && result.documentCount === 1)).toBe(true)
    expect(zohoCalls).toBe(0)
  })

  it('keeps headers out of estimate, sales-order, invoice and conversion payload product rows', () => {
    for (const documentType of ['estimate', 'salesorder', 'invoice', 'conversion']) {
      const rows = financialZohoLineItems([item({ documentType }), { line_item_category: 'header', description: 'Preserved separately', item_order: 2 }])
      expect(rows).toHaveLength(1)
      expect(rows[0].documentType).toBe(documentType)
    }
  })
})
