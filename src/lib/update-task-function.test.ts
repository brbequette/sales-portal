import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: vi.fn(), find: vi.fn(), update: vi.fn(), receipt: vi.fn(), invoices: vi.fn() }))
vi.mock('../../netlify/functions/lib/auth-middleware', () => ({ authenticateFunction: mocks.auth, withFunctionAuth: (h: unknown) => h }))
vi.mock('../../netlify/functions/lib/zoho-auth', () => ({ getZohoAccessToken: mocks.token }))
vi.mock('../../netlify/functions/lib/prisma', () => ({ prisma: { task: { findUnique: mocks.find, update: mocks.update }, taskOutcome: { findUnique: mocks.receipt }, invoice: { findMany: mocks.invoices } } }))
import { authenticatedHandler } from '../../netlify/functions/update-task'
const call = (body: object) => authenticatedHandler({ httpMethod: 'PUT', body: JSON.stringify(body) } as any, {} as any, () => undefined) as Promise<any>
describe('task persistence routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ dbId: 'rep', role: 'AGENT' })
    mocks.find.mockResolvedValue({ id: 't', zohoId: 'voice_callback_123', ownerId: 'rep' })
    mocks.receipt.mockResolvedValue(null)
    mocks.invoices.mockResolvedValue([])
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
  it('does not accept a revenue invoice outside the task account', async () => {
    mocks.find.mockResolvedValue({ id: 't', zohoId: '123456789012345', ownerId: 'rep', accountId: 'account1' })
    const response = await call({ zohoId: '123456789012345', status: 'Completed', completion: { requestId: 'request-1234567890', summary: 'Won', outcomeType: 'WON', invoiceNumber: 'other-invoice' } })
    expect(response.statusCode).toBe(400)
    expect(mocks.invoices).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ accountId: 'account1' }) }))
    expect(fetch).not.toHaveBeenCalled()
  })
  it('replays an already-saved completion even after its follow-up time has passed', async () => {
    mocks.receipt.mockResolvedValue({ id: 'receipt1', summary: 'Done', outcomeType: 'COMPLETED', nextAction: 'Call', followUpAt: new Date('2020-01-01T12:00:00Z') })
    const response = await call({ zohoId: 'voice_callback_123', status: 'Completed', completion: { requestId: 'request-1234567890', summary: 'Done', outcomeType: 'COMPLETED', nextAction: 'Call', followUpAt: '2020-01-01T12:00:00Z' } })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).repeated).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
