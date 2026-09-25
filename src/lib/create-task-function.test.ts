import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), token: vi.fn(), findUser: vi.fn(), findAccount: vi.fn(), findDeal: vi.fn(), createTask: vi.fn(),
}))
vi.mock('../../netlify/functions/lib/auth-middleware', () => ({ authenticateFunction: mocks.authenticate, withFunctionAuth: (handler: unknown) => handler }))
vi.mock('../../netlify/functions/lib/zoho-auth', () => ({ getZohoAccessToken: mocks.token }))
vi.mock('../../netlify/functions/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.findUser }, account: { findFirst: mocks.findAccount }, deal: { findFirst: mocks.findDeal }, task: { create: mocks.createTask },
} }))

import { authenticatedHandler } from '../../netlify/functions/create-task'

describe('create task account linkage and errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticate.mockResolvedValue({ dbId: 'admin1', userId: 'admin1', role: 'ADMIN' })
    mocks.token.mockResolvedValue('token')
    mocks.findUser.mockResolvedValue({ id: 'admin1', zohoId: 'crm-user-1' })
    mocks.findDeal.mockResolvedValue(null)
  })

  it('resolves the local account and submits only its authoritative CRM account ID', async () => {
    mocks.findAccount.mockResolvedValue({ id: 'local-account', ownerId: 'admin1', crmAccountId: 'crm-account' })
    mocks.createTask.mockResolvedValue({ id: 'task1' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ code: 'SUCCESS', status: 'success', details: { id: 'crm-task' } }] }) }))
    const response: any = await authenticatedHandler!({ httpMethod: 'POST', body: JSON.stringify({ subject: 'call', whatId: 'local-account' }) } as any, {} as any, () => undefined)
    expect(response.statusCode).toBe(200)
    const submitted = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(submitted.data[0].What_Id.id).toBe('crm-account')
    expect(submitted.data[0]).not.toHaveProperty('Owner')
    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accountId: 'local-account' }) }))
  })

  it('returns the complete provider code and message as readable text', async () => {
    mocks.findAccount.mockResolvedValue({ id: 'local-account', ownerId: 'admin1', crmAccountId: 'crm-account' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ data: [{ code: 'INVALID_DATA', message: 'What_Id is invalid', status: 'error' }] }) }))
    const response: any = await authenticatedHandler!({ httpMethod: 'POST', body: JSON.stringify({ subject: 'call', whatId: 'local-account' }) } as any, {} as any, () => undefined)
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toMatchObject({ code: 'INVALID_DATA', providerMessage: 'What_Id is invalid', message: 'Failed to create task in Zoho: INVALID_DATA: What_Id is invalid' })
  })

  it('preserves the rejected CRM field in the readable provider error', async () => {
    mocks.findAccount.mockResolvedValue({ id: 'local-account', ownerId: 'admin1', crmAccountId: 'crm-account' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ data: [{ code: 'INVALID_DATA', message: 'invalid data', status: 'error', details: { api_name: 'id' } }] }) }))
    const response: any = await authenticatedHandler!({ httpMethod: 'POST', body: JSON.stringify({ subject: 'call', whatId: 'local-account' }) } as any, {} as any, () => undefined)
    expect(JSON.parse(response.body)).toMatchObject({ providerMessage: 'invalid data (field: id)' })
  })
})
