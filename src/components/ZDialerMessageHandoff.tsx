'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ZDIALER_MESSAGE_EVENT } from '@/lib/zdialer'
import { ZDialerActions } from './ZDialerActions'
import styles from './ZDialerMessageHandoff.module.css'

export function ZDialerMessageHandoff() {
  const [request, setRequest] = useState<{ phone: string; message: string; contactName: string; accountId: string; contactId: string } | null>(null)
  const [checked, setChecked] = useState<{ phone: string; error: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      setChecked(null)
      setRequest({ phone: typeof detail.phone === 'string' ? detail.phone : '', message: typeof detail.message === 'string' ? detail.message : '', contactName: typeof detail.contactName === 'string' ? detail.contactName : '', accountId: typeof detail.accountId === 'string' ? detail.accountId : '', contactId: typeof detail.contactId === 'string' ? detail.contactId : '' })
    }
    window.addEventListener(ZDIALER_MESSAGE_EVENT, open)
    return () => window.removeEventListener(ZDIALER_MESSAGE_EVENT, open)
  }, [])
  useEffect(() => {
    if (!request) return
    const abort = new AbortController()
    setChecked(null)
    fetch('/api/communications/zdialer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: request.phone, accountId: request.accountId, contactId: request.contactId }), signal: abort.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || 'Recipient check failed')
        if (!abort.signal.aborted) setChecked({ phone: data.phone, error: '' })
      }).catch(error => { if (!abort.signal.aborted) setChecked({ phone: '', error: error instanceof Error ? error.message : 'Recipient check failed' }) })
    return () => abort.abort()
  }, [request, retry])
  useEffect(() => {
    if (!request) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); setRequest(null) }
      if (event.key === 'Tab') {
        const items = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea,input')
        if (!items?.length) return
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); previous?.focus() }
  }, [!!request])
  if (!request) return null
  return createPortal(<div className={styles.overlay} onClick={() => setRequest(null)}><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="zdialer-message-title" className={styles.panel} onClick={event => event.stopPropagation()}>
    <header><div><h2 id="zdialer-message-title">Continue in ZDialer</h2><p>{request.contactName || 'Text message'}</p></div><button type="button" onClick={() => setRequest(null)} aria-label="Close ZDialer handoff">Close</button></header>
    <div className={styles.body}>
      <label>Recipient<input aria-label="ZDialer message recipient" readOnly value={checked?.phone || request.phone} /></label>
      <label>Draft to copy<textarea aria-label="ZDialer message draft" readOnly rows={5} value={request.message} /></label>
      {!checked ? <p role="status">Checking recipient and saved SMS restrictions…</p> : checked.error ? <div role="alert"><p>{checked.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry recipient check</button></div> : <ZDialerActions phone={checked.phone} kind="sms" draft={request.message} />}
      <p className={styles.note}>Your original Titan draft stays in place. ZDialer contains the current conversation and delivery status; saved Titan history may lag while sync is paused.</p>
    </div>
  </section></div>, document.body)
}
