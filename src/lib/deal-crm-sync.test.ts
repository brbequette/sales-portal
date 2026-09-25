import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ operation: null as any, updates: [] as any[], pkg: null as any, deal: null as any }))
vi.mock('./prisma', () => ({ prisma: { deal: { findUniqueOrThrow: async () => state.deal }, providerWriteOperation: {
  upsert: vi.fn(async ({ create }: any) => state.operation ||= { id: 'op1', state: 'PENDING', ...create }),
  updateMany: vi.fn(async () => { if (state.operation.state !== 'PENDING') return { count: 0 }; state.operation.state = 'SYNCING'; return { count: 1 } }),
  update: vi.fn(async ({ data }: any) => { state.updates.push(data); Object.assign(state.operation, data) }),
} } }))
vi.mock('./zoho-auth', () => ({ getZohoAccessToken: vi.fn(), ZOHO_DC: 'com' }))
vi.mock('./deal-package', () => ({ getDealPackage: async () => state.pkg, object: (value: any) => value && typeof value === 'object' && !Array.isArray(value) ? value : {} }))
import { guardedWrite, mergePackageDescription, validateDealSyncConfig, invoiceItemIndex, syncDealToCrm } from './deal-crm-sync'
beforeEach(() => { state.operation = null; state.updates = []; vi.unstubAllGlobals() })
describe('durable provider writes', () => {
  it('persists an accepted ID and uses it to recover failed readback without another write', async () => {
    const id = '6821836000027811001'
    const write = vi.fn(async () => id)
    const delayedRead = vi.fn(async () => null)
    await expect(guardedWrite('key','deal',{},write,delayedRead)).rejects.toThrow('READBACK_MISMATCH')
    expect(delayedRead).toHaveBeenCalledWith(id)
    expect(state.operation.providerRecordIds).toEqual({id})
    const recoveredRead = vi.fn(async knownId => knownId || null)
    await expect(guardedWrite('key','deal',{},write,recoveredRead)).resolves.toBe(id)
    expect(recoveredRead).toHaveBeenCalledWith(id); expect(write).toHaveBeenCalledTimes(1)
  })
  it('does not recreate a missing known CRM deal', async () => {
    state.pkg = { invoices: [], account: { id: 'account', crmAccountId: '6821836000027811002' }, deal: { owner: { zohoId: '6821836000027811003' } }, lifecycle: { disposition: 'Paid' } }
    state.deal = { zohoId: '6821836000027811001', rawData: {} }
    const read = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal('fetch', read)
    await expect(syncDealToCrm('deal', { enabled:true, identityField:'Portal_Deal_ID', portalUrl:'https://example.com', stages:{Paid:'Invoice Paid'} })).rejects.toThrow('CRM_DEAL_NOT_FOUND')
    expect(read).toHaveBeenCalledTimes(1); expect(state.operation).toBeNull()
  })
  it('verifies before declaring success', async () => {
    const write = vi.fn(async () => '123'); await expect(guardedWrite('key','deal',{},write,async () => '123')).resolves.toBe('123')
    expect(state.operation.state).toBe('SUCCEEDED'); expect(write).toHaveBeenCalledTimes(1)
  })
  it('does not reissue an ambiguous create when verification finds nothing', async () => {
    const write = vi.fn(async () => { throw new Error('timeout') })
    await expect(guardedWrite('key','deal',{},write,async () => null)).rejects.toThrow('timeout')
    await expect(guardedWrite('key','deal',{},write,async () => null)).rejects.toThrow('REQUIRES_RECONCILIATION')
    expect(write).toHaveBeenCalledTimes(1)
  })
  it('recovers an accepted timed-out write through a read, without another POST', async () => {
    const write = vi.fn(async () => { throw new Error('timeout') })
    await expect(guardedWrite('key','deal',{},write,async () => null)).rejects.toThrow()
    await expect(guardedWrite('key','deal',{},write,async () => '123')).resolves.toBe('123')
    expect(write).toHaveBeenCalledTimes(1); expect(state.operation.state).toBe('SUCCEEDED')
  })
  it('does not certify a mismatched readback', async () => {
    await expect(guardedWrite('key','deal',{},async () => '123',async () => '456')).rejects.toThrow('READBACK_MISMATCH')
    expect(state.operation.state).toBe('AMBIGUOUS')
  })
  it('rejects changed payloads under a stable operation key', async () => {
    await guardedWrite('key','deal',{ a: 1 },async () => '123',async () => '123')
    await expect(guardedWrite('key','deal',{ a: 2 },async () => '123',async () => '123')).rejects.toThrow('PAYLOAD_CHANGED')
  })
})
describe('CRM preservation and configuration', () => {
  it('supplies the required invoice item index from source evidence', () => expect(invoiceItemIndex([{zohoId:'123', invoiceNumber:'INV-1', items:{line_items:[{name:'Blade',quantity:2}]}}])).toBe('INV-1: 2 x Blade'))
  it('caps the provider small-text field and points to complete package content', () => { const index=invoiceItemIndex([{zohoId:'123',items:{line_items:[{name:'a'.repeat(3000),quantity:1}]}}]); expect(index.length).toBe(2000); expect(index).toMatch(/Continued in complete deal package/); })
  it('preserves user description before and after the managed block', () => expect(mergePackageDescription('Human note\n[Titan deal package]\nold\n[/Titan deal package]\nOther note','new')).toBe('Human note\n[Titan deal package]\nnew\n[/Titan deal package]\nOther note'))
  it('refuses malformed markers instead of truncating notes', () => expect(() => mergePackageDescription('Human note [Titan deal package]','new')).toThrow('MALFORMED'))
  it('requires a provider-enforced unique identity field', () => expect(() => validateDealSyncConfig({ enabled: true, identityField: 'Portal_Deal_ID', stages: {}, portalUrl: 'https://example.com' }, [{ api_name: 'Portal_Deal_ID', data_type: 'text' }])).toThrow('UNIQUE_IDENTITY'))
  it.each([{}, { case_sensitive: 'false' }, null])('rejects non-unique provider metadata %j', unique => expect(() => validateDealSyncConfig({ enabled: true, identityField: 'Portal_Deal_ID', stages: {}, portalUrl: 'https://example.com' }, [{ api_name: 'Portal_Deal_ID', data_type: 'text', unique }])).toThrow('UNIQUE_IDENTITY'))
  it.each([true, false])('accepts explicit provider uniqueness with case sensitivity %s', case_sensitive => expect(() => validateDealSyncConfig({ enabled: true, identityField: 'Portal_Deal_ID', stages: {}, portalUrl: 'https://example.com' }, [{ api_name: 'Portal_Deal_ID', data_type: 'text', unique: { case_sensitive } }])).toThrow('STAGE_MAPPING'))
})
