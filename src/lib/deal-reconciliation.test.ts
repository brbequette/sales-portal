import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ invoice: {} as any, deals: [] as any[], quote: null as any, created: [] as any[], users: [] as any[] }))
vi.mock('./prisma', () => {
  const tx: any = {
    $executeRaw: vi.fn(),
    invoice: {
      findUnique: async () => state.invoice,
      updateMany: async ({ data }: any) => { Object.assign(state.invoice, data); return { count: 1 } },
      findMany: async () => [state.invoice],
    },
    deal: {
      findMany: async () => state.deals,
      create: async ({ data }: any) => { const deal = { id: 'new-deal', ...data }; state.created.push(deal); return deal },
      update: vi.fn(),
    },
    salesOrder: { findUnique: async () => null, update: vi.fn() },
    quote: { findUnique: async () => state.quote, update: vi.fn() },
    user: { findMany: async () => state.users },
    package: { findMany: async () => [] }, salesClosingChecklist: { findMany: async () => [] },
    operationalEvent: { create: vi.fn() },
  }
  return { prisma: { $transaction: (fn: any) => fn(tx) } }
})
import { reconcileInvoiceDeal } from './deal-reconciliation'
beforeEach(() => {
  state.invoice = { id: 'invoice', zohoId: 'books-invoice', accountId: 'account', invoiceNumber: 'INV-12', amount: 100, status: 'sent', balance: 100, paymentMade: 0, dueDate: null, isWrittenOff: false, deal: null, dealId: null, account: { name: 'Fixture', ownerId: 'account-owner' }, updatedAt: new Date(), issueDate: new Date() }
  state.deals = []; state.created = []; state.quote = null; state.users = []
})
describe('invoice deal identity reconciliation', () => {
  it('preserves an existing verified account relationship', async () => {
    state.invoice.deal = { id: 'existing', accountId: 'account', stage: 'Invoiced', amount: 100 }; state.invoice.dealId = 'existing'
    expect(await reconcileInvoiceDeal('invoice')).toBe('existing'); expect(state.created).toHaveLength(0)
  })
  it('rejects cross-account links before changing records', async () => {
    state.invoice.deal = { id: 'wrong', accountId: 'other-account' }
    await expect(reconcileInvoiceDeal('invoice')).rejects.toThrow('CROSS_ACCOUNT'); expect(state.created).toHaveLength(0)
  })
  it('rejects duplicate exact candidates', async () => {
    state.deals = [{ id: 'a', name: 'Fixture | INV-12' }, { id: 'b', name: 'Fixture | INV-12' }]
    await expect(reconcileInvoiceDeal('invoice')).rejects.toThrow('AMBIGUOUS_DEAL_MATCH')
  })
  it('reuses an exact quote relationship for a second invoice', async () => {
    state.invoice.estimateZohoId = 'quote'; state.quote = { id: 'quote-db', accountId: 'account', dealId: 'shared' }
    state.deals = [{ id: 'shared', accountId: 'account', name: 'Original opportunity', stage: 'Invoiced', amount: 100 }]
    expect(await reconcileInvoiceDeal('invoice')).toBe('shared'); expect(state.created).toHaveLength(0)
  })
  it('creates only a local placeholder when ownership is provisional', async () => {
    expect(await reconcileInvoiceDeal('invoice')).toBe('new-deal')
    expect(state.created[0].zohoId).toBe('invoice:books-invoice')
    expect(state.created[0].rawData._portalSync.ownerEvidence).toBe('PROVISIONAL_ACCOUNT_OWNER')
  })
  it('will not guess between an invoice reference and conflicting quote lineage', async () => {
    state.invoice.estimateZohoId = 'quote'; state.quote = { id: 'quote-db', accountId: 'account', dealId: 'shared' }
    state.deals = [{ id: 'shared', name: 'Opportunity' }, { id: 'other', name: 'Fixture | INV-12' }]
    await expect(reconcileInvoiceDeal('invoice')).rejects.toThrow('AMBIGUOUS_DEAL_MATCH')
  })
})
