'use client'
import { useEffect, useState } from 'react'

export default function TelegramPage() {
  const [status, setStatus] = useState<{ enabled: boolean; linked: boolean } | null>(null)
  const [link, setLink] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function refresh() {
    const response = await fetch('/api/telegram/link', { cache: 'no-store' }), data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to check connection.')
    setStatus(data)
  }
  useEffect(() => { refresh().catch(e => setError(e.message)) }, [])
  async function change(method: 'POST' | 'DELETE') {
    setBusy(true); setError(''); setLink('')
    try {
      const response = await fetch('/api/telegram/link', { method }), data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update connection.')
      if (data.url) setLink(data.url)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection failed.') } finally { setBusy(false) }
  }
  return <main className="mx-auto max-w-2xl space-y-5 p-8">
    <h1 className="text-3xl font-bold">Titan on Telegram</h1>
    <p>Ask Titan agents about your accounts, calls, and follow-ups. Your portal permissions apply to every answer. Replies may take a minute or two.</p>
    <p>Account information you request will appear in your private Telegram chat. Agents can propose tasks and flyer drafts, show the exact change, and execute it after your approval. Customer messages and financial changes remain in the portal.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {status && !status.enabled && <p>Telegram setup is awaiting administrator configuration.</p>}
    {status?.linked ? <><p>Your Telegram account is connected.</p><button disabled={busy} onClick={() => change('DELETE')} className="rounded border px-4 py-2">Disconnect Telegram</button></> : status?.enabled && <button disabled={busy} onClick={() => change('POST')} className="rounded bg-blue-700 px-4 py-2 text-white">Connect my Telegram</button>}
    {link && <p><a href={link} target="_blank" rel="noreferrer" className="underline">Open Titan in Telegram and press Start</a>. This private pairing link expires in ten minutes. Do not share it.</p>}
    <button disabled={busy} onClick={() => { setError(''); refresh().catch(e => setError(e.message)) }} className="block underline">Refresh connection status</button>
  </main>
}
