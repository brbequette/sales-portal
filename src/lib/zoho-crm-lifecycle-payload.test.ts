import { describe, expect, it, vi } from 'vitest'
import { buildCrmLeadCreatePayload, lookupAcceptedLead } from './zoho-crm-lifecycle'
import { interpretCrmWriteResponse } from './zoho-crm-response'

describe('CRM lead reconciliation create payload', () => {
  it('uses only verified standard create fields for an already-locally-converted lead', () => {
    const payload = buildCrmLeadCreatePayload({ company: 'Test Company', status: 'Converted', industry: 'Custom Industry', timeZone: 'America/Chicago', owner: { zohoId: 'owner-1' } })
    expect(payload).toMatchObject({ Company: 'Test Company', Last_Name: 'Test Company', Owner: { id: 'owner-1' } })
    expect(payload).not.toHaveProperty('Lead_Status')
    expect(payload).not.toHaveProperty('Industry')
    expect(payload).not.toHaveProperty('Time_Zone')
  })
})

describe('CRM write diagnostics', () => {
  it('preserves Zoho rejected-field detail without exposing the raw response', () => {
    expect(interpretCrmWriteResponse(400, {
      data: [{ status: 'error', code: 'INVALID_DATA', message: 'invalid data', details: { api_name: 'Owner' } }],
    })).toEqual({ ok: false, code: 'INVALID_DATA', message: 'invalid data (field: Owner) Missing returned record ID.' })
  })
})

describe('CRM lead reconciliation lookup', () => {
  it('requires one exact email and company match and never accepts company-only evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [
        { id: 'wrong-email', Company: 'TEST Incorporated - Lifecycle 20260924', Email: 'other@example.com' },
        { id: 'exact', Company: 'TEST Incorporated - Lifecycle 20260924', Email: 'ben@titandiamond.net' },
      ] }),
    }))

    await expect(lookupAcceptedLead('ben@titandiamond.net', 'TEST Incorporated - Lifecycle 20260924', 'token')).resolves.toBe('exact')
    await expect(lookupAcceptedLead(null, 'TEST Incorporated - Lifecycle 20260924', 'token')).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
