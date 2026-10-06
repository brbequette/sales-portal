// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ user: vi.fn(), setting: vi.fn(), query: vi.fn() }))
vi.mock('../netlify/functions/lib/auth-middleware', () => ({ authenticateFunction: async () => ({ dbId: 'rep' }), withFunctionAuth: (h: unknown) => h }))
vi.mock('../netlify/functions/lib/prisma', async () => ({
  Prisma: (await import('@prisma/client')).Prisma,
  prisma: { user: { findFirst: mocks.user }, systemSetting: { findUnique: mocks.setting }, $queryRaw: mocks.query },
}))
import { handler } from '../netlify/functions/get-collections'
const row = (id: string) => ({ id, amount: 100, balance: 50, status: 'Overdue', dueDate: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), accountId: 'a', accountName: 'Customer', ownerId: 'rep', ownerName: 'Rep', contacts: [], items: {} })
async function read(checkOnly = false, tab = 'overdue') {
  const result: any = await handler({ httpMethod: 'GET', queryStringParameters: { checkOnly: String(checkOnly), tab, repId: 'other' } } as any, {} as any, vi.fn())
  return { ...result, data: JSON.parse(result.body) }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T16:00:00Z'))
  mocks.user.mockResolvedValue({ id: 'rep', email: 'rep@example.com', role: 'AGENT' })
  mocks.setting.mockResolvedValue(null)
  mocks.query.mockResolvedValue([row('1'), row('2')])
})
afterEach(() => vi.useRealTimers())
it.each(['overdue', 'current', 'all'])('uses the identical authorized query for %s list and check', async tab => {
  const full = await read(false, tab)
  const check = await read(true, tab)
  expect(check.data.dataSignature).toBe(full.data.dataSignature)
  expect(check.data.count).toBe(2)
  expect(check.data.invoices).toBeUndefined()
  expect(mocks.query.mock.calls[0][0]).toEqual(mocks.query.mock.calls[1][0])
  expect(mocks.query.mock.calls[0][0].values).toContain('rep')
  expect(mocks.query.mock.calls[0][0].values).not.toContain('other')
  expect(full.headers['Cache-Control']).toBe('private, no-store')
})
it('ignores sync timestamps and ordering without hiding real payment changes', async () => {
  const initial = await read()
  mocks.query.mockResolvedValue([{ ...row('2'), updatedAt: new Date() }, row('1')])
  expect((await read(true)).data.dataSignature).toBe(initial.data.dataSignature)
  mocks.query.mockResolvedValue([{ ...row('2'), balance: 25 }, row('1')])
  expect((await read(true)).data.dataSignature).not.toBe(initial.data.dataSignature)
})
it.each([
  [], [row('1')], [row('1'), row('3')],
  [{ ...row('1'), lastCalledAt: new Date() }, row('2')],
  [{ ...row('1'), ownerName: 'New owner' }, row('2')],
  [{ ...row('1'), contacts: [{ id: 'c', name: 'New contact', phone: '4805550100' }] }, row('2')],
].map(rows => ({ rows })))('detects displayed changes %#', async ({ rows }) => {
  const initial = await read()
  mocks.query.mockResolvedValue(rows)
  const changed = await read(true)
  expect(changed.statusCode).toBe(200)
  expect(changed.data.dataSignature).not.toBe(initial.data.dataSignature)
})
it('does not turn a database failure into a fresh empty collection', async () => {
  mocks.query.mockRejectedValue(new Error('database unavailable'))
  const result = await read(true)
  expect(result.statusCode).toBe(500)
  expect(result.data.success).toBe(false)
  expect(result.data.dataSignature).toBeUndefined()
})
