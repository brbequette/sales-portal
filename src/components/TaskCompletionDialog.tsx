"use client"

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CompletionInput } from '@/lib/task-completion'

export function TaskCompletionDialog({ title, onClose, onComplete }: {
  title: string; onClose: () => void; onComplete: (input: CompletionInput) => Promise<boolean>
}) {
  const [summary, setSummary] = useState('')
  const [outcomeType, setOutcomeType] = useState('COMPLETED')
  const [schedule, setSchedule] = useState(false)
  const [nextAction, setNextAction] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const request = useRef({ fingerprint: '', id: '' })
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setError('')
    const date = schedule ? new Date(followUpAt) : null
    if (!summary.trim()) { setError('Describe what happened.'); return }
    if (schedule && (!nextAction.trim() || !date || !Number.isFinite(+date) || +date <= Date.now())) { setError('Enter a next step and a future due date.'); return }
    const fields = { summary: summary.trim(), outcomeType, nextAction: schedule ? nextAction.trim() : '', followUpAt: date?.toISOString() || '', invoiceNumber: invoiceNumber.trim() }
    const fingerprint = JSON.stringify(fields)
    if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() }
    setSaving(true)
    try {
      if (await onComplete({ ...fields, requestId: request.current.id })) onClose()
      else setError('The completion was not confirmed. Your entries are still here; review the error and retry.')
    } catch { setError('Could not confirm the save. Your entries are preserved; retry to check the same request.') }
    finally { setSaving(false) }
  }
  const inputClass = 'mt-1 w-full rounded-lg border border-white/15 bg-[#11151b] p-3 text-sm text-white'
  return createPortal(<div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/75 p-2 sm:p-6">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Complete task and next step" className="w-full max-w-xl max-h-[95dvh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0b0f14] p-5 text-white" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); if (!saving) onClose() }
      if (event.key === 'Tab') {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus() }
      }
    }}>
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Complete & plan next step</h2><p className="mt-1 text-sm text-neutral-400 break-words">{title}</p></div><button disabled={saving} onClick={onClose} aria-label="Close completion" className="p-2">✕</button></div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <fieldset disabled={saving} className="space-y-4 disabled:opacity-60">
          <label className="block text-sm">Outcome<select value={outcomeType} onChange={e => setOutcomeType(e.target.value)} className={inputClass}>
            {[['COMPLETED','Completed'],['WON','Won / sale confirmed'],['LOST','Lost / no sale'],['NO_ANSWER','No answer'],['FOLLOW_UP','Follow-up needed'],['BLOCKED','Blocked / waiting']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
          <label className="block text-sm">What happened?<textarea required maxLength={2000} rows={3} value={summary} onChange={e => setSummary(e.target.value)} className={inputClass} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} />Schedule the next follow-up</label>
          {schedule && <div className="space-y-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3">
            <label className="block text-sm">Next action<input required maxLength={300} value={nextAction} onChange={e => setNextAction(e.target.value)} className={inputClass} /></label>
            <label className="block text-sm">Follow-up date and time<input required type="datetime-local" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} className={`${inputClass} min-w-0`} /></label>
            <p className="text-xs text-neutral-400">Assigned to the same rep and linked to this account. No call, text or email is sent.</p>
          </div>}
          <label className="block text-sm">Related invoice number (optional)<input maxLength={100} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Invoice from this account" className={inputClass} /><span className="mt-1 block text-xs text-neutral-400">Connect an invoice to measure the financial results. Existing document links are retained if blank.</span></label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button disabled={saving} type="submit" className="w-full rounded-xl bg-emerald-600 p-3 font-semibold disabled:opacity-50">{saving ? 'Saving…' : schedule ? 'Complete & create follow-up' : 'Save outcome & complete'}</button>
      </form>
    </div>
  </div>, document.body)
}
