// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), identity: vi.fn(), users: vi.fn(), numbers: vi.fn(), request: vi.fn(), operations: { findFirst: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn() } }))
vi.mock('../../../../../netlify/functions/lib/auth-middleware', () => ({ authenticateRequest: mocks.auth }))
vi.mock('../../../../../netlify/functions/lib/voice-directory', () => ({ voiceIdentity: mocks.identity, listVoiceUsers: mocks.users, listVoiceNumbers: mocks.numbers, voiceRequest: mocks.request }))
vi.mock('@/lib/prisma', () => ({ prisma: { providerWriteOperation: mocks.operations } }))
import { GET, POST } from './route'
const request = (extra = {}, origin = 'https://portal.example') => new NextRequest('https://portal.example/api/admin/voice', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', confirmed: true, requestId: '11111111-1111-4111-8111-111111111111', fields: { name: 'New User', emailid: 'new@example.com', zvtRole: 5 }, ...extra }) })
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ dbId: 'local' }); mocks.identity.mockResolvedValue({ user: { id: 'local' }, admin: true }); mocks.users.mockResolvedValue([]); mocks.operations.findFirst.mockResolvedValue(null)
})
describe('Voice management write guardrails', () => {
  it('rejects nonadmin inventory access', async () => {
    mocks.identity.mockResolvedValue({ user: { id: 'rep' }, admin: false })
    expect((await GET(new NextRequest('https://portal.example/api/admin/voice'))).status).toBe(403)
    expect(mocks.users).not.toHaveBeenCalled()
  })
  it('rejects cross-origin writes before any provider access', async () => {
    expect((await POST(request({}, 'https://other.example'))).status).toBe(409)
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.users).not.toHaveBeenCalled()
  })
  it('rejects unsupported elevated roles', async () => {
    expect((await POST(request({ fields: { name: 'User', emailid: 'new@example.com', zvtRole: 0 } }))).status).toBe(409)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('blocks a new request ID when an earlier user write is ambiguous', async () => {
    mocks.operations.findFirst.mockResolvedValue({ state: 'AMBIGUOUS' })
    const result = await POST(request())
    expect(result.status).toBe(409)
    expect((await result.json()).error).toContain('unresolved')
    expect(mocks.operations.upsert).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled()
  })
})
