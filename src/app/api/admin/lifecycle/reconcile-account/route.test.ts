import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), lead: vi.fn(), persistLead: vi.fn(), convert: vi.fn(), books: vi.fn() }))
vi.mock('@/lib/session-user', () => ({ getAuthenticatedDbUser: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { account: { findUnique: mocks.account }, lead: { findUnique: mocks.lead } } }))
vi.mock('@/lib/zoho-crm-lifecycle', () => ({
  persistPortalLeadToCrm: mocks.persistLead,
  convertPersistedCrmLead: mocks.convert,
  isAuthoritativeCrmId: (value: unknown) => typeof value === 'string' && /^\d{15,25}$/.test(value),
}))
vi.mock('@/lib/zoho-books-customer', () => ({ reconcileBooksPrimaryContact: mocks.books }))
import { POST } from './route'

const request = () => new Request('http://localhost/api/admin/lifecycle/reconcile-account', { method: 'POST', body: JSON.stringify({ accountId: 'a1', leadId: 'l1' }) })

describe('admin lifecycle account reconciliation', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('rejects non-administrators before reading records', async () => {
    mocks.auth.mockResolvedValue({ isAdmin: false, user: { id: 'u1' } })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.account).not.toHaveBeenCalled()
  })

  it('requires the immutable local lead-to-account link', async () => {
    mocks.auth.mockResolvedValue({ isAdmin: true, user: { id: 'admin' } })
    mocks.account.mockResolvedValue({ id: 'a1', crmAccountId: null, booksCustomerId: 'b1', contacts: [] })
    mocks.lead.mockResolvedValue({ id: 'l1', convertedAccountId: 'different', crmLeadId: null })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.persistLead).not.toHaveBeenCalled()
  })

  it('reuses completed mappings without creating another local account or Books customer', async () => {
    mocks.auth.mockResolvedValue({ isAdmin: true, user: { id: 'admin' } })
    mocks.account.mockResolvedValue({ id: 'a1', crmAccountId: '1254360000123456789', booksCustomerId: 'bc1', contacts: [{ crmContactId: '1254360000123456790' }] })
    mocks.lead.mockResolvedValue({ id: 'l1', convertedAccountId: 'a1', crmLeadId: '1254360000123456791' })
    mocks.books.mockResolvedValue({ state: 'SUCCEEDED', booksCustomerId: 'bc1', booksContactId: 'bp1' })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.persistLead).not.toHaveBeenCalled()
    expect(mocks.convert).not.toHaveBeenCalled()
    expect(mocks.books).toHaveBeenCalledWith('a1')
  })

  it('reconciles legacy placeholder CRM mappings instead of reporting false success', async () => {
    mocks.auth.mockResolvedValue({ isAdmin: true, user: { id: 'admin' } })
    mocks.account.mockResolvedValue({ id: 'a1', crmAccountId: 'acc_from_lead', booksCustomerId: 'bc1', contacts: [{ crmContactId: 'con_from_lead' }] })
    mocks.lead.mockResolvedValue({ id: 'l1', convertedAccountId: 'a1', crmLeadId: '1254360000123456791' })
    mocks.convert.mockResolvedValue({ state: 'SUCCEEDED', crmAccountId: '1254360000123456789', crmContactId: '1254360000123456790' })
    mocks.books.mockResolvedValue({ state: 'SUCCEEDED', booksCustomerId: 'bc1', booksContactId: 'bp1' })

    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.convert).toHaveBeenCalledWith('l1', 'a1')
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      crm: { leadMapped: true, accountMapped: true, contactMapped: true },
    })
  })
})
