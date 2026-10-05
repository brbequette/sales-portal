// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), contact: vi.fn(), read: vi.fn() }))
vi.mock('../netlify/functions/lib/auth-middleware', () => ({ authenticateFunction: mocks.auth, withFunctionAuth: (handler: unknown) => handler }))
vi.mock('../netlify/functions/lib/prisma', () => ({ prisma: { contact: { findMany: mocks.contact }, account: { findMany: mocks.read }, invoice: { findMany: mocks.read }, deal: { findMany: mocks.read }, product: { findMany: mocks.read }, quote: { findMany: mocks.read }, salesOrder: { findMany: mocks.read } } }))
import { handler } from '../netlify/functions/global-search'
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ dbId: 'rep-1', role: 'AGENT' }); mocks.contact.mockResolvedValue([]); mocks.read.mockResolvedValue([]) })
it('scopes contact search to the signed-in rep’s accounts and never returns raw contact data', async () => {
  const result: any = await handler({ httpMethod: 'GET', queryStringParameters: { q: 'customer' } } as any, {} as any, vi.fn())
  expect(result.statusCode).toBe(200)
  const query = mocks.contact.mock.calls[0][0]
  expect(query.where.AND).toContainEqual({ account: { ownerId: 'rep-1' } })
  expect(query.select.rawData).toBeUndefined()
  expect(query.take).toBe(15)
  expect(result.headers['Cache-Control']).toBe('private, no-store')
})
it('rejects an unlinked rep before searching', async () => {
  mocks.auth.mockResolvedValue({ role: 'AGENT' })
  const result: any = await handler({ httpMethod: 'GET', queryStringParameters: { q: 'customer' } } as any, {} as any, vi.fn())
  expect(result.statusCode).toBe(403)
  expect(mocks.contact).not.toHaveBeenCalled()
})
