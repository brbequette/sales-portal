import { describe, expect, it } from 'vitest'
import { normalizeCrmLeadStatus } from './zoho-crm-lifecycle'

describe('CRM lead reconciliation status', () => {
  it('maps local Converted to a valid new CRM Lead state', () => {
    expect(normalizeCrmLeadStatus('Converted')).toBe('New Lead')
  })

  it('preserves a non-terminal provider-compatible status', () => {
    expect(normalizeCrmLeadStatus('Contacted')).toBe('Contacted')
  })
})
