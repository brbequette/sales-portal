"use client"

const SCRIPT_ID = 'zoho-voice-websdk'
const SCRIPT_URL = 'https://js.zohostatic.com/zvoice_plugin/v5.1.1/js/zohovoice.min.js'
export type VoiceCall = { callId: string; callStatus: string; number?: string; name?: string; duration?: string; isMute?: boolean; isHold?: boolean; isOutgoing?: boolean; isAccepted?: boolean; isHoldInProg?: boolean }
export type VoiceState = { registration: string; calls: VoiceCall[]; error: string }
type CallRef = { callId: string }
type ZohoVoiceClient = {
  on: (event: string, handler: (value: any) => void) => void
  initialize: () => unknown
  destroy: () => unknown
  setOutgoingNumber: (options: { number: string; numberId: string; isDefault: boolean }) => unknown
  makeCall: (options: { number: string }) => unknown
  answerCall: (call: CallRef) => unknown
  endCall: (call: CallRef) => unknown
  setMute: (muted: boolean, call: CallRef) => unknown
  setHold: (held: boolean, call: CallRef) => unknown
  dtmf: (digit: string, call: CallRef) => unknown
}
declare global { interface Window { ZohoVoice?: new (options: Record<string, unknown>) => ZohoVoiceClient } }
const initial: VoiceState = { registration: 'unregistered', calls: [], error: '' }
let state = initial
const listeners = new Set<() => void>()
let client: ZohoVoiceClient | null = null
let connecting: Promise<void> | null = null
let requested = false
const update = (next: Partial<VoiceState>) => { state = { ...state, ...next }; listeners.forEach(fn => fn()) }
export const subscribeVoice = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getVoiceState = () => state
export const getServerVoiceState = () => initial
export function hasZohoVoiceWebSdkConfiguration() { return Boolean(process.env.NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY?.trim()) }

async function loadScript() {
  if (window.ZohoVoice) return
  await new Promise<void>((resolve, reject) => {
    document.getElementById(SCRIPT_ID)?.remove()
    const script = document.createElement('script')
    const timer = setTimeout(() => { script.remove(); reject(new Error('Phone software did not load. Check your connection and try again.')) }, 15000)
    script.id = SCRIPT_ID; script.src = SCRIPT_URL; script.async = true
    script.onload = () => { clearTimeout(timer); resolve() }
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Phone software could not load.')) }
    document.head.appendChild(script)
  })
}

export async function connectZohoVoice(): Promise<void> {
  if (state.registration === 'registered') return
  if (state.calls.length) throw new Error('Finish the active call before reconnecting.')
  if (connecting) return connecting
  connecting = (async () => {
    const apiKey = process.env.NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY?.trim()
    // Do not substitute the organization's REST OAuth token for a browser/agent credential.
    if (!apiKey) throw new Error('In-app calling is awaiting Zoho softphone activation. Your administrator has contacted Zoho about the rejected SDK access. Search, AI and messaging remain available.')
    update({ registration: 'connecting', error: '' })
    await loadScript()
    if (!window.ZohoVoice) throw new Error('Phone software is unavailable.')
    client?.destroy()
    const current = new window.ZohoVoice({ apiKey, development: false, debug: false, sipDebug: false, profileCache: false, showLauncherIcon: false })
    client = current
    current.on('regState', value => { if (client === current) update({ registration: String(value.status || 'unregistered') }) })
    current.on('callState', (call: VoiceCall) => {
      if (client !== current || !call?.callId) return
      requested = false
      const other = state.calls.filter(c => c.callId !== call.callId)
      update({ calls: call.callStatus === 'callend' ? other : [...other, { ...call }] })
    })
    current.on('error', () => { if (client === current) { requested = false; update({ error: 'Zoho could not complete the phone action. Check your connection and Voice configuration.' }) } })
    current.on('logout', () => { if (client === current) update({ registration: 'unregistered', calls: [] }) })
    await current.initialize()
    // initialize() is not proof of registration; the provider's regState event is authoritative.
  })().catch(error => { update({ registration: 'failed', error: error instanceof Error ? error.message : 'Phone connection failed.' }); throw error }).finally(() => { connecting = null })
  return connecting
}

export async function makeZohoVoiceCall(phone: string, sender?: { number: string; numberId: string }): Promise<boolean> {
  if (!client || state.registration !== 'registered') throw new Error('Connect the in-app phone before calling.')
  if (requested || state.calls.length) throw new Error('Finish the current call before starting another.')
  const normalized = phone.replace(/[^\d+]/g, '')
  if (!/^\+?\d{3,15}$/.test(normalized)) throw new Error('Enter a valid phone number or extension.')
  requested = true
  try {
    if (sender) await client.setOutgoingNumber({ ...sender, isDefault: true })
    await client.makeCall({ number: normalized })
    return true
  } catch (error) { requested = false; throw error }
}
export function controlVoiceCall(action: 'answer' | 'end' | 'mute' | 'hold' | 'dtmf', callId: string, value?: boolean | string) {
  if (!client || !state.calls.some(call => call.callId === callId)) throw new Error('This call is no longer active.')
  const ref = { callId }
  if (action === 'answer') return client.answerCall(ref)
  if (action === 'end') return client.endCall(ref)
  if (action === 'mute') return client.setMute(Boolean(value), ref)
  if (action === 'hold') return client.setHold(Boolean(value), ref)
  if (typeof value === 'string' && /^[0-9*#]$/.test(value)) return client.dtmf(value, ref)
}
