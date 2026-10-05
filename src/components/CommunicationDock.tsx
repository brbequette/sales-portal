"use client"

import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useSearchParams } from 'next/navigation'
import { FiCpu, FiMaximize2, FiMinimize2, FiMessageSquare, FiMonitor, FiPhone, FiSearch, FiX } from 'react-icons/fi'
import styles from './CommunicationDock.module.css'
import { AiAssistant } from './AiAssistant'
import { TitanVoiceSoftphone, type PhoneCallStatus } from './TitanVoiceSoftphone'
import { CommunicationCenter } from './CommunicationCenter'
import { SalesNextSteps } from './SalesNextSteps'
import { COMMUNICATION_CONTEXT_EVENT, getCommunicationContext, publishCommunicationContext, type CommunicationContext } from '@/lib/communication-context'

type Account = { id: string; name: string; contacts?: Array<{ id: string; name?: string; phone?: string; mobilePhone?: string; email?: string }> }
type Tab = 'phone' | 'messages' | 'ai' | 'next'

type DockProps = { user?: { id?: string; name?: string; role?: string } }

export function CommunicationDock(props: DockProps) {
  return <Suspense fallback={null}><CommunicationDockContent {...props} /></Suspense>
}

function CommunicationDockContent({ user }: DockProps) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<Tab>('phone')
  const [callStatus, setCallStatus] = useState<PhoneCallStatus>('idle')
  const [context, setContext] = useState<CommunicationContext | null>(null)
  const [accountId, setAccountId] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [contactId, setContactId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [messageView, setMessageView] = useState<'account' | 'inbox'>('account')
  const [inboxLoaded, setInboxLoaded] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)
  const dock = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const viewport = window.visualViewport
    const mobile = window.matchMedia('(max-width: 767px), (max-height: 500px) and (pointer: coarse)')
    const oldOverflow = document.body.style.overflow
    const resize = () => {
      dock.current?.style.setProperty('--communications-viewport-height', `${viewport?.height || window.innerHeight}px`)
      dock.current?.style.setProperty('--communications-viewport-top', `${viewport?.offsetTop || 0}px`)
      document.body.style.overflow = mobile.matches ? 'hidden' : oldOverflow
    }
    resize()
    viewport?.addEventListener('resize', resize)
    viewport?.addEventListener('scroll', resize)
    window.addEventListener('resize', resize)
    return () => {
      viewport?.removeEventListener('resize', resize)
      viewport?.removeEventListener('scroll', resize)
      window.removeEventListener('resize', resize)
      document.body.style.overflow = oldOverflow
    }
  }, [open])
  const callState = useCallback((state: { status: PhoneCallStatus; accountId: string; name: string }) => {
    setCallStatus(state.status)
    if (state.status !== 'idle' && state.status !== 'wrap_up') {
      setOpen(true)
      setTab('phone')
      if (state.accountId) publishCommunicationContext({ kind: 'account', accountId: state.accountId, title: state.name })
    }
  }, [])

  useEffect(() => {
    const update = () => {
      const next = getCommunicationContext()
      setContext(next)
      setAccountId(previous => previous || next?.accountId || '')
    }
    const openAI = () => { setOpen(true); setTab('ai') }
    const openPhone = () => { setOpen(true); setTab('phone') }
    const openMessages = (event: Event) => {
      setOpen(true); setTab('messages')
      const phone = (event as CustomEvent<{ phone?: string }>).detail?.phone
      if (phone) setQuery(phone)
    }
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') openAI()
      if (event.key === 'Escape') { setOpen(false); launcher.current?.focus() }
    }
    queueMicrotask(update)
    window.addEventListener(COMMUNICATION_CONTEXT_EVENT, update)
    window.addEventListener('openTitanAi', openAI)
    window.addEventListener('inAppDial', openPhone)
    window.addEventListener('titan:open-messages', openMessages)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener(COMMUNICATION_CONTEXT_EVENT, update)
      window.removeEventListener('openTitanAi', openAI)
      window.removeEventListener('inAppDial', openPhone)
      window.removeEventListener('titan:open-messages', openMessages)
      window.removeEventListener('keydown', key)
    }
  }, [])

  useEffect(() => {
    if (pathname === '/account') {
      const id = new URLSearchParams(window.location.search).get('id')
      if (id) publishCommunicationContext({ kind: 'account', accountId: id })
    }
  }, [pathname, search])

  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return Promise.reject(new Error('Cancelled'))
      setAccount(null); setContactId(''); setError(''); setLoading(true)
      return fetch(`/api/get-account-details?id=${encodeURIComponent(accountId)}`, { signal: controller.signal })
    })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.account) throw new Error(data.error || 'Unable to load account')
        return data.account
      })
      .then(data => { if (!controller.signal.aborted) setAccount(data) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accountId])

  useEffect(() => {
    if (query.trim().length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/get-accounts?search=${encodeURIComponent(query.trim())}&limit=8`, { signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error('Search unavailable'); return response.json() })
        .then(data => setResults(data.accounts || []))
        .catch(() => { if (!controller.signal.aborted) setError('Account search unavailable. Try again.') })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  const chooseAccount = (id: string, name?: string) => {
    if (accountId && id !== accountId && !window.confirm('Switch messaging account? Any unsent draft for this account will be cleared.')) return
    setAccount(null); setAccountId(id); setQuery(''); setResults([])
    publishCommunicationContext({ kind: 'account', accountId: id, title: name })
  }
  const busy = callStatus !== 'idle' && callStatus !== 'wrap_up'
  if (!mounted) return null
  return createPortal(<aside ref={dock} aria-label="Titan communications" data-open={open} data-expanded={expanded} className={styles.dock}>
    <section hidden={!open} aria-label="Communications workspace" className={styles.panel}>
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Titan Communications</h2><p className="truncate text-xs text-neutral-400">{context?.title || account?.name || 'Phone, messages and AI in one place'}</p></div>
        {pathname !== '/display' && pathname !== '/communications' && <button type="button" aria-label="Open second screen" title="Open second screen" onClick={() => window.dispatchEvent(new Event('titan:open-second-screen'))} className="rounded-lg p-2 hover:bg-white/10"><FiMonitor /></button>}
        <button type="button" aria-label={expanded ? 'Restore panel size' : 'Expand communications'} onClick={() => setExpanded(value => !value)} className={`${styles.desktopAction} rounded-lg p-2 hover:bg-white/10`}>{expanded ? <FiMinimize2 /> : <FiMaximize2 />}</button>
        <button type="button" aria-label="Minimize communications" onClick={() => { setOpen(false); launcher.current?.focus() }} className="rounded-lg p-2 hover:bg-white/10"><FiX /></button>
      </header>
      <nav aria-label="Communication tools" className="grid shrink-0 grid-cols-4 gap-1 border-b border-white/10 p-2">
        {([{ id: 'phone', label: 'Phone', Icon: FiPhone }, { id: 'messages', label: 'Messages', Icon: FiMessageSquare }, { id: 'ai', label: 'AI', Icon: FiCpu }] as const).map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold ${tab === id ? 'bg-cyan-600 text-white' : 'text-neutral-400 hover:bg-white/10'}`}><Icon />{label}{id === 'phone' && busy && <span className="h-2 w-2 rounded-full bg-emerald-300" />}</button>)}
        <button type="button" aria-pressed={tab === 'next'} onClick={() => setTab('next')} className={`rounded-lg py-2 text-sm font-semibold ${tab === 'next' ? 'bg-cyan-600 text-white' : 'text-neutral-400 hover:bg-white/10'}`}>Next steps</button>
      </nav>
      {/* Keep tools mounted: changing tabs or minimizing must not end a call or erase a draft. */}
      <div hidden={tab !== 'phone'} className={styles.tool}><TitanVoiceSoftphone embedded onCallState={callState} /></div>
      <div hidden={tab !== 'ai'} className={styles.tool}><AiAssistant embedded active={open && tab === 'ai'} user={user} /></div>
      <div hidden={tab !== 'next'} className={`${styles.tool} ${styles.nextSteps}`} onClick={event => { if ((event.target as HTMLElement).closest('a')) setOpen(false) }}><SalesNextSteps accountId={context?.accountId || accountId} active={open && tab === 'next'} /></div>
      <div hidden={tab !== 'messages'} className={`${styles.tool} ${styles.messages}`}>
        <div className="flex shrink-0 gap-2 text-xs"><button aria-pressed={messageView === 'account'} onClick={() => setMessageView('account')} className="rounded-lg bg-white/10 px-3 py-2">Account messages</button><button aria-pressed={messageView === 'inbox'} onClick={() => { setInboxLoaded(true); setMessageView('inbox') }} className="rounded-lg bg-white/10 px-3 py-2">All conversations</button></div>
        {inboxLoaded && <iframe hidden={messageView !== 'inbox'} title="All text conversations" src="/messages?display=1" className={styles.inbox} />}
        <div hidden={messageView !== 'account'} className={styles.account}>
        <label className="flex shrink-0 items-center gap-2 rounded-lg border border-white/15 p-2"><FiSearch /><input aria-label="Find messaging account" value={query} onChange={event => { setQuery(event.target.value); setResults([]) }} placeholder="Find account or customer…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        {results.map(result => <button type="button" key={result.id} onClick={() => chooseAccount(result.id, result.name)} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-white/10">{result.name}</button>)}
        {context?.accountId && context.accountId !== accountId && <button type="button" onClick={() => chooseAccount(context.accountId!, context.title)} className="mb-3 rounded-lg bg-cyan-500/15 p-2 text-xs text-cyan-200">Use current conversation’s account{context.title ? `: ${context.title}` : ''}</button>}
        {account && <p className="mb-2 text-xs text-cyan-200">Messaging: <strong>{account.name}</strong></p>}
        {loading && <p role="status" className="p-4 text-sm">Loading account…</p>}
        {error && <p role="alert" className="p-3 text-sm text-amber-300">{error}</p>}
        {!accountId && <p className="p-4 text-sm text-neutral-400">Open an account or search above to start a message.</p>}
        {account && <div className={styles.accountTools}><CommunicationCenter key={accountId} accountId={accountId} account={account} contacts={account.contacts || []} selectedContactId={contactId} onContactChange={setContactId} initialTab="SMS" messagesOnly /></div>}
        </div>
      </div>
    </section>
    <button ref={launcher} hidden={open} type="button" aria-label="Open Titan communications" aria-expanded={open} onClick={() => setOpen(true)} className="ml-auto flex min-h-12 items-center gap-3 rounded-2xl border border-cyan-300/25 bg-[#101c2b] px-4 py-3 text-sm font-bold text-white shadow-xl hover:bg-cyan-950"><span className={`h-2 w-2 rounded-full ${busy ? 'animate-pulse bg-emerald-400' : 'bg-cyan-400'}`} /><FiPhone /><FiMessageSquare /><FiCpu /><span>{busy ? `Call · ${callStatus.replace('_', ' ')}` : 'Communications'}</span></button>
  </aside>, document.body)
}
