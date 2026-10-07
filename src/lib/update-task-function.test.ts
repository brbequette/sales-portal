import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: vi.fn(), find: vi.fn(), update: vi.fn() }))
vi.mock('../../netlify/functions/lib/auth-middleware', () => ({ authenticateFunction: mocks.auth, withFunctionAuth: (h: unknown) => h }))
vi.mock('../../netlify/functions/lib/zoho-auth', () => ({ getZohoAccessToken: mocks.token }))
vi.mock('../../netlify/functions/lib/prisma', () => ({ prisma: { task: { findUnique: mocks.find, update: mocks.update } } }))
import { authenticatedHandler } from '../../netlify/functions/update-task'
const call = (body: object) => authenticatedHandler({ httpMethod: 'PUT', body: JSON.stringify(body) } as any, {} as any, () => undefined) as Promise<any>
describe('task persistence routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ dbId: 'rep', role: 'AGENT' })
    mocks.find.mockResolvedValue({ id: 't', zohoId: 'voice_callback_123', ownerId: 'rep' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ code: 'SUCCESS' }] }) }))
  })
  it.each(['voice_callback_123', 'AUTO:ACTION:123', 'local-task-123', 'task_lead_123_callback', 'telegram-local:123'])('completes local %s without Zoho calls', async zohoId => {
    mocks.find.mockResolvedValue({ id: 't', zohoId, ownerId: 'rep' })
    expect((await call({ zohoId, status: 'Completed' })).statusCode).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'Completed' } }))
    expect(mocks.token).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects nonowner changes before any writes', async () => {
    mocks.auth.mockResolvedValue({ dbId: 'other', role: 'AGENT' })
    expect((await call({ zohoId: 'voice_callback_123', status: 'Completed' })).statusCode).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it('rejects mismatched identities', async () => {
    expect((await call({ taskId: 't', zohoId: '9999999', status: 'Completed' })).statusCode).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ subject: ' ' }, { dueDate: 'invalid' }, { status: 'invalid' }, { priority: 'invalid' }])('validates updates %j before persistence', async fields => {
    expect((await call({ zohoId: 'voice_callback_123', ...fields })).statusCode).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('updates real CRM tasks remotely before local persistence', async () => {
    mocks.find.mockResolvedValue({ id: 't', zohoId: '123456789012345', ownerId: 'rep' })
    expect((await call({ zohoId: '123456789012345', status: 'Completed' })).statusCode).toBe(200)
    expect(fetch).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledOnce()
  })
  it('does not mark CRM tasks complete if Zoho rejects the update', async () => {
    mocks.find.mockResolvedValue({ id: 't', zohoId: '123456789012345', ownerId: 'rep' })
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'rejected' }) } as any)
    expect((await call({ zohoId: '123456789012345', status: 'Completed' })).statusCode).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
