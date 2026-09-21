// Zoho line-item payloads differ by document type and API version. Keep this
// dynamic boundary permissive; the classifier below validates every field that
// controls structural behavior instead of pretending the remote schema is fixed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ZohoLineItemRecord = Record<string, any>

export type ZohoLineItemClassification =
  | 'LEGACY_FINANCIAL_ITEM'
  | 'FINANCIAL_LINE_ITEM'
  | 'STRUCTURAL_HEADER'
  | 'STRUCTURAL_SUBTOTAL'
  | 'UNVERIFIED_EXPLICIT_CATEGORY'
  | 'MALFORMED_CATEGORY'

export type ClassifiedZohoLineItem = {
  item: ZohoLineItemRecord
  sourceIndex: number
  classification: ZohoLineItemClassification
  financial: boolean
  structural: boolean
  category: unknown
  description: string | null
  itemOrder: number | null
}

function record(value: unknown): ZohoLineItemRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ZohoLineItemRecord
    : null
}

function validItemOrder(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function classifyZohoLineItem(value: unknown, sourceIndex = 0): ClassifiedZohoLineItem | null {
  const item = record(value)
  if (!item) return null
  const category = item.line_item_category
  let classification: ZohoLineItemClassification
  if (category === undefined || category === null || category === '') classification = 'LEGACY_FINANCIAL_ITEM'
  else if (category === 'line_item') classification = 'FINANCIAL_LINE_ITEM'
  else if (category === 'header') classification = 'STRUCTURAL_HEADER'
  else if (category === 'subtotal') classification = 'STRUCTURAL_SUBTOTAL'
  else if (typeof category === 'string') classification = 'UNVERIFIED_EXPLICIT_CATEGORY'
  else classification = 'MALFORMED_CATEGORY'

  const structural = classification === 'STRUCTURAL_HEADER' || classification === 'STRUCTURAL_SUBTOTAL'
  return {
    item,
    sourceIndex,
    classification,
    financial: !structural,
    structural,
    category,
    description: typeof item.description === 'string' ? item.description : null,
    itemOrder: validItemOrder(item.item_order),
  }
}

export function classifyZohoLineItems(value: unknown): ClassifiedZohoLineItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => classifyZohoLineItem(item, index)).filter((item): item is ClassifiedZohoLineItem => item !== null)
}

export function orderedZohoLineItems(value: unknown): ZohoLineItemRecord[] {
  return classifyZohoLineItems(value)
    .sort((left, right) => {
      if (left.itemOrder !== null && right.itemOrder !== null && left.itemOrder !== right.itemOrder) return left.itemOrder - right.itemOrder
      if (left.itemOrder !== null && right.itemOrder === null) return -1
      if (left.itemOrder === null && right.itemOrder !== null) return 1
      return left.sourceIndex - right.sourceIndex
    })
    .map(entry => entry.item)
}

export function financialZohoLineItems(value: unknown): ZohoLineItemRecord[] {
  return classifyZohoLineItems(value).filter(entry => entry.financial).map(entry => entry.item)
}

export function structuralZohoLineItems(value: unknown): ZohoLineItemRecord[] {
  return classifyZohoLineItems(value).filter(entry => entry.structural).map(entry => entry.item)
}

export function zohoLineItemDiagnostics(value: unknown) {
  const entries = classifyZohoLineItems(value)
  const counts: Record<ZohoLineItemClassification, number> = {
    LEGACY_FINANCIAL_ITEM: 0,
    FINANCIAL_LINE_ITEM: 0,
    STRUCTURAL_HEADER: 0,
    STRUCTURAL_SUBTOTAL: 0,
    UNVERIFIED_EXPLICIT_CATEGORY: 0,
    MALFORMED_CATEGORY: 0,
  }
  for (const entry of entries) counts[entry.classification]++
  return { total: entries.length, financial: entries.filter(entry => entry.financial).length, structural: entries.filter(entry => entry.structural).length, counts }
}

/**
 * Preserve an existing Zoho structural row without inventing product fields.
 * Only use this for modules where the row already came from Zoho and the
 * existing transaction is intentionally round-tripped.
 */
export function structuralZohoLineItemPayload(value: unknown): ZohoLineItemRecord | null {
  const classified = classifyZohoLineItem(value)
  if (!classified?.structural) return null
  const payload: ZohoLineItemRecord = { line_item_category: classified.item.line_item_category }
  if (classified.item.line_item_id !== undefined) payload.line_item_id = classified.item.line_item_id
  if (classified.description !== null) payload.description = classified.description
  if (classified.itemOrder !== null) payload.item_order = classified.itemOrder
  return payload
}
