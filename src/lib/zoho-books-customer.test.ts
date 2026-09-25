import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findAccount: vi.fn(), updateContact: vi.fn(), token: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { account: { findUnique: mocks.findAccount }, contact: { update: mocks.updateContact } } }))
vi.mock('@/lib/zoho-auth', () => ({ getZohoAccessToken: mocks.token }))

import { buildBooksCustomerPayload, reconcileBooksPrimaryContact } from './zoho-books-customer'

describe('Books primary contact reconciliation', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.ZOHO_ORGANIZATION_ID = 'test-org'; mocks.token.mockResolvedValue('token') })

  it('persists one contact person matched by exact email without creating a customer', async () => {
    mocks.findAccount.mockResolvedValue({ id: 'a1', booksCustomerId: 'bc1', contacts: [{ id: 'c1', email: 'test@example.com', phone: null, mobilePhone: null, booksContactId: null }] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0, contact: { contact_persons: [{ contact_person_id: 'bp1', email: 'test@example.com' }] } }) }))
    await expect(reconcileBooksPrimaryContact('a1')).resolves.toMatchObject({ state: 'SUCCEEDED', booksCustomerId: 'bc1', booksContactId: 'bp1' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(mocks.updateContact).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ booksContactId: 'bp1' }) }))
  })

  it('refuses ambiguous exact matches', async () => {
    mocks.findAccount.mockResolvedValue({ id: 'a1', booksCustomerId: 'bc1', contacts: [{ id: 'c1', email: 'same@example.com', booksContactId: null }] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0, contact: { contact_persons: [{ contact_person_id: 'bp1', email: 'same@example.com' }, { contact_person_id: 'bp2', email: 'same@example.com' }] } }) }))
    await expect(reconcileBooksPrimaryContact('a1')).resolves.toMatchObject({ state: 'FAILED' })
    expect(mocks.updateContact).not.toHaveBeenCalled()
  })

  it('uses the contact-scoped contact-person endpoint when the customer detail omits people', async () => {
    mocks.findAccount.mockResolvedValue({ id: 'a1', booksCustomerId: 'bc1', contacts: [{ id: 'c1', email: 'test@example.com', phone: null, mobilePhone: null, booksContactId: null }] })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, contact: { contact_persons: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, contact_persons: [{ contact_person_id: 'bp1', contact_id: 'bc1', email: 'test@example.com' }] }) }))

    await expect(reconcileBooksPrimaryContact('a1')).resolves.toMatchObject({ state: 'SUCCEEDED', booksContactId: 'bp1' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('/contacts/bc1/contactpersons')
  })

  it('maps Street1 to the documented Books address field and falls shipping back to billing', () => {
    const payload = buildBooksCustomerPayload({ name: 'Test', billingStreet: '160 S. Pullen Blvd', billingCity: 'Centralia', billingState: 'IL', billingZip: '62801' })
    expect(payload.billing_address).toEqual({ address: '160 S. Pullen Blvd', city: 'Centralia', state: 'IL', zip: '62801', country: 'US' })
    expect(payload.shipping_address).toEqual(payload.billing_address)
    expect(payload.billing_address).not.toHaveProperty('street')
  })
})
