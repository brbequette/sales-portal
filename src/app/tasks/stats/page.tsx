"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

function dateField(date: Date) { return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-') }
function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value) }
  catch { return `${Number(value).toFixed(2)} (${currency})` }
}
export default function TaskStatsPage() {
  const [from, setFrom] = useState(() => dateField(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [through, setThrough] = useState(() => dateField(new Date()))
  const [bucket, setBucket] = useState('day')
  const [version, setVersion] = useState(0)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    if (!from || !through || from > through) { setError('Choose a valid date range.'); setLoading(false); return }
    const start = new Date(`${from}T00:00:00`), end = new Date(`${through}T00:00:00`)
    end.setDate(end.getDate()+1)
    if (+end - +start > 732*86400000) { setError('Choose a reporting range of two years or less.'); setLoading(false); return }
    const params = new URLSearchParams({ hub: 'true', report: 'true', start: start.toISOString(), end: end.toISOString(), bucket,
      offset: String(new Date().getTimezoneOffset()), zone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    setLoading(true); setError('')
    fetch(`/api/get-tasks?${params}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || result.error || 'Report unavailable')
      if (!controller.signal.aborted) setData(result)
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || 'Report unavailable') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [from, through, bucket, version])
  const totals = useMemo(() => (data?.buckets || []).reduce((sum: any, row: any) => {
    for (const key of ['outcomes','completed','won','lost','noAnswer','followUps']) sum[key] += row[key] || 0
    return sum
  }, { outcomes: 0, completed: 0, won: 0, lost: 0, noAnswer: 0, followUps: 0 }), [data])
  const financials = useMemo(() => {
    const grouped = new Map<string, any>()
    for (const row of data?.revenue || []) {
      if (!grouped.has(row.currency)) grouped.set(row.currency, { currency: row.currency, invoiced: 0, collected: 0, outstanding: 0, invoices: 0, missingPaymentSummary: 0 })
      const sum = grouped.get(row.currency)
      for (const key of ['invoiced','collected','outstanding','invoices','missingPaymentSummary']) sum[key] += row[key] || 0
    }
    return Array.from(grouped.values())
  }, [data])
  const control = 'rounded-lg border border-white/15 bg-[#11151b] p-2 text-sm text-white min-w-0'
  return <div className="h-full overflow-y-auto bg-[#090c10] px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] text-neutral-200">
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/tasks" className="text-sm text-cyan-300">← Task Hub</Link><h1 className="mt-2 text-2xl font-bold">Task outcomes & revenue</h1><p className="mt-1 text-sm text-neutral-400">{data?.scope || 'Authorized tasks'} · recorded results and linked financial documents</p></div><button disabled={loading} onClick={() => setVersion(v => v+1)} className={control}>Refresh report</button></div>
      <div className="flex flex-wrap gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4">
        <label className="flex min-w-0 flex-col gap-1 text-xs">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={control}/></label>
        <label className="flex min-w-0 flex-col gap-1 text-xs">Through<input type="date" value={through} onChange={e => setThrough(e.target.value)} className={control}/></label>
        <label className="flex flex-col gap-1 text-xs">Breakdown<select value={bucket} onChange={e => setBucket(e.target.value)} className={control}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-red-200">{error}</p>}
      {loading && <p role="status" className="text-neutral-400">Loading report…</p>}
      {!loading && !error && data && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{[['Outcomes',totals.outcomes],['Completions',totals.completed],['Recorded wins',totals.won],['Win / loss rate',totals.won+totals.lost ? `${Math.round(100*totals.won/(totals.won+totals.lost))}%` : '—'],['No answer',totals.noAnswer],['Next steps',totals.followUps]].map(([label,value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs text-neutral-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
        <p className="text-xs text-neutral-400">Win / loss rate = recorded wins ÷ recorded wins and losses. Legacy completions without a saved outcome are not reconstructed or counted as recorded results.</p>
        {financials.length ? financials.map(row => <section key={row.currency} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><h2 className="font-semibold">Linked invoice results · {row.currency}</h2><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">{[['Invoiced',row.invoiced],['Recorded payments',row.collected],['Outstanding',row.outstanding]].map(([label,value]) => <div key={label}><p className="text-xs text-neutral-400">{label}</p><p className="mt-1 text-xl font-bold">{money(Number(value),row.currency)}</p></div>)}</div><p className="mt-3 text-xs text-neutral-400">{row.invoices} unique linked invoices{row.missingPaymentSummary ? ` · ${row.missingPaymentSummary} lack complete payment summaries; missing amounts are excluded.` : ''}</p></section>) : <p className="rounded-xl border border-white/10 p-4 text-sm text-neutral-400">No eligible invoices linked to outcomes in this range. Link an invoice when completing a task to measure results.</p>}
        <p className="text-xs leading-relaxed text-neutral-400">Financial totals reflect saved invoice/payment snapshots, not new money collected during this date range or proof that a task caused a sale. Each invoice is counted once in the selected range, under its earliest linked outcome. Draft, void, cancelled and written-off invoices are excluded. No live provider sync is triggered.</p>
        <section className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[720px] text-left text-sm"><caption className="p-4 text-left font-semibold">{bucket === 'day' ? 'Daily' : bucket === 'week' ? 'Weekly (Monday start)' : 'Monthly'} breakdown</caption><thead className="bg-white/5 text-xs text-neutral-400"><tr>{['Period','Outcomes','Completions','Wins / losses','Next steps','Linked invoiced / paid'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{data.buckets.map((row:any) => <tr key={row.bucket} className="border-t border-white/10"><td className="p-3">{row.bucket}</td><td className="p-3">{row.outcomes}</td><td className="p-3">{row.completed}</td><td className="p-3">{row.won} / {row.lost}</td><td className="p-3">{row.followUps}</td><td className="p-3">{data.revenue.filter((r:any) => r.bucket===row.bucket).map((r:any) => <div key={r.currency}>{money(r.invoiced,r.currency)} / {money(r.collected,r.currency)}</div>)}</td></tr>)}</tbody></table>{!data.buckets.length && <p className="p-4 text-sm text-neutral-400">No recorded outcomes in this range.</p>}</section>
        <section><h2 className="mb-3 text-lg font-semibold">Recent outcomes <span className="text-xs font-normal text-neutral-500">latest 50 in this range</span></h2><div className="space-y-3">{data.recent.map((row:any) => <article key={row.id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{row.subject}</h3><span className="text-xs text-cyan-300">{row.outcomeType.replaceAll('_',' ')}</span></div><p className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap">{row.summary}</p>{row.nextAction && <p className="mt-2 text-sm text-emerald-300">Next: {row.nextAction}{row.followUpAt ? ` · ${new Date(row.followUpAt).toLocaleString()}` : ''}</p>}<div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400"><span>{new Date(row.createdAt).toLocaleString()} · {row.actorName || 'Unknown actor'}</span>{row.accountId && <Link className="text-cyan-300" href={`/account?id=${encodeURIComponent(row.accountId)}`}>{row.accountName || 'Open account'}</Link>}</div></article>)}</div></section>
      </>}
    </div>
  </div>
}
