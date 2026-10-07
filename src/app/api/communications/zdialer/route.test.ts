// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ access: vi.fn(), account: vi.fn(), guard: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ checkAccountOwnership: mock.access }))
vi.mock('@/lib/prisma', () => ({ prisma: { account: { findFirst: mock.account } } }))
vi.mock('@/lib/sms-suppression', () => ({ guardSmsSend: mock.guard }))
import { POST } from './route'
const request = (body: unknown) => new Request('https://tdusales.com/api/communications/zdialer', { method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://tdusales.com', 'Content-Type': 'application/json' } })
beforeEach(() => {
  vi.clearAllMocks()
  mock.access.mockResolvedValue({ authorized: true })
  mock.account.mockResolvedValue({ contacts: [{ id: 'c1', isPrimary: true, phone: '6185550100' }, { id: 'c2', phone: '4805550100' }] })
  mock.guard.mockResolvedValue({ allowed: true })
})
describe('ZDialer database-only SMS preflight', () => {
  it('resolves the selected contact and explicitly does not claim a send', async () => {
    const result = await POST(request({ accountId: 'a1', contactId: 'c2' }))
    expect(await result.json()).toEqual({ success: true, phone: '+14805550100', sent: false })
    expect(mock.access).toHaveBeenCalledWith('a1')
    expect(mock.guard).toHaveBeenCalledWith({ phone: '+14805550100', traffic: 'TRANSACTIONAL' })
  })
  it('enforces account access before looking up a recipient or restrictions', async () => {
    mock.access.mockResolvedValue({ authorized: false, errorResponse: new Response('{}', { status: 403 }) })
    expect((await POST(request({ accountId: 'other' })))?.status).toBe(403)
    expect(mock.account).not.toHaveBeenCalled()
    expect(mock.guard).not.toHaveBeenCalled()
  })
  it('refuses a contact outside the selected account', async () => {
    expect((await POST(request({ accountId: 'a1', contactId: 'other' })))?.status).toBe(400)
    expect(mock.guard).not.toHaveBeenCalled()
  })
  it('preserves opt-out and technical suppressions without an override', async () => {
    mock.guard.mockResolvedValue({ allowed: false, reason: 'OPT_OUT_SUPPRESSED' })
    const result = await POST(request({ phone: '6185550100' }))
    expect(result?.status).toBe(409)
    expect((await result?.json()).error).toContain('OPT_OUT_SUPPRESSED')
  })
  it('fails closed on database failure or invalid phone input', async () => {
    expect((await POST(request({ phone: '123' })))?.status).toBe(400)
    mock.guard.mockRejectedValue(new Error('Database offline'))
    expect((await POST(request({ phone: '+16185550100' })))?.status).toBe(500)
  })
})
