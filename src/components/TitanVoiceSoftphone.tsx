"use client"
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { FiPhone, FiRefreshCw } from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import { useVoiceDirectory } from './useVoiceDirectory'
import { USE_ZDIALER } from '@/lib/zdialer'
import { ZDialerPhone } from './ZDialerPhone'
import { makeZohoVoiceCall, hasZohoVoiceWebSdkConfiguration, connectZohoVoice, controlVoiceCall, subscribeVoice, getVoiceState, getServerVoiceState } from '@/lib/zoho-voice-websdk'
export type PhoneCallStatus = 'idle' | 'incoming' | 'dialing' | 'ringing' | 'connected' | 'on_hold' | 'wrap_up'
export type PhoneCallingMode = 'browser_softphone' | 'zoho_voice_bridge' | 'zdialer'
export type SoftphoneTab = 'dialer' | 'directory' | 'recent' | 'copilot'
type SoftphoneProps = { embedded?: boolean; directoryActive?: boolean; onCallState?: (state: { status: PhoneCallStatus; accountId: string; name: string }) => void }
export function TitanVoiceSoftphone(props: SoftphoneProps) {
  return USE_ZDIALER ? <ZDialerPhone {...props} /> : <BrowserVoiceSoftphone {...props} />
}
export function BrowserVoiceSoftphone({ embedded = false, directoryActive = true, onCallState }: SoftphoneProps) {
  const { numbers, users, error, loading, admin, refresh } = useVoiceDirectory(directoryActive)
  const [number, setNumber] = useState('')
  const [from, setFrom] = useState('')
  const [tab, setTab] = useState<'dialer' | 'directory'>('dialer')
  const [busy, setBusy] = useState(false)
  const [context, setContext] = useState({ accountId: '', name: '' })
  const [callContext, setCallContext] = useState({ accountId: '', name: '' })
  const [handoff, setHandoff] = useState('')
  const voice = useSyncExternalStore(subscribeVoice, getVoiceState, getServerVoiceState)
  const activeCall = voice.calls.find(call => call.isAccepted) || voice.calls[0]
  const status: PhoneCallStatus = !activeCall ? 'idle' : activeCall.callStatus === 'incoming' ? 'incoming' : activeCall.isHold && !activeCall.isHoldInProg ? 'on_hold' : activeCall.isAccepted || activeCall.callStatus === 'connected' ? 'connected' : activeCall.callStatus === 'ringing' ? 'ringing' : 'dialing'
  const control = async (action: 'answer' | 'end' | 'mute' | 'hold' | 'dtmf', callId: string, value?: string | boolean) => {
    try { await controlVoiceCall(action, callId, value) } catch (e) { toast.error(e instanceof Error ? e.message : 'Phone action failed') }
  }
  useEffect(() => {
    if (!numbers.some(n => n.number === from && n.active)) setFrom(numbers.find(n => n.active)?.number || '')
  }, [numbers, from])
  useEffect(() => {
    const dial = (event: Event) => {
      const d = (event as CustomEvent).detail || {}
      if (d.phone) setNumber(String(d.phone).replace(/[^\d+]/g, ''))
      setContext({ accountId: d.accountId || '', name: d.accountName || d.contactName || '' }); setTab('dialer'); setHandoff('')
    }
    window.addEventListener('inAppDial', dial)
    return () => window.removeEventListener('inAppDial', dial)
  }, [])
  useEffect(() => { onCallState?.({ status, accountId: activeCall?.isOutgoing ? callContext.accountId : '', name: activeCall?.name || callContext.name }) }, [status, activeCall?.isOutgoing, activeCall?.name, callContext, onCallState])
  const call = useCallback(async () => {
    if (busy || voice.calls.length) return
    setBusy(true); setHandoff('')
    try {
      const toNumber = number.replace(/[^\d+]/g, '')
      const res = await fetch('/api/calls/make', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toNumber, fromNumber: from, accountId: context.accountId || undefined }) })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Call unavailable')
      setCallContext(context)
      const sdkAccepted = await makeZohoVoiceCall(toNumber, { number: data.number, numberId: data.numberId })
      if (!sdkAccepted) throw new Error('The in-app phone did not accept the call.')
      setHandoff('Call requested. Waiting for Zoho connection status…')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Call could not start') }
    finally { setBusy(false) }
  }, [number, from, context, busy, voice.calls.length])
  return <section data-phone-console className="flex flex-col min-h-0 h-full text-white" aria-label="Zoho Voice phone">
    <header data-phone-header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10">
      <div><strong>In-app phone</strong><p role="status" className="text-xs text-neutral-400">{voice.registration === 'registered' ? 'Connected · browser audio' : voice.registration === 'connecting' ? 'Connecting…' : 'Not connected'}</p></div><div className="flex gap-3 items-center"><button onClick={() => void refresh()} aria-label="Refresh Voice assignments"><FiRefreshCw /></button>{admin && <a href="/admin/communications" target="_blank" rel="noreferrer">Manage</a>}{voice.registration !== 'registered' && <button disabled={voice.registration === 'connecting' || !!activeCall} onClick={() => void connectZohoVoice().catch(() => {})} className="rounded-lg bg-cyan-800 px-3 py-2 text-xs">Connect phone</button>}</div>
    </header>
    <nav data-phone-tabs className="flex gap-2 p-2 border-b border-white/10" aria-label="Phone tools">{(['dialer', 'directory'] as const).map(t => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={`flex-1 p-2 rounded ${tab === t ? 'bg-cyan-700' : 'bg-white/5'}`}>{t === 'dialer' ? 'Keypad' : 'Team directory'}</button>)}</nav>
    <div data-phone-scroll>
      {error && <p role="alert" className="p-3 text-amber-300 text-sm">{error}</p>}
      {voice.error && <p role="alert" className="p-3 text-amber-300 text-sm">{voice.error}</p>}
      {voice.calls.map(call => <div key={call.callId} className="m-2 rounded-xl border border-cyan-500/30 bg-cyan-950/40 p-3"><strong>{call.name || call.number || 'Active call'}</strong><p className="text-xs">{call.number} · {call.callStatus === 'connected' || call.isAccepted ? call.isHoldInProg ? 'Updating hold…' : call.isHold ? 'On hold' : 'Connected' : call.callStatus}</p><div className="mt-2 flex flex-wrap gap-2 text-xs">{call.callStatus === 'incoming' && <button onClick={() => void control('answer', call.callId)} className="rounded-lg bg-emerald-700 p-3">Answer</button>}{call.isAccepted && <><button aria-pressed={!!call.isMute} onClick={() => void control('mute', call.callId, !call.isMute)} className="rounded-lg bg-white/10 p-3">{call.isMute ? 'Unmute' : 'Mute'}</button><button disabled={call.isHoldInProg} onClick={() => void control('hold', call.callId, !call.isHold)} className="rounded-lg bg-white/10 p-3">{call.isHold ? 'Resume' : 'Hold'}</button></>}<button onClick={() => void control('end', call.callId)} className="rounded-lg bg-red-700 p-3">{call.callStatus === 'incoming' ? 'Decline' : 'End call'}</button></div></div>)}
      {tab === 'dialer' ? <div data-phone-body="dialer"><div data-phone-dialer>
        <input data-phone-number disabled={!!activeCall} aria-label="Phone number or extension" inputMode="tel" placeholder="Phone number or extension" value={number} onChange={e => { setNumber(e.target.value); setHandoff('') }} className="w-full bg-black/40 border border-white/15 rounded-xl" />
        <div data-phone-caller className="text-xs"><label className="block">Call from<select aria-label="Outbound Voice number" className="w-full bg-slate-900 rounded p-2 mt-1" value={from} onChange={e => setFrom(e.target.value)}><option value="">{loading ? 'Loading assignments…' : 'Select a number'}</option>{numbers.map(n => <option key={n.id} value={n.number} disabled={!n.active}>{n.label} · {n.number}{!n.active ? ' (inactive)' : ''}</option>)}</select></label></div>
        <div data-phone-keypad className="grid grid-cols-3">{'123456789*0#'.split('').map(key => <button key={key} aria-label={`Dial ${key}`} className="bg-white/5 border border-white/10 text-xl font-bold" onClick={() => activeCall ? void control('dtmf', activeCall.callId, key) : setNumber(n => n + key)}>{key}</button>)}</div>
        <button data-phone-call disabled={busy || !!activeCall || voice.registration !== 'registered' || !from || !number} onClick={() => void call()} className="w-full rounded-xl bg-emerald-600 disabled:opacity-40 flex items-center justify-center gap-2 font-bold"><FiPhone />{busy ? 'Checking call…' : 'Call'}</button>
      </div></div> : <div data-phone-body className="space-y-2">{loading ? <p>Loading team…</p> : users.filter(u => u.status === 1).map(u => <button key={u.userid} disabled={!u.extension} onClick={() => { setNumber(String(u.extension)); setContext({ accountId: '', name: u.name }); setTab('dialer') }} className="w-full text-left rounded-xl border border-white/10 p-3"><strong>{u.name}</strong><span className="block text-xs text-neutral-400">{u.extension ? `Extension ${u.extension}` : 'No extension'} · {u.zvtRoleName?.replaceAll('_', ' ')}</span></button>)}{!loading && !users.length && <p>No verified Voice users available.</p>}</div>}
    </div>
    {handoff && !activeCall && <p role="status" className="p-2 text-xs text-cyan-300">{handoff}</p>}
    {!hasZohoVoiceWebSdkConfiguration() && !voice.error && <p className="p-2 text-xs text-amber-200 shrink-0">In-app calling needs Zoho activation. Your administrator is resolving the SDK access issue.</p>}
  </section>
}
