import { describe, expect, it } from 'vitest'
import { buildSalesOrderFromQuotePayload, sanitizedProviderFailure } from './zoho-document-conversion'

describe('quote to sales-order payload', () => {
  it('uses the documented estimate_id field and preserves ordered structural rows', () => {
    const payload = buildSalesOrderFromQuotePayload({
      estimate_id: 'estimate-1',
      customer_id: 'customer-1',
      salesperson_id: 'salesperson-1',
      billing_address: { address: '160 S. Pullen Blvd' },
      line_items: [
        { item_id: 'b', quantity: 1, rate: 0, item_order: 3 },
        { line_item_category: 'header', description: 'Bundle', item_order: 2 },
        { item_id: 'a', quantity: 1, rate: 0.91, item_order: 1 },
      ],
      custom_fields: [{ label: 'Quote only field', value: 'not copied' }],
    })

    expect(payload).toMatchObject({
      estimate_id: 'estimate-1',
      customer_id: 'customer-1',
      salesperson_id: 'salesperson-1',
      billing_address: { address: '160 S. Pullen Blvd' },
    })
    expect(payload).not.toHaveProperty('custom_fields')
    expect(payload.line_items).toEqual([
      { item_id: 'a', quantity: 1, rate: 0.91, item_order: 1 },
      { line_item_category: 'header', description: 'Bundle', item_order: 2 },
      { item_id: 'b', quantity: 1, rate: 0, item_order: 3 },
    ])
  })

  it('fails closed when the source lacks required conversion evidence', () => {
    expect(() => buildSalesOrderFromQuotePayload({ customer_id: 'customer-1', line_items: [] }))
      .toThrow('estimate ID')
  })

  it('preserves the provider code and message', () => {
    expect(sanitizedProviderFailure(422, { code: 1001, message: 'Invalid line item' })).toEqual({
      code: '1001',
      message: 'Invalid line item',
    })
  })
})
