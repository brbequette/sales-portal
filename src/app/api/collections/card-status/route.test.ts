// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), setting: vi.fn(), update: vi.fn(), note: vi.fn(), transaction: vi.fn() }))
vi.mock('../../../../../netlify/functions/lib/auth-middleware', () => ({ authenticateRequest: m.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: m.user }, systemSetting: { findUnique: m.setting }, $transaction: m.transaction } }))
import { PATCH } from './route'
const request = (body: unknown = { accountId: 'a1', cardOnFile: true }) => new Request('https://example.test/api/collections/card-status', { method: 'PATCH', body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue({ dbId: 'rep' }); m.user.mockResolvedValue({ id: 'rep', email: 'rep@example.test', role: 'AGENT' }); m.setting.mockResolvedValue(null)
  m.update.mockResolvedValue({ count: 1 }); m.note.mockResolvedValue({})
  m.transaction.mockImplementation(fn => fn({ account: { updateMany: m.update }, note: { create: m.note } }))
})
it('requires authentication', async () => {
  m.auth.mockRejectedValue(new Error('Unauthorized'))
  expect((await PATCH(request())).status).toBe(401); expect(m.transaction).not.toHaveBeenCalled()
})
it.each([{}, { accountId: 'a1' }, { accountId: 'a1', cardOnFile: 'yes' }, null])('rejects invalid input %#', async body => {
  expect((await PATCH(request(body))).status).toBe(400); expect(m.update).not.toHaveBeenCalled()
})
it('scopes writes to the owner and records the authenticated author', async () => {
  expect((await PATCH(request())).status).toBe(200)
  expect(m.update).toHaveBeenCalledWith({ where: { id: 'a1', ownerId: 'rep' }, data: { cardOnFile: true } })
  expect(m.note.mock.calls[0][0].data).toMatchObject({ accountId: 'a1', authorId: 'rep' })
})
it('does not log a change when account access fails', async () => {
  m.update.mockResolvedValue({ count: 0 })
  expect((await PATCH(request())).status).toBe(404); expect(m.note).not.toHaveBeenCalled()
})
it('allows the configured collections manager to clear status', async () => {
  m.setting.mockResolvedValue({ value: 'rep' })
  expect((await PATCH(request({ accountId: 'a1', cardOnFile: null }))).status).toBe(200)
  expect(m.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { cardOnFile: null } })
})
it('denies viewers and does not report failed transactions as saved', async () => {
  m.user.mockResolvedValue({ id: 'rep', role: 'VIEWER' })
  expect((await PATCH(request())).status).toBe(403); expect(m.update).not.toHaveBeenCalled()
  m.user.mockResolvedValue({ id: 'rep', role: 'AGENT', email: 'rep@example.test' })
  m.transaction.mockRejectedValue(new Error('write failed'))
  expect((await PATCH(request())).status).toBe(500)
})
