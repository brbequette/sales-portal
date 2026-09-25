import { classifyZohoLineItem, orderedZohoLineItems, structuralZohoLineItemPayload } from './zoho-line-items'

type JsonRecord = Record<string, unknown>

const FINANCIAL_LINE_FIELDS = [
  'item_id',
  'name',
  'description',
  'quantity',
  'rate',
  'discount',
  'discount_amount',
  'tax_id',
  'tax_name',
  'tax_type',
  'tax_percentage',
  'unit',
  'warehouse_id',
  'item_order',
  'line_item_category',
] as const

function copyDefined(source: JsonRecord, fields: readonly string[]) {
  const result: JsonRecord = {}
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null) result[field] = source[field]
  }
  return result
}

export function quoteLineItemsForSalesOrder(value: unknown): JsonRecord[] {
  return orderedZohoLineItems(value).map((line) => {
    const classification = classifyZohoLineItem(line)
    if (classification?.structural) return structuralZohoLineItemPayload(line) as JsonRecord
    return copyDefined(line, FINANCIAL_LINE_FIELDS)
  })
}

export function buildSalesOrderFromQuotePayload(quote: JsonRecord): JsonRecord {
  const customerId = String(quote.customer_id || '').trim()
  const estimateId = String(quote.estimate_id || '').trim()
  const lineItems = quoteLineItemsForSalesOrder(quote.line_items)
  if (!customerId) throw new Error('The source quote does not contain a Books customer ID.')
  if (!estimateId) throw new Error('The source quote does not contain a Books estimate ID.')
  if (lineItems.length === 0) throw new Error('The source quote does not contain any line items.')

  const payload: JsonRecord = {
    customer_id: customerId,
    estimate_id: estimateId,
    line_items: lineItems,
  }
  const documentFields = [
    'salesperson_id',
    'salesperson_name',
    // The create-sales-order API accepts customer address identifiers here.
    // Copying the estimate's expanded address objects makes Zoho coerce the
    // object to a string and reject it with the 100-character address limit.
    'billing_address_id',
    'shipping_address_id',
    'place_of_supply',
    'tax_exemption_id',
    'tax_exemption_code',
    'is_inclusive_tax',
    'discount',
    'discount_type',
    'is_discount_before_tax',
    'shipping_charge',
    'adjustment',
    'delivery_method',
    'notes',
    'terms',
  ] as const
  Object.assign(payload, copyDefined(quote, documentFields))
  return payload
}

export function sanitizedProviderFailure(status: number, body: unknown) {
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body as JsonRecord : {}
  return {
    code: String(record.code ?? `HTTP_${status}`),
    message: String(record.message || record.error || `Zoho Books returned HTTP ${status}.`),
  }
}
