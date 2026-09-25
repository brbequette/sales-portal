import { describe, expect, it } from 'vitest'
import { buildCrmLeadCreatePayload } from './zoho-crm-lifecycle'
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
