"use client"
import { useEffect, useRef, useState } from 'react'

type Assistance = { reply: string; summary: string; nextSteps: Array<{ title: string; reason: string }>; verifyBeforeSending: string[]; account: { id: string; name: string } }
export function EmailSalesAssist({ emailId, linked, onDraft }: { emailId: string; linked: boolean; onDraft: (reply: string) => void }) {
  const [result, setResult] = useState<Assistance | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = useRef(emailId)
  useEffect(() => { current.current = emailId; setResult(null); setError(''); setBusy(false); return () => { current.current = '' } }, [emailId])
  const generate = async () => {
    if (busy) return
    const id = emailId
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/emails/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailId: id }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to prepare assistance.')
      if (current.current === id) setResult(payload)
    } catch (e) { if (current.current === id) setError(e instanceof Error ? e.message : 'Unable to prepare assistance.') }
    finally { if (current.current === id) setBusy(false) }
  }
  return <section aria-label="Email sales assistance" className="mt-5 space-y-3 rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-3">
    <h3 className="font-bold">Email sales assistance</h3>
    <p className="text-xs text-neutral-400">Use this email, account history, deals, quotes and existing tasks to prepare a reply and next steps. Review before sending or scheduling.</p>
    <button disabled={busy || !linked} onClick={() => void generate()} className="td-btn td-btn-primary td-btn-sm disabled:opacity-40">{busy ? 'Preparing…' : result ? 'Refresh suggestions' : 'Suggest reply and next steps'}</button>
    {!linked && <p className="text-xs text-amber-300">An administrator must link this email to an account before account assistance is available.</p>}
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    {result && <>
      <p className="whitespace-pre-wrap break-words text-sm">{result.summary}</p>
      <div className="rounded-lg bg-black/20 p-3"><h4 className="text-xs font-bold text-cyan-200">Suggested reply · draft only</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm">{result.reply}</p><button onClick={() => onDraft(result.reply)} className="td-btn td-btn-sm mt-3">Review and edit reply</button></div>
      {!!result.verifyBeforeSending.length && <div className="text-xs text-amber-200"><p className="font-bold">Verify before sending</p><ul className="list-disc pl-4">{result.verifyBeforeSending.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
      {result.nextSteps.map((step, i) => <div key={i} className="rounded-lg border border-white/10 p-3"><h4 className="text-sm font-bold">{step.title}</h4><p className="mt-1 text-xs text-neutral-400">{step.reason}</p><a className="mt-2 inline-block text-xs text-cyan-300 underline" href={`/tasks/new?${new URLSearchParams({ accountId: result.account.id, accountName: result.account.name, subject: step.title, description: `${step.reason}\nEmail evidence: ${emailId}\nReview existing account tasks before saving.` })}`}>Review and schedule follow-up</a></div>)}
    </>}
  </section>
}
