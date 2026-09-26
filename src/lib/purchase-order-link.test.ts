import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ po: {} as any, matches: [] as any[], updates: 0, events: [] as any[] }))
vi.mock('./prisma', () => ({ prisma: { $transaction: async (fn: any) => fn({
  $executeRaw: vi.fn(),
  purchaseOrder: { findUniqueOrThrow: async () => state.po, updateMany: async ({ data }: any) => { state.updates++; Object.assign(state.po, data); return { count: 1 } } },
  salesOrder: { findUniqueOrThrow: async () => ({ id: 'order', accountId: 'account' }), findMany: async () => state.matches },
  operationalEvent: { create: async (event: any) => state.events.push(event) },
}) } }))
import { corroboratePurchaseOrder, linkCorroboratedPurchaseOrder } from './purchase-order-link'
const address = { address: '12 Main Street', street2: 'Suite 2', city: 'Phoenix', state: 'AZ', zip: '85001', country: 'USA' }
const order = () => ({ salesorder_id: '1254360000000000001', salesorder_number: 'SO-42', customer_name: 'Fixture Company', shipping_address: { ...address }, line_items: [{ item_id: 'item-1', sku: 'SKU-1', quantity: 2 }] })
const purchaseOrder = () => ({ purchaseorder_id: '1254360000000000002', reference_number: 'SO-42', delivery_customer_name: 'Fixture Company', delivery_address: { ...address }, line_items: [{ item_id: 'item-1', sku: 'SKU-1', quantity: 2 }] })
const request = () => ({ purchaseOrder: purchaseOrder(), salesOrder: order(), observedAt: new Date().toISOString(), expectedUpdatedAt: state.po.updatedAt })
beforeEach(() => { state.po = { id: 'po', updatedAt: new Date(), referenceNumber: 'SO-42', salesOrderId: null, invoiceId: null, salesOrderNumber: null, salesOrderLinkEvidence: null }; state.matches = [{ id: 'order' }]; state.updates = 0; state.events = [] })
describe('corroborated purchase order links', () => {
  it('links exact unique corroborated records and records provenance without changing financial fields', async () => {
    expect(await linkCorroboratedPurchaseOrder(request())).toEqual({ state: 'LINKED', purchaseOrderId: 'po' })
    expect(state.po.salesOrderId).toBe(order().salesorder_id)
    expect(state.po.salesOrderLinkEvidence).toMatchObject({ source: 'INFERRED', confidence: 'CORROBORATED', matchedItemCount: 1 })
    expect(state.events).toHaveLength(1)
    expect(state.po).not.toHaveProperty('total')
  })
  it('reapplying identical evidence is idempotent', async () => {
    const input = request(); await linkCorroboratedPurchaseOrder(input)
    expect((await linkCorroboratedPurchaseOrder(input)).state).toBe('ALREADY_LINKED')
    expect(state.updates).toBe(1); expect(state.events).toHaveLength(1)
  })
  it('rejects fuzzy company-only matches', () => {
    const po = purchaseOrder(); po.delivery_address.address = '99 Other Road'; po.line_items = []
    expect(() => corroboratePurchaseOrder(po, order())).toThrow('PO_ORDER_CORROBORATION_REQUIRED')
  })
  it('requires quantities and complete addresses', () => {
    const po = purchaseOrder(); po.line_items[0].quantity = 3
    expect(() => corroboratePurchaseOrder(po, order())).toThrow('PO_ORDER_CORROBORATION_REQUIRED')
    po.line_items[0].quantity = 2; po.delivery_address.country = ''
    expect(() => corroboratePurchaseOrder(po, order())).toThrow('PO_ORDER_CORROBORATION_REQUIRED')
  })
  it('holds conflicting authoritative provider IDs', () => {
    expect(() => corroboratePurchaseOrder({ ...purchaseOrder(), salesorder_id: '1254360000000000009' }, order())).toThrow('PO_ORDER_PROVIDER_CONFLICT')
  })
  it('accepts an agreeing provider ID without weakening corroboration', () => {
    expect(corroboratePurchaseOrder({ ...purchaseOrder(), salesorder_id: order().salesorder_id }, order()).salesOrderId).toBe(order().salesorder_id)
  })
  it('rejects nonunique local reference matches', async () => {
    state.matches.push({ id: 'other' }); await expect(linkCorroboratedPurchaseOrder(request())).rejects.toThrow('PO_ORDER_UNIQUE_REFERENCE_REQUIRED'); expect(state.updates).toBe(0)
  })
  it('preserves existing associations and concurrent edits', async () => {
    state.po.invoiceId = 'existing'; await expect(linkCorroboratedPurchaseOrder(request())).rejects.toThrow('PO_ORDER_EXISTING_LINK_REQUIRES_REVIEW')
    state.po.invoiceId = null; await expect(linkCorroboratedPurchaseOrder({ ...request(), expectedUpdatedAt: new Date(0) })).rejects.toThrow('PO_ORDER_CHANGED_SINCE_REVIEW'); expect(state.updates).toBe(0)
  })
  it('requires fresh evidence', async () => {
    await expect(linkCorroboratedPurchaseOrder({ ...request(), observedAt: '2020-01-01' })).rejects.toThrow('PO_ORDER_FRESH_EVIDENCE_REQUIRED'); expect(state.updates).toBe(0)
  })
})

it('does not let matching names or SKUs override contradictory provider identities', () => {
  expect(() => corroboratePurchaseOrder({ ...purchaseOrder(), delivery_customer_id: 'A' }, { ...order(), customer_id: 'B' })).toThrow('PO_ORDER_CUSTOMER_ID_CONFLICT')
  const po = purchaseOrder(); po.line_items[0].item_id = 'different-item'
  expect(() => corroboratePurchaseOrder(po, order())).toThrow('PO_ORDER_CORROBORATION_REQUIRED')
})
it('keeps a stable fingerprint across unrelated provider metadata changes', () => {
  expect(corroboratePurchaseOrder({ ...purchaseOrder(), last_modified_time: 'new-time' }, order()).fingerprint).toBe(corroboratePurchaseOrder(purchaseOrder(), order()).fingerprint)
})
