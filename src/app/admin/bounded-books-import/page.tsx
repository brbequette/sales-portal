'use client'
import { useState } from 'react'

export default function BoundedBooksImportPage() {
  const [startDate, setStartDate] = useState('2026-09-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const response = await fetch('/api/admin/bounded-books-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, startDate, endDate, ...extra }) })
    const data = await response.json()
    setResult(data)
    if (data.jobId) setJobId(data.jobId)
  }
  return <main className="mx-auto max-w-3xl p-8 space-y-6">
    <h1 className="text-2xl font-bold">Bounded Zoho Books Import</h1>
    <p className="text-sm text-slate-400">Read-only Zoho collection for the selected range. Local import writes only approved application records; it never writes to Zoho.</p>
    <div className="grid grid-cols-2 gap-4"><label>Start date<input className="block border p-2" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><label>End date<input className="block border p-2" value={endDate} onChange={e => setEndDate(e.target.value)} /></label></div>
    <div className="flex gap-3"><button className="rounded bg-blue-600 px-4 py-2" onClick={() => call('preflight')}>Count-only preflight</button><button className="rounded bg-emerald-600 px-4 py-2" onClick={() => call('import', { confirmation: 'IMPORT SEPTEMBER 2026', readOnlyZohoConfirmation: true })}>Reviewed local import</button>{jobId && <button className="rounded bg-red-600 px-4 py-2" onClick={() => call('cancel', { jobId })}>Cancel</button>}</div>
    {result && <pre className="rounded bg-slate-950 p-4 text-sm">{JSON.stringify(result, null, 2)}</pre>}
  </main>
}
