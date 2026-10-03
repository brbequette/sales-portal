// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ pos: [] as any[], invoices: [] as any[], orders: [] as any[], quotes: [] as any[], mutations: vi.fn(() => { throw new Error('DATABASE_WRITE_ATTEMPT') }), denied: false }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  purchaseOrder: { findMany: async () => state.pos, update: state.mutations, updateMany: state.mutations },
  invoice: { findMany: async () => state.invoices }, salesOrder: { findMany: async () => state.orders }, quote: { findMany: async () => state.quotes },
  $executeRaw: state.mutations, $transaction: state.mutations,
} }))
vi.mock('@/lib/auth-helpers', () => ({ requireAdministrator: async () => state.denied ? { errorResponse: new Response('denied', { status: 403 }) } : {} }))
import { POST } from './auto-match/route'
import { GET } from './suggest-matches/route'
import { POST as link } from './link/route'
const po = { id: 'po', zohoId: 'po-zoho', poNumber: '9089', referenceNumber: 'INV 10870', shipToName: 'Steven Dubner Landscaping', date: '2026-07-02', items: { line_items: [{ sku: 'BLADE', quantity: 2 }] } }
const invoice = { id: 'invoice', zohoId: 'invoice-zoho', invoiceNumber: '10870', account: { name: 'Steven Dubner Landscaping' }, issueDate: '2026-07-02', items: { line_items: [{ sku: 'BLADE', quantity: 2 }] } }
beforeEach(() => { state.pos = [po]; state.invoices = [invoice, { ...invoice, id: 'wrong', invoiceNumber: '10984' }]; state.orders = []; state.quotes = []; state.denied = false; state.mutations.mockClear() })
describe('PO matching routes never write from match scores', () => {
  it('auto-match returns the exact proposal and writes nothing', async () => {
    const response = await POST(new Request('http://localhost/api/admin/orphans/auto-match?type=pos'))
    const data = await response.json()
    expect(data).toMatchObject({ success: true, dryRun: true, linkedCount: 0, hasMore: false })
    expect(data.proposals[0].candidates.map((c: any) => c.docNumber)).toEqual(['10870'])
    expect(state.mutations).not.toHaveBeenCalled()
  })
  it('suggestions use the same reference guard', async () => {
    const data = await (await GET(new Request('http://localhost/api/admin/orphans/suggest-matches?poId=po'))).json()
    expect(data.suggestions.po.bestMatch.invoiceNumber).toBe('10870')
    expect(data.suggestions.po.candidates).toHaveLength(1)
    expect(state.mutations).not.toHaveBeenCalled()
  })
  it('resolves SO references in the sales-order namespace without inventing an invoice link', async () => {
    state.pos = [{ ...po, referenceNumber: 'SO #42' }]
    state.invoices = [{ ...invoice, invoiceNumber: '42' }]
    state.orders = [{ id: 'order', zohoId: 'order-zoho', orderDate: '2026-07-02', account: invoice.account, items: { ...invoice.items, salesorder_number: 'SO-42' } }]
    const data = await (await POST(new Request('http://localhost/api/admin/orphans/auto-match'))).json()
    expect(data.proposals[0].candidates).toHaveLength(1)
    expect(data.proposals[0].candidates[0]).toMatchObject({ docId: 'order-zoho', docType: 'SalesOrder', referenceStatus: 'exact' })
    expect(data.linkedCount).toBe(0)
    expect(state.mutations).not.toHaveBeenCalled()
  })
  it('holds conflicts instead of proposing an unrelated invoice', async () => {
    state.invoices[0] = { ...invoice, account: { name: 'Other Company' } }
    const data = await (await GET(new Request('http://localhost/api/admin/orphans/suggest-matches?poId=po'))).json()
    expect(data.suggestions.po).toMatchObject({ bestMatch: null, requiresReview: true, candidates: [] })
    expect(state.mutations).not.toHaveBeenCalled()
  })
  it('does not mark warehouse stock or write fuzzy matches', async () => {
    state.pos = [{ ...po, referenceNumber: null }, { ...po, id: 'stock', shipToName: 'Titan Diamond', referenceNumber: null }]
    const data = await (await POST(new Request('http://localhost/api/admin/orphans/auto-match?type=pos&limit=NaN'))).json()
    expect(data.warehouseCount).toBe(1)
    expect(data.linkedCount).toBe(0)
    expect(state.mutations).not.toHaveBeenCalled()
  })
  it('preserves duplicate matches for review', async () => {
    state.invoices.push({ ...invoice, id: 'duplicate' })
    const data = await (await POST(new Request('http://localhost/api/admin/orphans/auto-match'))).json()
    expect(data.proposals[0].ambiguous).toBe(true)
    expect(state.mutations).not.toHaveBeenCalled()
  })
  it('rejects legacy PO quick-link bypass before querying documents', async () => {
    const response = await link(new Request('http://localhost/api/admin/orphans/link', { method: 'POST', body: JSON.stringify({ type: 'po', id: 'po', invoiceNumber: '10984' }) }))
    expect(response.status).toBe(409)
    expect(state.mutations).not.toHaveBeenCalled()
  })
  it('retains administrator authorization', async () => {
    state.denied = true
    expect((await POST(new Request('http://localhost/api/admin/orphans/auto-match'))).status).toBe(403)
    expect(state.mutations).not.toHaveBeenCalled()
  })
})
