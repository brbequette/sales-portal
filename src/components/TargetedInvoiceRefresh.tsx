'use client'
import { useRef, useState, type FormEvent } from 'react'

export default function TargetedInvoiceRefresh() {
  const [booksInvoiceId, setId] = useState('')
  const [expectedUpdatedAt, setRevision] = useState('')
  const [result, setResult] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const locked = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (locked.current) return
    if (!/^\d{15,20}$/.test(booksInvoiceId) || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      setResult('Enter one exact Books invoice ID and its saved revision in UTC.'); return
    }
    locked.current = true
    setSubmitted(true)
    setResult('Refreshing this invoice once. Do not resubmit while verification is pending.')
    try {
      const response = await fetch('/api/admin/invoices/refresh-metadata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booksInvoiceId, expectedUpdatedAt }) })
      const body = await response.json()
      if (!response.ok) {
        const code = typeof body.error === 'string' && /^[A-Z_0-9]+$/.test(body.error) ? body.error : 'REFRESH_REQUIRES_REVIEW'
        setResult(`Stopped: ${code}. No automatic retry. Review the saved operation before continuing.`)
        return
      }
      setResult(JSON.stringify({ state: body.state, replay: body.replay, providerCalls: body.providerCalls, invoiceId: body.invoiceId, dueDate: body.dueDate }, null, 2))
    } catch {
      setResult('Result unavailable. The request may have completed. Check the saved operation before continuing; this form will not retry.')
    }
  }
  return <section className="space-y-3 rounded-xl border border-white/10 p-5" aria-labelledby="targeted-refresh-title">
    <h2 id="targeted-refresh-title" className="text-xl font-semibold">Refresh one invoice’s Books metadata</h2>
    <p className="text-sm text-neutral-300">Refresh issue date, due date, and an existing verified CRM link from Books. Amounts, payments, costs, profit, commission, owner, and invoice status are preserved. No customer message or Books write is sent.</p>
    <p className="text-sm text-neutral-400">Requires a verified invoice without holds and its exact saved revision. Reserve one provider request in the reconciliation allowance before submitting. A revision conflict stops the refresh.</p>
    <form onSubmit={submit} className="space-y-3">
      <label className="block">Books invoice ID<input required inputMode="numeric" pattern="[0-9]{15,20}" disabled={submitted} value={booksInvoiceId} onChange={event => setId(event.target.value)} className="mt-1 block w-full rounded bg-neutral-900 p-2" /></label>
      <label className="block">Expected saved revision (UTC)<input required placeholder="2026-09-25T17:02:10.419Z" disabled={submitted} value={expectedUpdatedAt} onChange={event => setRevision(event.target.value)} className="mt-1 block w-full rounded bg-neutral-900 p-2" /></label>
      <button disabled={submitted} className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-40">Refresh metadata once</button>
    </form>
    {result && <pre role="status" className="whitespace-pre-wrap rounded border border-white/10 p-3 text-sm">{result}</pre>}
  </section>
}
