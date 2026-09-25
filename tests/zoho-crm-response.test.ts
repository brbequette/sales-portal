import { describe, expect, it } from 'vitest'
import { interpretCrmConversionResponse, interpretCrmWriteResponse } from '../src/lib/zoho-crm-response'

describe('Zoho CRM write response validation', () => {
  it('accepts only a successful per-record result with an ID', () => {
    expect(interpretCrmWriteResponse(201, { data: [{ status: 'success', code: 'SUCCESS', message: 'created', details: { id: 'lead-1' } }] })).toMatchObject({ ok: true, id: 'lead-1' })
  })

  it.each([
    [500, { message: 'server error' }, 'HTTP_500'],
    [200, { data: [{ status: 'error', code: 'INVALID_DATA', message: 'bad field' }] }, 'INVALID_DATA'],
    [200, { data: [{ status: 'success', code: 'SUCCESS', details: {} }] }, 'SUCCESS'],
    [200, {}, 'HTTP_200'],
  ])('rejects HTTP, per-record, missing-ID, and malformed responses', (status, body, code) => {
    expect(interpretCrmWriteResponse(status, body)).toMatchObject({ ok: false, code })
  })

  it('requires and returns authoritative conversion mappings', () => {
    expect(interpretCrmConversionResponse(200, { data: [{ status: 'success', code: 'SUCCESS', details: { Accounts: 'account-1', Contacts: 'contact-1' } }] })).toMatchObject({ ok: true, accountId: 'account-1', contactId: 'contact-1' })
    expect(interpretCrmConversionResponse(200, { data: [{ status: 'success', code: 'SUCCESS', details: {} }] }).ok).toBe(false)
  })
})
