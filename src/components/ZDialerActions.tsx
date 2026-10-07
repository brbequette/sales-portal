'use client'

import { useEffect, useRef, useState } from 'react'
import { FiCopy, FiExternalLink, FiMessageSquare, FiPhone } from 'react-icons/fi'
import { zdialerControl, zdialerNumber, zdialerPlatform, type ZDialerPlatform } from '@/lib/zdialer'
import styles from './ZDialerActions.module.css'

export function ZDialerActions({ phone, kind = 'call', draft = '' }: { phone: string; kind?: 'call' | 'sms'; draft?: string }) {
  const number = zdialerNumber(phone)
  // A keyed subtree also removes extension-owned siblings for an old recipient.
  return <RecipientActions key={`${number}:${kind}`} number={number} kind={kind} draft={draft} />
}

function RecipientActions({ number, kind, draft }: { number: string; kind: 'call' | 'sms'; draft: string }) {
  const [platform, setPlatform] = useState<ZDialerPlatform | null>(null)
  const [defaultReady, setDefaultReady] = useState(false)
  const [available, setAvailable] = useState(false)
  const [status, setStatus] = useState('')
  const anchor = useRef<HTMLAnchorElement>(null)
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => { setPlatform(zdialerPlatform(navigator)) }, [])
  useEffect(() => {
    if (platform !== 'desktop' || !target.current) return
    const inspect = () => setAvailable(!!zdialerControl(anchor.current, kind))
    inspect()
    const observer = new MutationObserver(inspect)
    observer.observe(target.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [platform, kind])
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setStatus(`${label} copied. Paste it in ZDialer.`) }
    catch { setStatus(`Could not copy. Select and copy the ${label.toLowerCase()} shown here.`) }
  }
  const openExtension = () => {
    const control = zdialerControl(anchor.current, kind)
    if (!control) { setStatus('ZDialer controls are unavailable. Sign in to the extension and allow it on this site, then try again.'); return }
    control.click()
    setStatus(kind === 'sms' ? 'ZDialer SMS requested. Paste your draft, choose the sender and send there. Your Titan draft is retained.' : 'Call handed to ZDialer. Use its call controls; Titan has not confirmed a connection.')
  }
  return <div className={styles.actions}>
    <div className={styles.recipient} ref={target}>
      {number && platform === 'desktop' ? <a ref={anchor} href={`tel:${number}`} onClick={event => { event.preventDefault(); openExtension() }}>{number}</a> : <span>{number || 'Enter a phone number with country code, or a team extension.'}</span>}
    </div>
    {kind === 'sms' && <p className={styles.help}>Choose your assigned business sender in ZDialer. Nothing is sent or marked delivered by opening it.</p>}
    {platform === 'desktop' && <>
      <button type="button" disabled={!number} className={styles.primary} onClick={openExtension}>{kind === 'call' ? <FiPhone /> : <FiMessageSquare />}{kind === 'call' ? 'Call with ZDialer' : 'Open ZDialer SMS'}</button>
      <p className={styles.help}>{available ? 'ZDialer controls detected on this page.' : 'Install/sign in to the ZDialer browser extension and enable it for this site.'} Caller ID, audio and message sending are handled in ZDialer.</p>
      <details><summary>Setup and other options</summary><a href="https://www.zoho.com/voice/zdialer.html" target="_blank" rel="noreferrer">Get the browser extension <FiExternalLink /></a>
        {kind === 'call' && number && <a href={`zohovoice://call=${number}`} onClick={() => setStatus('Desktop-app launch requested. If it does not open, install/sign in to ZDialer or use the browser extension.')}>Open installed ZDialer desktop app <FiExternalLink /></a>}
        <p className={styles.help}>In ZDialer settings, allow call pop-ups on all webpages. The extension can also route calls to the installed desktop app.</p>
      </details>
    </>}
    {platform && platform !== 'desktop' && <>
      {kind === 'call' ? <>
        <p className={styles.help}>In ZDialer → More → Settings, enable “Set as Default Dialer” and complete your {platform === 'ios' ? 'iPhone/iPad' : 'Android'} settings. Select your business caller ID in ZDialer.</p>
        <label className={styles.check}><input type="checkbox" checked={defaultReady} onChange={event => setDefaultReady(event.target.checked)} />ZDialer is my default calling app on this device</label>
        {defaultReady && number ? <a className={styles.primary} href={`tel:${number}`} onClick={() => setStatus('Calling-app handoff requested. Check that ZDialer opens before placing the call.')}><FiPhone />Continue to ZDialer</a> : <button type="button" className={styles.primary} disabled>Complete ZDialer setup to call</button>}
      </> : <p className={styles.help}>Copy the recipient and draft below, switch to the ZDialer mobile app, then open SMS → New message. Paste the details and send there. Direct mobile SMS draft links are not supported by this integration.</p>}
      <a href={`https://www.zoho.com/voice/help/zdialer-app-for-${platform === 'ios' ? 'ios' : 'android'}.html`} target="_blank" rel="noreferrer">{platform === 'ios' ? 'iPhone/iPad' : 'Android'} ZDialer setup <FiExternalLink /></a>
    </>}
    <div className={styles.copies}>
      <button type="button" disabled={!number} onClick={() => void copy(number, 'Number')}><FiCopy />Copy number</button>
      {kind === 'sms' && <button type="button" disabled={!draft.trim()} onClick={() => void copy(draft, 'Draft')}><FiCopy />Copy draft</button>}
    </div>
    {status && <p className={styles.status} role="status">{status}</p>}
  </div>
}
