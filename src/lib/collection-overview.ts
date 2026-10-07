// Explicit document references only: never associate orders by name, amount or date.
export function documentReferences(doc: any, kind: 'salesorder' | 'estimate') {
  const items = doc?.items || {}
  const sources = [doc || {}, items, items._zohoRaw || {}, doc?.rawData || {}]
  const keys = kind === 'salesorder'
    ? ['salesOrderZohoId', 'booksSalesOrderId', 'salesOrderId', 'salesorder_id', 'salesorderNumber', 'salesOrderNumber', 'salesorder_number']
    : ['estimateZohoId', 'booksEstimateId', 'estimateId', 'estimate_id', 'quoteId', 'estimateNumber', 'estimate_number']
  return [...new Set(sources.flatMap(s => [
    ...keys.map(k => s[k]),
    ...(Array.isArray(s[kind + 's']) ? s[kind + 's'].flatMap((d: any) => [d[kind + '_id'], d[kind + '_number']]) : []),
    ...(Array.isArray(s[kind + '_ids']) ? s[kind + '_ids'] : []),
  ]).filter((v): v is string => typeof v === 'string' && !!v.trim()))]
}

export function overviewDocument(doc: any, type: string) {
  const items = doc.items || {}, raw = items._zohoRaw || doc.rawData || {}
  const stored = Array.isArray(items) ? items : items.line_items?.length ? items.line_items : raw.line_items?.length ? raw.line_items : doc.lineItems || []
  return {
    id: doc.id, type, number: doc.invoiceNumber || doc.computedInvoiceNumber || items.invoiceNumber || items.invoice_number || items.salesOrderNumber || items.salesorder_number || items.estimateNumber || items.estimate_number || raw.invoice_number || raw.salesorder_number || raw.estimate_number || doc.zohoId,
    status: doc.status, date: doc.issueDate || doc.orderDate || raw.date || doc.createdAt,
    dueDate: doc.dueDate, total: doc.amount, balance: doc.balance ?? items.balance ?? null,
    shippingCharge: items.shippingCharge ?? raw.shipping_charge ?? null,
    actualShippingCost: doc.actualShippingCost ?? null,
    totalItemCost: doc.computedDeadCost ?? items.deadCostTotal ?? null,
    salesperson: doc.computedSalesperson || items.salesperson || raw.salesperson_name || null,
    customerReference: raw.reference_number || null,
    terms: raw.terms || null, notes: raw.notes || null,
    billingAddress: raw.billing_address || null, shippingAddress: raw.shipping_address || null,
    updatedAt: doc.updatedAt,
    lines: stored.map((l: any) => ({
      name: l.name || l.productName || l.description || 'Unnamed item', sku: l.sku || '',
      description: l.description || '', quantity: l.quantity ?? null,
      unitPrice: l.rate ?? l.unitPrice ?? l.price ?? null,
      total: l.item_total ?? l.total ?? null,
      unitCost: l.unitCost ?? l.cost_price ?? l.purchase_rate ?? l.cost ?? null,
      discount: l.discount ?? null, tax: l.tax_percentage ?? l.taxPercent ?? null,
    })),
  }
}
export type OverviewDocument = ReturnType<typeof overviewDocument>

// Group identical entire line sets across documents. Preserve repeated lines within a document.
export function groupDocumentLines(documents: OverviewDocument[]) {
  const groups: { documents: OverviewDocument[]; lines: OverviewDocument['lines'] }[] = []
  const keys = new Map<string, number>()
  for (const doc of documents) {
    if (!doc.lines.length) continue
    const key = JSON.stringify(doc.lines.map((line: any) => JSON.stringify(line)).sort())
    const index = keys.get(key)
    if (index !== undefined) groups[index].documents.push(doc)
    else { keys.set(key, groups.length); groups.push({ documents: [doc], lines: doc.lines }) }
  }
  return groups
}
