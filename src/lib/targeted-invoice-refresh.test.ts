// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import type { Invoice } from '@prisma/client'
const db = vi.hoisted(() => ({ operationalAction: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() }, operationalEvent: { create: vi.fn() }, invoice: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() }, systemSetting: { findUnique: vi.fn() }, providerWriteOperation: { count: vi.fn() }, $transaction: vi.fn() }))
vi.mock('./prisma', () => ({ prisma: db }))
import { refreshTargetedInvoice, targetedInvoicePatch } from './targeted-invoice-refresh'
const row = { id: 'invoice', accountId: 'account', zohoId: '1254360000050743136', updatedAt: new Date('2026-09-25T17:02:10.419Z'), issueDate: new Date('2026-09-15'), dueDate: new Date('2026-10-21'), amount: 4499.75, balance: 4499.75, computedProfit: 1200, computedDeadCost: 3299.75, computedUpfront: 300, computedFinal: 0, paymentMade: 0, items: { date: '2026-09-15', due_date: '2026-10-21', profit: 1200, commission: 600, line_items: [{ sku: 'keep', quantity: 25 }] } } as unknown as Invoice
const provider = { invoice_id: row.zohoId, customer_id: 'customer', date: '2026-09-15', due_date: '2026-10-15', total: 1, sub_total: 1, balance: 0, profit: 0, line_items: [], zcrm_potential_id: 'crm' }
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', vi.fn()) })
it('limits changes to authoritative dates and matching link metadata, preserving all financial fields', () => {
  const before = structuredClone(row)
  const patch = targetedInvoicePatch(row, provider, 'customer', 'crm')
  expect(Object.keys(patch).sort()).toEqual(['dueDate', 'issueDate', 'items'])
  expect(patch.dueDate).toEqual(new Date('2026-10-15T12:00:00Z'))
  expect(patch.items).toEqual({ ...(row.items as object), due_date: '2026-10-15', zcrm_potential_id: 'crm' })
  expect(row).toEqual(before)
})
it.each([
  { invoice_id: 'wrong' }, { customer_id: 'wrong' }, { zcrm_potential_id: 'wrong' }, { date: '2026-02-30' }, { date: null }, { due_date: false },
])('rejects identity/link/date anomalies before any write: %j', changes => {
  expect(() => targetedInvoicePatch(row, { ...provider, ...changes }, 'customer', 'crm')).toThrow()
})
it('does not erase an existing association when Books omits it', () => {
  expect(() => targetedInvoicePatch({ ...row, items: { zcrm_potential_id: 'crm' } }, { ...provider, zcrm_potential_id: null }, 'customer', 'crm')).toThrow('PROVIDER_LINK_MISMATCH')
})
it('clears an absent due date consistently with the normal merge', () => {
  const patch = targetedInvoicePatch(row, { ...provider, due_date: null }, 'customer', 'crm')
  expect(patch.dueDate).toBeNull()
  expect(patch.items).toMatchObject({ due_date: null })
})
it.each(['RUNNING', 'FAILED'])('does not retry a %s revision claim', async status => {
  db.operationalAction.findUnique.mockResolvedValue({ status })
  await expect(refreshTargetedInvoice(row.zohoId!, row.updatedAt.toISOString(), 'admin')).rejects.toThrow('REFRESH_ALREADY_CLAIMED')
  expect(fetch).not.toHaveBeenCalled()
  expect(db.operationalAction.create).not.toHaveBeenCalled()
})
it('rejects stale revisions before fetching provider data', async () => {
  db.operationalAction.findUnique.mockResolvedValue(null)
  db.invoice.findUnique.mockResolvedValue(row)
  await expect(refreshTargetedInvoice(row.zohoId!, '2026-09-24T00:00:00Z', 'admin')).rejects.toThrow('INVOICE_REVISION_CHANGED')
  expect(fetch).not.toHaveBeenCalled()
})
it('validates exact IDs before any claim or provider access', async () => {
  await expect(refreshTargetedInvoice('../invoices', row.updatedAt.toISOString(), 'admin')).rejects.toThrow('INVALID_REFRESH_REQUEST')
  expect(db.operationalAction.findUnique).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

function eligibleFixture() {
  return { ...row, accountId: 'account', account: { zohoId: 'customer', crmAccountId: 'crm-account' }, deal: { id: 'deal', zohoId: 'crm', accountId: 'account', rawData: { _portalSync: { state: 'SYNCED', ownerEvidence: 'EXACT_INVOICE_SALESPERSON' } } }, dealSyncJob: { lastError: null, leaseUntil: null, changedAt: new Date('2026-09-25'), checkedAt: new Date('2026-09-26') } }
}

function setupRefresh() {
  db.operationalAction.findUnique.mockResolvedValue(null)
  db.invoice.findUnique.mockResolvedValue(eligibleFixture())
  db.providerWriteOperation.count.mockResolvedValue(0)
  db.systemSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ token: 'test-token', expiresAt: Date.now() + 60000 }) })
  db.operationalAction.create.mockResolvedValue({ id: 'operation' })
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ code: 0, invoice: provider })))
  db.$transaction.mockImplementation(callback => callback(db))
}

