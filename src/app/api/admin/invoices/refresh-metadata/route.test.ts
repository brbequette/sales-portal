// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAdministrator: mocks.auth }))
vi.mock('@/lib/targeted-invoice-refresh', () => ({ refreshTargetedInvoice: mocks.refresh }))
import { POST } from './route'
const request = (body: unknown) => new Request('https://portal.test/api/admin/invoices/refresh-metadata', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ session: { user: { dbId: 'admin' } } }) })
it.each([401, 403])('rejects unauthorized callers with %i before provider work', async status => {
  mocks.auth.mockResolvedValue({ errorResponse: new Response(null, { status }) })
  expect((await POST(request({}))).status).toBe(status)
  expect(mocks.refresh).not.toHaveBeenCalled()
})
it('requires an explicit invoice and revision', async () => {
  expect((await POST(request({ booksInvoiceId: '123' }))).status).toBe(400)
  expect(mocks.refresh).not.toHaveBeenCalled()
})
it('passes only exact invoice/revision and authenticated actor to the refresh', async () => {
  mocks.refresh.mockResolvedValue({ state: 'SUCCEEDED', providerCalls: 1 })
  const body = { booksInvoiceId: '1254360000050743136', expectedUpdatedAt: '2026-09-25T17:02:10.419Z', actorId: 'untrusted' }
  expect((await POST(request(body))).status).toBe(200)
  expect(mocks.refresh).toHaveBeenCalledWith(body.booksInvoiceId, body.expectedUpdatedAt, 'admin')
})
it('does not expose arbitrary provider or database error content', async () => {
  mocks.refresh.mockRejectedValue(new Error('private provider response'))
  const response = await POST(request({ booksInvoiceId: '123', expectedUpdatedAt: 'date' }))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'REFRESH_REQUIRES_REVIEW' })
})
