import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllEnvs(); delete window.ZohoVoice; vi.resetModules() })
it('fails closed without browser credentials and never uses a REST credential as a substitute', async () => {
  vi.stubEnv('NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY', '')
  const sdk = await import('./zoho-voice-websdk')
  await expect(sdk.connectZohoVoice()).rejects.toThrow('awaiting Zoho')
  expect(sdk.getVoiceState().registration).toBe('failed')
})
it('requires registration, initializes once and routes controls by actual provider call ID', async () => {
  vi.stubEnv('NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY', 'test-only')
  const events: Record<string, (data: any) => void> = {}
  const instance = { initialize: vi.fn(), destroy: vi.fn(), on: (event: string, fn: (data: any) => void) => { events[event] = fn }, makeCall: vi.fn(), setOutgoingNumber: vi.fn(), answerCall: vi.fn(), endCall: vi.fn(), setMute: vi.fn(), setHold: vi.fn(), dtmf: vi.fn() }
  window.ZohoVoice = vi.fn(function () { return instance }) as any
  const sdk = await import('./zoho-voice-websdk')
  await Promise.all([sdk.connectZohoVoice(), sdk.connectZohoVoice()])
  expect(instance.initialize).toHaveBeenCalledOnce()
  await expect(sdk.makeZohoVoiceCall('+14805550123')).rejects.toThrow('Connect')
  events.regState({ status: 'registered' })
  await sdk.makeZohoVoiceCall('+14805550123', { number: '+14805550100', numberId: 'number-id' })
  expect(sdk.getVoiceState().calls).toHaveLength(0)
  await expect(sdk.makeZohoVoiceCall('+14805550123')).rejects.toThrow('current call')
  const event = { callId: 'real-id', callStatus: 'connected', isAccepted: true }
  events.callState(event)
  event.callStatus = 'mutated'
  expect(sdk.getVoiceState().calls[0].callStatus).toBe('connected')
  sdk.controlVoiceCall('end', 'real-id')
  expect(instance.endCall).toHaveBeenCalledWith({ callId: 'real-id' })
  events.callState({ callId: 'real-id', callStatus: 'callend' })
  expect(sdk.getVoiceState().calls).toHaveLength(0)
  expect(() => sdk.controlVoiceCall('end', 'real-id')).toThrow('no longer active')
})
