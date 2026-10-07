import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), hub: vi.fn(), report: vi.fn() }))
vi.mock('../../netlify/functions/lib/auth-middleware', () => ({ authenticateFunction: mocks.auth, withFunctionAuth: (h: unknown) => h }))
vi.mock('../../netlify/functions/lib/prisma', () => ({ prisma: { user: { findFirst: mocks.user } } }))
vi.mock('./task-hub-data', () => ({ readTaskHub: mocks.hub, TaskHubInputError: class extends Error {} }))
vi.mock('./task-outcome-report', () => ({ readTaskOutcomeReport: mocks.report }))
import { authenticatedHandler } from '../../netlify/functions/get-tasks'
const call = (params: object) => authenticatedHandler({ httpMethod: 'GET', queryStringParameters: { hub: 'true', ...params } } as any, {} as any, () => undefined) as Promise<any>
describe('task hub authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ dbId: 'rep1', userId: 'rep1', email: 'rep@example.test', role: 'ADMIN' })
    mocks.user.mockResolvedValue({ id: 'rep1', role: 'AGENT', email: 'rep@example.test' })
    mocks.hub.mockResolvedValue({ success: true, tasks: [] })
    mocks.report.mockResolvedValue({ success: true, buckets: [] })
  })
  it('uses the database role and ignores nonadmin owner or identity overrides', async () => {
    expect((await call({ ownerIdFilter: 'other', email: 'other@example.test', zohoId: 'other' })).statusCode).toBe(200)
    expect(mocks.hub.mock.calls[0][1]).toBe('rep1')
  })
  it('applies the same owner restriction to revenue reporting', async () => {
    await call({ report: 'true', ownerIdFilter: 'all' })
    expect(mocks.report.mock.calls[0][1]).toBe('rep1')
  })
  it('allows an authorized administrator to see the team or an owner filter', async () => {
    mocks.user.mockResolvedValue({ id: 'rep1', role: 'ADMIN', email: 'rep@example.test' })
    await call({}); expect(mocks.hub.mock.calls[0][1]).toBeNull()
    await call({ ownerIdFilter: 'other' }); expect(mocks.hub.mock.calls[1][1]).toBe('other')
  })
  it('rejects unlinked users without reading tasks', async () => {
    mocks.user.mockResolvedValue(null)
    expect((await call({})).statusCode).toBe(403)
    expect(mocks.hub).not.toHaveBeenCalled()
  })
})
