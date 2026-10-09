'use client'

import { useEffect, useRef, useState } from 'react'
import { FiCopy, FiExternalLink, FiPhone } from 'react-icons/fi'
import { zdialerControl, zdialerNumber, zdialerPlatform, type ZDialerPlatform } from '@/lib/zdialer'
import styles from './ZDialerActions.module.css'

export function ZDialerActions({ phone }: { phone: string }) {
  const number = zdialerNumber(phone)
  const [defaultReady, setDefaultReady] = useState(false)
  // A keyed subtree also removes extension-owned siblings for an old recipient.
  // Device setup belongs to this phone session, not to a particular recipient.
  return <RecipientActions key={number} number={number} defaultReady={defaultReady} setDefaultReady={setDefaultReady} />
}

function RecipientActions({ number, defaultReady, setDefaultReady }: { number: string; defaultReady: boolean; setDefaultReady: (ready: boolean) => void }) {
  const [platform, setPlatform] = useState<ZDialerPlatform | null>(null)
  const [available, setAvailable] = useState(false)
  const [status, setStatus] = useState('')
  const anchor = useRef<HTMLAnchorElement>(null)
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => { setPlatform(zdialerPlatform(navigator)) }, [])
  useEffect(() => {
    if (platform !== 'desktop' || !target.current) return
    const inspect = () => setAvailable(!!zdialerControl(anchor.current))
    inspect()
    const observer = new MutationObserver(inspect)
    observer.observe(target.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [platform])
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setStatus(`${label} copied. Paste it in ZDialer.`) }
    catch { setStatus(`Could not copy. Select and copy the ${label.toLowerCase()} shown here.`) }
  }
  const openExtension = () => {
    const control = zdialerControl(anchor.current)
    if (!control) { setStatus('ZDialer controls are unavailable. Sign in to the extension and allow it on this site, then try again.'); return }
    control.click()
    setStatus('Call handed to ZDialer. Use its call controls; Titan has not confirmed a connection.')
  }
  return <div className={styles.actions}>
    <div className={styles.recipient} ref={target}>
      {number && platform === 'desktop' ? <a ref={anchor} href={`tel:${number}`} onClick={event => { event.preventDefault(); openExtension() }}>{number}</a> : <span>{number || 'Enter a phone number with country code, or a team extension.'}</span>}
    </div>
    {platform === 'desktop' && <>
      <button type="button" disabled={!number} className={styles.primary} onClick={openExtension}><FiPhone />Call with ZDialer</button>
      <p className={styles.help}>{available ? 'ZDialer controls detected on this page.' : 'Install/sign in to the ZDialer browser extension and enable it for this site.'} Caller ID and call audio are handled in ZDialer. Text messages stay in Titan.</p>
      <details><summary>Setup and other options</summary><a href="https://www.zoho.com/voice/zdialer.html" target="_blank" rel="noreferrer">Get the browser extension <FiExternalLink /></a>
        {number && <a href={`zohovoice://call=${number}`} onClick={() => setStatus('Desktop-app launch requested. If it does not open, install/sign in to ZDialer or use the browser extension.')}>Open installed ZDialer desktop app <FiExternalLink /></a>}
        <p className={styles.help}>In ZDialer settings, allow call pop-ups on all webpages. The extension can also route calls to the installed desktop app.</p>
      </details>
    </>}
    {platform && platform !== 'desktop' && <>
        <p className={styles.help}>In ZDialer → More → Settings, enable “Set as Default Dialer” and complete your {platform === 'ios' ? 'iPhone/iPad' : 'Android'} settings. Select your business caller ID in ZDialer.</p>
        <label className={styles.check}><input type="checkbox" checked={defaultReady} onChange={event => setDefaultReady(event.target.checked)} />ZDialer is my default calling app on this device</label>
        {defaultReady && number ? <a className={styles.primary} href={`tel:${number}`} onClick={() => setStatus('Calling-app handoff requested. Check that ZDialer opens before placing the call.')}><FiPhone />Continue to ZDialer</a> : <button type="button" className={styles.primary} disabled>Complete ZDialer setup to call</button>}
      <a href={`https://www.zoho.com/voice/help/zdialer-app-for-${platform === 'ios' ? 'ios' : 'android'}.html`} target="_blank" rel="noreferrer">{platform === 'ios' ? 'iPhone/iPad' : 'Android'} ZDialer setup <FiExternalLink /></a>
    </>}
    <div className={styles.copies}>
      <button type="button" disabled={!number} onClick={() => void copy(number, 'Number')}><FiCopy />Copy number</button>
    </div>
    {status && <p className={styles.status} role="status">{status}</p>}
  </div>
}
