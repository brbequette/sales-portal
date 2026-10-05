// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const makeCall = vi.hoisted(() => vi.fn().mockResolvedValue(true))
vi.mock('./useVoiceDirectory', () => ({ useVoiceDirectory: () => ({ numbers: [{ id: '1', numberId: '1', number: '+14805550100', label: 'Provider line', active: true }], users: [{ userid: '1', name: 'Provider User', extension: 103, status: 1 }], loading: false, error: '', refresh: vi.fn(), admin: false }) }))
vi.mock('@/lib/zoho-voice-websdk', () => ({ makeZohoVoiceCall: makeCall, hasZohoVoiceWebSdkConfiguration: () => true }))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }))
import { TitanVoiceSoftphone } from './TitanVoiceSoftphone'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); makeCall.mockClear() })
describe('real phone handoff', () => {
  it('requires Call after prefill and never fabricates a connection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, number: '+14805550100', numberId: '1' })))
    vi.stubGlobal('fetch', fetchMock)
    const state = vi.fn(); render(<TitanVoiceSoftphone embedded onCallState={state} />)
    fireEvent(window, new CustomEvent('inAppDial', { detail: { phone: '+14805550123' } }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }))
    await waitFor(() => expect(makeCall).toHaveBeenCalledWith('+14805550123', { number: '+14805550100', numberId: '1' }))
    expect(state.mock.calls.some(c => c[0].status === 'connected')).toBe(false)
    expect(screen.queryByText(/Simulate Inbound/)).toBeNull()
    expect(screen.queryByText(/Sarah Jenkins/)).toBeNull()
  })
})
