"use client"
import React, { useCallback, useEffect, useState } from 'react'
import { FiPhone, FiRefreshCw, FiExternalLink } from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import { useVoiceDirectory } from './useVoiceDirectory'
import { makeZohoVoiceCall, hasZohoVoiceWebSdkConfiguration } from '@/lib/zoho-voice-websdk'
export type PhoneCallStatus = 'idle' | 'incoming' | 'dialing' | 'ringing' | 'connected' | 'on_hold' | 'wrap_up'
export type PhoneCallingMode = 'browser_softphone' | 'zoho_voice_bridge' | 'zdialer'
export type SoftphoneTab = 'dialer' | 'directory' | 'recent' | 'copilot'
export function TitanVoiceSoftphone({ embedded = false, onCallState }: { embedded?: boolean; onCallState?: (state: { status: PhoneCallStatus; accountId: string; name: string }) => void }) {
  const { numbers, users, error, loading, admin, refresh } = useVoiceDirectory()
  const [number, setNumber] = useState('')
  const [from, setFrom] = useState('')
  const [tab, setTab] = useState<'dialer' | 'directory'>('dialer')
  const [busy, setBusy] = useState(false)
  const [context, setContext] = useState({ accountId: '', name: '' })
  const [handoff, setHandoff] = useState('')
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
  useEffect(() => { onCallState?.({ status: busy ? 'dialing' : 'idle', ...context }) }, [busy, context, onCallState])
  const call = useCallback(async () => {
    if (busy) return
    setBusy(true); setHandoff('')
    try {
      const toNumber = number.replace(/[^\d+]/g, '')
      const res = await fetch('/api/calls/make', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toNumber, fromNumber: from, accountId: context.accountId || undefined }) })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Call unavailable')
      const sdkAccepted = await makeZohoVoiceCall(toNumber, { number: data.number, numberId: data.numberId })
      if (!sdkAccepted) {
        const dialer = (window as Window & { ZDialer?: { dial: (phone: string) => unknown } }).ZDialer
        if (!dialer?.dial) {
          await navigator.clipboard?.writeText(toNumber)
          throw new Error('Number copied. Open Zoho Voice to call; this browser has no connected ZDialer or WebSDK.')
        }
        await dialer.dial(toNumber)
        setHandoff('Handed to ZDialer. Confirm the caller ID in Zoho; connection status and call controls are managed there.')
        return
      }
      setHandoff('Call handed to Zoho Voice. Use its call controls for connection status, audio, hold, transfer and hangup.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Call could not start') }
    finally { setBusy(false) }
  }, [number, from, context.accountId, busy])
  return <section data-phone-console className="flex flex-col min-h-0 h-full text-white" aria-label="Zoho Voice phone">
    <header data-phone-header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10">
      <strong>Zoho Voice</strong><div className="flex gap-3 items-center"><button onClick={() => void refresh()} aria-label="Refresh Voice assignments"><FiRefreshCw /></button>{admin && <a href="/admin/communications" target="_blank" rel="noreferrer">Manage</a>}<a href="https://voice.zoho.com/" target="_blank" rel="noreferrer" aria-label="Open Zoho Voice"><FiExternalLink /></a></div>
    </header>
    <nav data-phone-tabs className="flex gap-2 p-2 border-b border-white/10" aria-label="Phone tools">{(['dialer', 'directory'] as const).map(t => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={`flex-1 p-2 rounded ${tab === t ? 'bg-cyan-700' : 'bg-white/5'}`}>{t === 'dialer' ? 'Keypad' : 'Team directory'}</button>)}</nav>
    <div data-phone-scroll>
      {error && <p role="alert" className="p-3 text-amber-300 text-sm">{error}</p>}
      {tab === 'dialer' ? <div data-phone-body="dialer"><div data-phone-dialer>
        <input data-phone-number aria-label="Phone number or extension" inputMode="tel" placeholder="Phone number or extension" value={number} onChange={e => { setNumber(e.target.value); setHandoff('') }} className="w-full bg-black/40 border border-white/15 rounded-xl" />
        <div data-phone-caller className="text-xs"><label className="block">Call from<select aria-label="Outbound Voice number" className="w-full bg-slate-900 rounded p-2 mt-1" value={from} onChange={e => setFrom(e.target.value)}><option value="">{loading ? 'Loading assignments…' : 'Select a number'}</option>{numbers.map(n => <option key={n.id} value={n.number} disabled={!n.active}>{n.label} · {n.number}{!n.active ? ' (inactive)' : ''}</option>)}</select></label></div>
        <div data-phone-keypad className="grid grid-cols-3">{'123456789*0#'.split('').map(key => <button key={key} aria-label={`Dial ${key}`} className="bg-white/5 border border-white/10 text-xl font-bold" onClick={() => setNumber(n => n + key)}>{key}</button>)}</div>
        <button data-phone-call disabled={busy || !from || !number} onClick={() => void call()} className="w-full rounded-xl bg-emerald-600 disabled:opacity-40 flex items-center justify-center gap-2 font-bold"><FiPhone />{busy ? 'Checking call…' : 'Call'}</button>
      </div></div> : <div data-phone-body className="space-y-2">{loading ? <p>Loading team…</p> : users.filter(u => u.status === 1).map(u => <button key={u.userid} disabled={!u.extension} onClick={() => { setNumber(String(u.extension)); setContext({ accountId: '', name: u.name }); setTab('dialer') }} className="w-full text-left rounded-xl border border-white/10 p-3"><strong>{u.name}</strong><span className="block text-xs text-neutral-400">{u.extension ? `Extension ${u.extension}` : 'No extension'} · {u.zvtRoleName?.replaceAll('_', ' ')}</span></button>)}{!loading && !users.length && <p>No verified Voice users available.</p>}</div>}
    </div>
    {handoff && <p role="status" className="p-2 text-xs text-cyan-300">{handoff}</p>}
    {!hasZohoVoiceWebSdkConfiguration() && <p className="p-2 text-xs text-amber-200 shrink-0">Calls and caller ID use ZDialer. <a className="underline" href="https://voice.zoho.com/" target="_blank" rel="noreferrer">Use Zoho Voice</a> for call controls and history.</p>}
  </section>
}
