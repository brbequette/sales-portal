// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const user = vi.hoisted(() => vi.fn())
vi.mock('./prisma', () => ({ prisma: { user: { findUnique: user } } }))
vi.mock('./zoho-voice-auth', () => ({ getZohoVoiceAccessToken: vi.fn().mockResolvedValue('test-token') }))
import { voiceInventory, requireVoiceSender } from './voice-directory'
const fetchMock = vi.fn()
const response = (body: unknown) => new Response(JSON.stringify({ code: '200', status: 'SUCCESS', ...body as object }))
const providerUser = { userid: '123', agentId: '456', emailid: 'rep@example.com', name: 'Rep', status: 1 }
const line = { numberId: '789', numberMapId: '101', number: '+1 4805550100', displayName: 'Assigned', isActive: true, isIncomingOrOutgoingActive: true, isEnabled: 1 }
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); user.mockResolvedValue({ id: 'local', email: 'rep@example.com', role: 'AGENT' }) })
afterEach(() => vi.unstubAllGlobals())
describe('live Voice assignment boundaries', () => {
  it('filters rep numbers by the exact provider identity', async () => {
    fetchMock.mockResolvedValueOnce(response({ users: [providerUser] })).mockResolvedValueOnce(response({ numberslist: [line] }))
    const inventory = await voiceInventory({ dbId: 'local' })
    expect(fetchMock.mock.calls[1][0]).toContain('agentId=456')
    expect(inventory.numbers[0].number).toBe('+14805550100')
    expect(inventory.numbers[0].smsCapability).toBe('provider_checked')
    expect(inventory.users[0].emailid).toBeUndefined()
  })
  it('does not expose organization numbers for a missing rep mapping', async () => {
    fetchMock.mockResolvedValueOnce(response({ users: [] }))
    expect((await voiceInventory({ dbId: 'local' })).numbers).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects a revoked sender using a fresh assignment read', async () => {
    fetchMock.mockResolvedValueOnce(response({ users: [providerUser] })).mockResolvedValueOnce(response({ numberslist: [] }))
    await expect(requireVoiceSender({ dbId: 'local' }, '+14805550100')).rejects.toThrow('no longer assigned')
  })
  it('rejects an inactive sender even if the assignment still exists', async () => {
    fetchMock.mockResolvedValueOnce(response({ users: [providerUser] })).mockResolvedValueOnce(response({ numberslist: [{ ...line, isActive: false }] }))
    await expect(requireVoiceSender({ dbId: 'local' }, '+14805550100')).rejects.toThrow('inactive')
  })
  it('fails closed on provider auth errors without a cached fallback or retry', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'ZVT022', status: 'ERROR' }), { status: 400 }))
    await expect(voiceInventory({ dbId: 'local' })).rejects.toThrow('ZVT022')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('does not allow a viewer to send', async () => {
    user.mockResolvedValue({ id: 'local', email: 'rep@example.com', role: 'VIEWER' })
    await expect(requireVoiceSender({ dbId: 'local' }, '+14805550100')).rejects.toThrow('View-only')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
