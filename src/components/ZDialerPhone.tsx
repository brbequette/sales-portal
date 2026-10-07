'use client'

import { useEffect, useState } from 'react'
import { ZDialerActions } from './ZDialerActions'
import { useVoiceDirectory } from './useVoiceDirectory'
import type { PhoneCallStatus } from './TitanVoiceSoftphone'
import { requestZDialerMessage, zdialerNumber } from '@/lib/zdialer'

export function ZDialerPhone({ directoryActive = true, onCallState }: { directoryActive?: boolean; onCallState?: (state: { status: PhoneCallStatus; accountId: string; name: string }) => void }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [tab, setTab] = useState<'dialer' | 'directory'>('dialer')
  const directory = useVoiceDirectory(directoryActive && tab === 'directory')
  useEffect(() => {
    const prepare = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      setPhone(typeof detail.phone === 'string' ? detail.phone : '')
      setName(detail.contactName || detail.accountName || '')
      setAccountId(detail.accountId || '')
      setTab('dialer')
    }
    window.addEventListener('inAppDial', prepare)
    return () => window.removeEventListener('inAppDial', prepare)
  }, [])
  // External handoff is not proof of a connected call, and must not start timers.
  useEffect(() => { onCallState?.({ status: 'idle', accountId: '', name: '' }) }, [onCallState])
  return <section data-phone-console data-zdialer-phone className="flex flex-col min-h-0 h-full text-white" aria-label="ZDialer phone">
    <header data-phone-header><div><strong>ZDialer phone</strong><p className="text-xs text-neutral-400">Calls and texts use ZDialer while embedded calling is being restored.</p></div></header>
    <nav data-phone-tabs className="flex gap-2 p-2 border-b border-white/10" aria-label="Phone tools">{(['dialer', 'directory'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`flex-1 p-2 rounded ${tab === value ? 'bg-cyan-700' : 'bg-white/5'}`}>{value === 'dialer' ? 'Keypad' : 'Team directory'}</button>)}</nav>
    <div data-phone-scroll>
      {tab === 'dialer' ? <div data-phone-body="dialer"><div data-phone-dialer data-zdialer-layout>
        {name && <p className="text-sm text-cyan-200">{name}</p>}
        <input data-phone-number aria-label="Phone number or extension" inputMode="tel" placeholder="Phone number or extension" value={phone} onChange={event => setPhone(event.target.value)} className="w-full bg-black/40 border border-white/15 rounded-xl" />
        <div data-phone-keypad className="grid grid-cols-3">{'123456789*0#'.split('').map(key => <button key={key} type="button" aria-label={`Dial ${key}`} className="bg-white/5 border border-white/10 text-xl font-bold" onClick={() => setPhone(value => value + key)}>{key}</button>)}</div>
        <ZDialerActions phone={phone} />
        <button type="button" disabled={!zdialerNumber(phone).startsWith('+')} onClick={() => requestZDialerMessage(phone, '', name, accountId)} className="min-h-11 rounded-xl border border-cyan-400/30 text-cyan-200 disabled:opacity-40">Text this number in ZDialer</button>
      </div></div> : <div data-phone-body className="space-y-2">
        <p className="text-xs text-neutral-400">Caller ID and assigned outbound numbers are selected in ZDialer.</p>
        {directory.error && <p role="alert">{directory.error}</p>}
        {directory.loading ? <p>Loading team…</p> : directory.users.filter(user => user.status === 1).map(user => <button key={user.userid} type="button" disabled={!user.extension} className="w-full text-left rounded-xl border border-white/10 p-3" onClick={() => { setPhone(String(user.extension)); setName(user.name); setTab('dialer') }}><strong>{user.name}</strong><span className="block text-xs text-neutral-400">{user.extension ? `Extension ${user.extension}` : 'No extension'}</span></button>)}
        {!directory.loading && !directory.users.length && <p>No verified Voice users available.</p>}
      </div>}
    </div>
  </section>
}
