// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), setting: vi.fn(), invoice: vi.fn(), orders: vi.fn(), quotes: vi.fn(), packages: vi.fn(), purchases: vi.fn(), payments: vi.fn() }))
vi.mock('../../../../../netlify/functions/lib/auth-middleware', () => ({ authenticateRequest: m.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: m.user }, systemSetting: { findUnique: m.setting }, invoice: { findFirst: m.invoice }, salesOrder: { findMany: m.orders }, quote: { findMany: m.quotes }, package: { findMany: m.packages }, purchaseOrder: { findMany: m.purchases }, payment: { findMany: m.payments } } }))
import { GET } from './route'
const request = () => new Request('https://example.test/api/collections/overview?id=i1')
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue({ dbId: 'rep' }); m.user.mockResolvedValue({ id: 'rep', email: 'rep@example.test', role: 'AGENT' }); m.setting.mockResolvedValue(null)
  m.invoice.mockResolvedValue({ id: 'i1', zohoId: 'zi1', accountId: 'a1', account: { name: 'Account' }, items: {}, lineItems: [] })
  for (const fn of [m.orders, m.quotes, m.packages, m.purchases, m.payments]) fn.mockResolvedValue([])
})
it('requires authentication before reading business data', async () => {
  m.auth.mockRejectedValue(new Error('Unauthorized'))
  expect((await GET(request())).status).toBe(401); expect(m.invoice).not.toHaveBeenCalled()
})
it('scopes invoice access to the signed-in rep and stops unauthorized detail reads', async () => {
  m.invoice.mockResolvedValue(null)
  expect((await GET(request())).status).toBe(404)
  expect(m.invoice.mock.calls[0][0].where).toEqual({ id: 'i1', account: { ownerId: 'rep' } })
  expect(m.orders).not.toHaveBeenCalled(); expect(m.purchases).not.toHaveBeenCalled()
})
it('retains configured collections manager access, without listing unrelated orders', async () => {
  m.setting.mockResolvedValue({ value: 'rep' })
  expect((await GET(request())).status).toBe(200)
  expect(m.invoice.mock.calls[0][0].where).toEqual({ id: 'i1' })
  expect(m.orders).not.toHaveBeenCalled(); expect(m.packages).not.toHaveBeenCalled()
})
it('verifies order account before resolving packages and omits private provider data', async () => {
  m.invoice.mockResolvedValue({ id: 'i1', zohoId: 'zi1', accountId: 'a1', account: {}, items: { booksSalesOrderId: 'so1' } })
  m.orders.mockResolvedValue([{ id: 'so1', zohoId: 'zso1', items: { salesOrderNumber: 'SO1' } }])
  m.packages.mockResolvedValue([{ packageNumber: 'PKG1', items: { token: 'must-not-expose' } }])
  const response = await GET(request()); const text = await response.text()
  expect(m.orders.mock.calls[0][0].where.accountId).toBe('a1')
  expect(m.packages.mock.calls[0][0].where.OR[0]).toEqual({ salesOrderId: { in: ['so1', 'zso1'] } })
  expect(text).not.toContain('must-not-expose')
})
