// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), setting: vi.fn(), invoices: vi.fn(), user: vi.fn(), note: vi.fn(), account: vi.fn(), event: vi.fn(), transaction: vi.fn(), push: vi.fn() }))
vi.mock('./lib/auth-middleware', () => ({ authenticateFunction: m.auth, withFunctionAuth: (fn: unknown) => fn }))
vi.mock('./lib/prisma', () => ({ prisma: { systemSetting: { findUnique: m.setting }, invoice: { findMany: m.invoices }, user: { findUnique: m.user }, note: { create: m.note }, account: { update: m.account }, communicationEvent: { create: m.event }, $transaction: m.transaction } }))
vi.mock('./lib/zoho-auth', () => ({ pushZohoNote: m.push }))
import { handler } from './log-collection-call'
const invoke = (body: any) => handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any) as Promise<any>
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue({ dbId: 'rep', role: 'AGENT', email: 'rep@example.test' })
  m.setting.mockImplementation(({ where }) => Promise.resolve({ value: where.key === 'collections_manager_id' ? 'rep' : 'true' }))
  m.invoices.mockResolvedValue(['i1', 'i2'].map(id => ({ id, accountId: 'a', items: {}, account: { ownerId: 'other', zohoId: 'za' } })))
  m.user.mockResolvedValue({ id: 'rep', name: 'Collector' }); m.note.mockReturnValue('noteWrite'); m.account.mockReturnValue('accountWrite'); m.event.mockReturnValue('eventWrite'); m.transaction.mockResolvedValue([{ id: 'note' }])
})
it('saves one structured activity for a multi-invoice call atomically and honors the Zoho pause', async () => {
  const result = await invoke({ invoiceIds: ['i1', 'i2'], outcome: 'promise_to_pay', contactReached: true, durationMinutes: 4 })
  expect(result.statusCode).toBe(200); expect(m.transaction).toHaveBeenCalledWith(['noteWrite', 'accountWrite', 'eventWrite'])
  expect(m.event.mock.calls[0][0].data.metadata.invoiceIds).toEqual(['i1', 'i2'])
  expect(m.event.mock.calls[0][0].data.sourceId).toBe(m.note.mock.calls[0][0].data.id)
  expect(m.push).not.toHaveBeenCalled()
})
it('rejects unauthorized collectors, invalid durations and cross-account batches', async () => {
  m.setting.mockResolvedValue(null)
  expect((await invoke({ invoiceIds: ['i1', 'i2'], outcome: 'no_answer' })).statusCode).toBe(403)
  m.setting.mockResolvedValue({ value: 'rep' })
  expect((await invoke({ invoiceIds: ['i1', 'i2'], outcome: 'no_answer', durationMinutes: -1 })).statusCode).toBe(400)
  m.invoices.mockResolvedValue([{ id: 'i1', accountId: 'a' }, { id: 'i2', accountId: 'b' }])
  expect((await invoke({ invoiceIds: ['i1', 'i2'], outcome: 'no_answer' })).statusCode).toBe(400)
  expect(m.transaction).not.toHaveBeenCalled()
})