it('fetches once, writes only metadata, and independently verifies after commit and on replay', async () => {
  setupRefresh()
  const after = { ...row, ...targetedInvoicePatch(row, provider, 'customer', 'crm'), updatedAt: new Date('2026-09-27T00:00:00Z') }
  // PostgreSQL jsonb may return object keys in a different order.
  after.items = Object.fromEntries(Object.entries(after.items as object).reverse())
  db.invoice.updateMany.mockResolvedValue({ count: 1 })
  db.invoice.findUniqueOrThrow.mockResolvedValue(after)
  db.operationalAction.update.mockImplementation(async ({ data }) => {
    db.operationalAction.findUniqueOrThrow.mockResolvedValue(data)
    return data
  })
  expect(await refreshTargetedInvoice(row.zohoId, row.updatedAt.toISOString(), 'admin')).toMatchObject({ state: 'SUCCEEDED', providerCalls: 1 })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(`/invoices/${row.zohoId}?`)
  expect(Object.keys(db.invoice.updateMany.mock.calls[0][0].data).sort()).toEqual(['dueDate', 'issueDate', 'items'])
  expect(db.invoice.findUniqueOrThrow).toHaveBeenCalledTimes(2)
  const saved = db.operationalAction.update.mock.calls[0][0].data
  db.operationalAction.findUnique.mockResolvedValue(saved)
  db.invoice.findUnique.mockResolvedValue(after)
  expect(await refreshTargetedInvoice(row.zohoId, row.updatedAt.toISOString(), 'admin')).toMatchObject({ replay: true, providerCalls: 0 })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('stops on a concurrent revision change before any invoice write', async () => {
  setupRefresh()
  db.invoice.findUnique.mockResolvedValueOnce(eligibleFixture()).mockResolvedValueOnce({ ...eligibleFixture(), amount: 123 })
  await expect(refreshTargetedInvoice(row.zohoId, row.updatedAt.toISOString(), 'admin')).rejects.toThrow('INVOICE_REVISION_CHANGED')
  expect(db.invoice.updateMany).not.toHaveBeenCalled()
})

it('preserves unresolved provider writes without fetching or claiming', async () => {
  setupRefresh()
  db.providerWriteOperation.count.mockResolvedValue(1)
  await expect(refreshTargetedInvoice(row.zohoId, row.updatedAt.toISOString(), 'admin')).rejects.toThrow('PROVIDER_WRITE_HOLD')
  expect(fetch).not.toHaveBeenCalled()
  expect(db.operationalAction.create).not.toHaveBeenCalled()
})

it('allows only one caller to claim a revision before provider access', async () => {
  setupRefresh()
  db.operationalAction.create.mockRejectedValue({ code: 'P2002' })
  await expect(refreshTargetedInvoice(row.zohoId, row.updatedAt.toISOString(), 'admin')).rejects.toMatchObject({ code: 'P2002' })
  expect(fetch).not.toHaveBeenCalled()
})

it('does not refresh an invoice whose current package revision is unverified', async () => {
  setupRefresh()
  db.invoice.findUnique.mockResolvedValue({ ...eligibleFixture(), dealSyncJob: { changedAt: new Date(), checkedAt: null } })
  await expect(refreshTargetedInvoice(row.zohoId, row.updatedAt.toISOString(), 'admin')).rejects.toThrow('INVOICE_HOLD')
  expect(fetch).not.toHaveBeenCalled()
})
it('rejects an indeterminate token expiry without claiming or fetching', async () => {
  setupRefresh()
  db.systemSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ token: 'test-token' }) })
  await expect(refreshTargetedInvoice(row.zohoId, row.updatedAt.toISOString(), 'admin')).rejects.toThrow('FRESH_TOKEN_REQUIRED')
  expect(fetch).not.toHaveBeenCalled()
  expect(db.operationalAction.create).not.toHaveBeenCalled()
})
