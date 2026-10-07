// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), setting: vi.fn(), save: vi.fn(), events: vi.fn(), notes: vi.fn(), invoices: vi.fn(), payments: vi.fn(), plans: vi.fn() }))
vi.mock('../../../../../netlify/functions/lib/auth-middleware', () => ({ authenticateRequest: m.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: m.user }, systemSetting: { findUnique: m.setting, upsert: m.save }, communicationEvent: { findMany: m.events }, note: { findMany: m.notes }, invoice: { findMany: m.invoices }, payment: { findMany: m.payments }, compensationPlan: { findMany: m.plans } } }))
import { GET, PUT } from './route'
const request = () => new Request('https://example.test/api/collections/stats?start=2026-10-01&end=2026-10-07')
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue({ dbId: 'rep' }); m.user.mockResolvedValue({ id: 'rep', email: 'rep@example.test', role: 'AGENT' }); m.setting.mockResolvedValue(null)
  for (const fn of [m.events, m.notes, m.invoices, m.payments, m.plans]) fn.mockResolvedValue([])
})
it('requires authentication before any business data query', async () => {
  m.auth.mockRejectedValue(new Error('Unauthenticated')); expect((await GET(request())).status).toBe(401); expect(m.events).not.toHaveBeenCalled()
})
it('scopes rep activity and compensation plans to authorized records', async () => {
  expect((await GET(request())).status).toBe(200)
  expect(m.events.mock.calls[0][0].where.account).toEqual({ ownerId: 'rep' })
  expect(m.invoices.mock.calls[0][0].where.account).toEqual({ ownerId: 'rep' })
  expect(m.plans.mock.calls[0][0].where.repId).toEqual({ in: ['rep'] })
})
it('lets the assigned manager report on accounts, without revealing other peoples pay plans', async () => {
  m.setting.mockImplementation(({ where }) => Promise.resolve(where.key === 'collections_manager_id' ? { value: 'rep' } : null))
  expect((await GET(request())).status).toBe(200)
  expect(m.events.mock.calls[0][0].where.account).toEqual({})
  expect(m.plans.mock.calls[0][0].where.repId).toEqual({ in: ['rep'] })
})
it('deduplicates legacy/structured logs and rejects unconfirmed or non-overdue receipts', async () => {
  m.events.mockResolvedValue([{ sourceId: 'n', accountId: 'a', account: { name: 'A' }, actorId: 'rep', actor: { name: 'Rep' }, occurredAt: new Date('2026-10-02T18:00:00Z'), metadata: { invoiceIds: ['i'], outcome: 'Paid in Full', contactReached: true } }])
  m.notes.mockResolvedValue([{ id: 'n' }])
  m.invoices.mockResolvedValue([{ id: 'i', zohoId: 'zi', invoiceNumber: '100', accountId: 'a', account: { name: 'A' }, dueDate: new Date('2026-10-01') }])
  m.payments.mockResolvedValue([
    { id: 'p', invoiceId: 'zi', amount: 100, date: new Date('2026-10-03'), status: 'paid' },
    { id: 'bad', invoiceDbId: 'i', amount: 100, date: new Date('2026-10-03'), status: 'failed' },
    { id: 'early', invoiceDbId: 'i', amount: 100, date: new Date('2026-10-01') },
  ])
  const data = await (await GET(request())).json(); expect(data.calls).toHaveLength(1); expect(data.receipts).toHaveLength(1); expect(data.receipts[0].collector).toBe('rep')
})
it('rejects oversized or impossible date ranges before reading report data', async () => {
  expect((await GET(new Request('https://example.test?start=2026-02-30&end=2026-03-10'))).status).toBe(400)
  expect(m.events).not.toHaveBeenCalled()
})
it('restricts configuration to admins and validates before writing', async () => {
  const req = () => new Request('https://example.test', { method: 'PUT', body: '{"attributionDays":0}' })
  expect((await PUT(req())).status).toBe(403); expect(m.save).not.toHaveBeenCalled()
  m.user.mockResolvedValue({ id: 'admin', role: 'ADMIN' }); expect((await PUT(req())).status).toBe(400); expect(m.save).not.toHaveBeenCalled()
})
it('saves only validated reporting settings for administrators', async () => {
  m.user.mockResolvedValue({ id: 'admin', role: 'ADMIN' })
  const result = await PUT(new Request('https://example.test', { method: 'PUT', body: JSON.stringify({ attributionDays: 15, dailyCallGoal: 40, monthlyRecoveryGoal: 30000, collections_manager_id: 'attacker' }) }))
  expect(result.status).toBe(200)
  expect(m.save.mock.calls[0][0].where.key).toBe('collections_report_settings')
  expect(JSON.parse(m.save.mock.calls[0][0].update.value)).toEqual({ attributionDays: 15, dailyCallGoal: 40, monthlyRecoveryGoal: 30000 })
})
