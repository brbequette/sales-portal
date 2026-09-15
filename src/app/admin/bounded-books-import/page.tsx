'use client'
import { useEffect, useState } from 'react'

export default function BoundedBooksImportPage() {
  const [startDate, setStartDate] = useState('2026-09-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const refreshStatus = async () => { const response = await fetch('/api/admin/bounded-books-import', { cache: 'no-store' }); setStatus(await response.json()) }
  useEffect(() => { void refreshStatus(); const timer = window.setInterval(() => void refreshStatus(), 15000); return () => window.clearInterval(timer) }, [])
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const response = await fetch('/api/admin/bounded-books-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, startDate, endDate, ...extra }) })
    const data = await response.json()
    setResult(data)
    if (data.jobId) setJobId(data.jobId)
  }
  return <main className="mx-auto max-w-4xl p-8 space-y-6">
    <h1 className="text-2xl font-bold">Bounded Zoho Books Import</h1>
    <p className="text-sm text-slate-400">Read-only Zoho collection for the selected range. Local import writes only approved application records; it never writes to Zoho.</p>
    <div className="grid grid-cols-2 gap-4"><label>Start date<input className="block border p-2" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><label>End date<input className="block border p-2" value={endDate} onChange={e => setEndDate(e.target.value)} /></label></div>
    {status && <section className="rounded border p-4 space-y-2"><h2 className="font-semibold">Automatic synchronization</h2><p>{status.enabled ? 'Enabled' : 'Disabled'} · {String(status.schedule)}</p><p>Current state: {status.current ? String((status.current as Record<string, unknown>).status) : 'Idle'}</p><p>Last attempted: {status.lastAttempt ? String((status.lastAttempt as Record<string, unknown>).status) : 'None'}</p><p>Last successful: {status.lastSuccessful ? String((status.lastSuccessful as Record<string, unknown>).completedAt || 'Recorded') : 'None'}</p><button className="rounded border px-3 py-1" onClick={() => void refreshStatus()}>Refresh status</button></section>}
    <div className="flex gap-3"><button className="rounded bg-blue-600 px-4 py-2" onClick={() => call('preflight')}>Count-only preflight</button><button className="rounded bg-emerald-600 px-4 py-2" onClick={() => { if (window.confirm('Run the bounded GET-only local update?')) void call('import', { confirmation: 'IMPORT SEPTEMBER 2026', readOnlyZohoConfirmation: true }) }}>Run safe update now</button>{jobId && <button className="rounded bg-red-600 px-4 py-2" onClick={() => call('cancel', { jobId })}>Cancel</button>}</div>
    {status && <section className="rounded border p-4"><h2 className="font-semibold mb-2">Recent runs</h2><div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th>Status</th><th>Trigger</th><th>Range</th><th>Duration</th><th>Reason</th></tr></thead><tbody>{((status.recent as Record<string, unknown>[] || []).map(run => <tr key={String(run.id)}><td>{String(run.status)}</td><td>{String(run.triggerType)}</td><td>{String(run.startDate)}–{String(run.endDate)}</td><td>{run.durationMs == null ? '—' : `${run.durationMs} ms`}</td><td>{String(run.errorCategory || run.skipReason || '—')}</td></tr>))}</tbody></table></div></section>}
    {result && <pre className="rounded bg-slate-950 p-4 text-sm">{JSON.stringify(result, null, 2)}</pre>}
  </main>
}
