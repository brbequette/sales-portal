'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CollectionOverview } from '@/components/CollectionOverview'
import { collectionDay, collectionPeriod, type CollectionActivity, type CollectionReceipt, type CollectionsReportSettings } from '@/lib/collections-stats'
import { COLLECTIONS_BONUS_TIERS } from '@/lib/collections-compensation'

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const percent = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : '—'
type Plan = { id: string; repId: string; name: string; startDate: string; endDate: string | null; payType: string; baseAmount: number | null; baseInterval: string | null }
type Report = { calls: CollectionActivity[]; receipts: CollectionReceipt[]; collectors?: [string, string][]; settings: CollectionsReportSettings; canEdit: boolean; company: boolean; managerId: string | null; userId: string; plans: Plan[]; excludedPayments: number; generatedAt: string }
type Bonus = { id: string; repId: string; repName: string; paymentDate: string; amount: number; commission: { total: number } }

export default function CollectionsStatsPage() {
  const today = collectionDay(new Date())
  const [start, setStart] = useState(today.slice(0, 7) + '-01'), [end, setEnd] = useState(today)
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('daily'), [collector, setCollector] = useState('all'), [revision, setRevision] = useState(0)
  const [settings, setSettings] = useState<CollectionsReportSettings | null>(null), [saving, setSaving] = useState(false), [saved, setSaved] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null), [tab, setTab] = useState('results')
  const [bonuses, setBonuses] = useState<Bonus[] | null>(null), [bonusError, setBonusError] = useState('')
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setReport(null); setExpanded(null)
    fetch(`/api/collections/stats?start=${start}&end=${end}`, { signal: controller.signal }).then(async res => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not load statistics')
      if (!controller.signal.aborted) { setReport(data); setSettings(data.settings) }
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [start, end, revision])
  useEffect(() => {
    if (tab !== 'earnings') return
    const controller = new AbortController(); setBonusError(''); setBonuses(null)
    fetch('/api/get-commissions?year=all', { signal: controller.signal }).then(async res => {
      const data = await res.json(); if (!res.ok || data.success === false) throw new Error(data.error || 'Compensation records unavailable')
      if (!controller.signal.aborted) setBonuses(Object.values(data.byRep || {}).flatMap((rep: any) => (rep.invoices || []).filter((i: any) => String(i.id).startsWith('bonus-'))))
    }).catch(e => { if (e.name !== 'AbortError') setBonusError(e.message) })
    return () => controller.abort()
  }, [tab, revision])
  const calls = useMemo(() => (report?.calls || []).filter(c => collector === 'all' || c.actorId === collector), [report, collector])
  const receipts = useMemo(() => (report?.receipts || []).filter(r => collector === 'all' || r.collector === collector), [report, collector])
  const actors = useMemo(() => report?.collectors || [...new Map((report?.calls || []).map(c => [c.actorId, c.actor])).entries()], [report])
  const reached = calls.filter(c => c.reached).length
  const minutes = calls.reduce((s, c) => s + (c.minutes || 0), 0), timed = calls.filter(c => c.minutes !== null).length
  const recovered = receipts.reduce((s, r) => s + r.amount, 0)
  const attributed = receipts.filter(r => r.collector).reduce((s, r) => s + r.amount, 0)
  const successful = calls.filter(c => receipts.some(r => r.callId === c.id)).length
  const promises = calls.filter(c => c.promiseDate), promisePaid = promises.filter(c => receipts.some(r => r.callId === c.id && r.date <= c.promiseDate!)).length
  const followUps = calls.filter(c => c.followUpDate && c.followUpDate <= today && !report?.calls.some(later => later.accountId === c.accountId && later.date > c.date && collectionDay(later.date) >= c.followUpDate!))
  const rows = useMemo(() => {
    const map = new Map<string, { calls: number; reached: number; minutes: number; amount: number; attributed: number }>()
    const row = (day: string) => { const key = collectionPeriod(day, period); if (!map.has(key)) map.set(key, { calls: 0, reached: 0, minutes: 0, amount: 0, attributed: 0 }); return map.get(key)! }
    // Keep zero-activity days visible, including in weekly/monthly totals.
    if (report) for (let day = new Date(start + 'T12:00:00Z'); day <= new Date(end + 'T12:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) row(day.toISOString().slice(0, 10))
    calls.forEach(c => { const r = row(collectionDay(c.date)); r.calls++; r.reached += +c.reached; r.minutes += c.minutes || 0 })
    receipts.forEach(p => { const r = row(p.date); r.amount += p.amount; if (p.collector) r.attributed += p.amount })
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [calls, receipts, period, start, end, report])
  const hourly = calls.map(c => {
    const plans = (report?.plans || []).filter(p => p.repId === c.actorId && c.date >= p.startDate && (!p.endDate || c.date <= p.endDate))
    const p = plans.length === 1 ? plans[0] : null
    return { ...c, estimated: p?.payType === 'HOURLY' && p.baseInterval === 'HOURLY' && p.baseAmount !== null && c.minutes !== null ? p.baseAmount * c.minutes / 60 : null }
  })
  const periodBonuses = bonuses?.filter(b => (collector === 'all' || b.repId === collector) && b.paymentDate?.slice(0, 10) >= start && b.paymentDate.slice(0, 10) <= end) || []
  const box = 'rounded-xl border border-white/10 bg-white/[0.025] p-4'
  async function saveSettings() {
    setSaving(true); setSaved('')
    try {
      const res = await fetch('/api/collections/stats', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      const data = await res.json(); if (!res.ok) throw new Error(data.error)
      setSaved('Reporting settings saved. Compensation rates were not changed.'); setRevision(r => r + 1)
    } catch (e) { setSaved(e instanceof Error ? e.message : 'Save failed') } finally { setSaving(false) }
  }
  return <div className="page-content"><div className="page-header flex-wrap gap-3"><div><h1 className="page-title">Collections performance</h1><p className="page-subtitle">Recovery, call results and compensation • Arizona time</p></div><Link className="td-btn" href="/collections">Back to collections</Link></div>
    <div className="page-body space-y-5 pb-28">
      <div className={`${box} flex flex-wrap items-end gap-4`}>
        <label>From<input aria-label="From date" className="block rounded border p-2 bg-black text-white" type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>Through<input aria-label="Through date" className="block rounded border p-2 bg-black text-white" type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <label>Collector<select className="block rounded border p-2 bg-black text-white max-w-full" value={collector} onChange={e => setCollector(e.target.value)}><option value="all">All visible activity</option>{actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <button className="td-btn" disabled={loading} onClick={() => setRevision(v => v + 1)}>Refresh saved data</button>
      </div>
      {loading && <p role="status">Loading collections records…</p>}{error && <p role="alert" className="text-red-400">{error}</p>}
      {report && <>
        <p className="text-sm text-neutral-400">{report.company ? 'Company account scope' : 'Your accounts only'}. Saved records as of {new Date(report.generatedAt).toLocaleString()}. No provider sync is run by this page.</p>
        <nav aria-label="Collections report sections" className="flex flex-wrap gap-2">{['results', 'calls', 'payments', 'earnings', 'settings'].map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={`td-btn capitalize ${tab === t ? 'bg-cyan-800' : ''}`}>{t}</button>)}</nav>
        {tab === 'results' && <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[
            ['Overdue payments received', money(recovered)], ['Attributed to collection contacts', money(attributed)], ['Calls logged', calls.length], ['Contact rate', percent(reached, calls.length)],
            ['Calls followed by payment', `${percent(successful, calls.length)} (${successful}/${calls.length})`], ['Logged call minutes', minutes.toFixed(1)], ['Average timed call', timed ? `${(minutes / timed).toFixed(1)} min` : '—'], ['Promises with payment by date', `${promisePaid}/${promises.length}`],
          ].map(([label, value]) => <div key={label} className={box}><p className="text-xs text-neutral-400">{label}</p><p className="mt-2 text-xl font-bold break-words">{value}</p></div>)}</div>
          <div className={box}><p>Today’s logged calls: {calls.filter(c => collectionDay(c.date) === today).length} / {report.settings.dailyCallGoal} goal (within selected range).</p><p>Monthly recovery goal: {money(report.settings.monthlyRecoveryGoal)}. Compare against a complete calendar month.</p><p>Follow-ups due with no later logged call in this report: {followUps.length}.</p></div>
          <div className="flex gap-2">{['daily', 'weekly', 'monthly'].map(p => <button key={p} aria-pressed={period === p} className={`td-btn capitalize ${period === p ? 'bg-cyan-800' : ''}`} onClick={() => setPeriod(p)}>{p}</button>)}</div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="text-left text-neutral-400 mb-3">Weekly periods start Monday. Edge periods include only selected dates.</caption><thead><tr>{['Period', 'Collected', 'Attributed', 'Calls', 'Contacts', 'Minutes'].map(h => <th className="p-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(([day, r]) => <tr key={day} className="border-t border-white/10"><td className="p-3 whitespace-nowrap">{day}</td><td>{money(r.amount)}</td><td>{money(r.attributed)}</td><td>{r.calls}</td><td>{r.reached}</td><td>{r.minutes.toFixed(1)}</td></tr>)}</tbody></table></div>
        </>}
        {tab === 'calls' && <><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...new Set(calls.map(c => c.outcome))].map(outcome => <div className={box} key={outcome}><p>{outcome}</p><strong>{calls.filter(c => c.outcome === outcome).length}</strong></div>)}</div><p className="text-sm text-neutral-400">Manual collection logs, not provider-verified attempts or talk time. {calls.length - timed} calls have no recorded duration. Legacy notes are included once and do not receive automatic payment attribution.</p>
          <div className="space-y-2">{calls.length === 0 && <p>No collection calls logged in this range.</p>}{[...calls].sort((a, b) => b.date.localeCompare(a.date)).map(c => <details key={c.id} className={box}><summary className="cursor-pointer">{collectionDay(c.date)} · {c.actor} · {c.account} · {c.outcome}</summary><div className="mt-3 space-y-2"><p>{c.reached ? 'Contact reached' : 'No contact recorded'} · {c.minutes === null ? 'Duration unknown' : `${c.minutes} minutes`} · {c.legacy ? 'Legacy note' : `${c.invoiceIds.length} invoices discussed`}</p><p>Promise date: {c.promiseDate || 'None'} · Follow-up: {c.followUpDate || 'None'}</p>{c.invoiceIds.map(id => <div key={id}><button className="td-btn" onClick={() => setExpanded(expanded === id ? null : id)}>Open invoice overview</button>{expanded === id && <CollectionOverview invoiceId={id} />}</div>)}</div></details>)}</div></>}
        {tab === 'payments' && <div className="space-y-3"><p className="text-sm text-neutral-400">Positive saved payment records received after the invoice due date. Unattributed payments still count as overdue cash received. {report.excludedPayments} records excluded for nonpositive amounts or unconfirmed status. This is gross receipts, not a net-of-refunds ledger.</p>{receipts.length === 0 && <p>No qualifying saved overdue payments in this range.</p>}{receipts.map(r => <div className={box} key={r.id}><button className="w-full text-left flex flex-wrap gap-3 justify-between" aria-expanded={expanded === `payment-${r.id}`} onClick={() => setExpanded(expanded === `payment-${r.id}` ? null : `payment-${r.id}`)}><span>{r.date} · {r.account} · Invoice {r.invoice}</span><strong>{money(r.amount)}</strong></button><p className="text-xs text-neutral-400 mt-2">{r.collector ? `Attributed contact: ${actors.find(a => a[0] === r.collector)?.[1] || 'Prior-period collector'}` : 'No qualifying prior contact recorded'}</p>{expanded === `payment-${r.id}` && <CollectionOverview invoiceId={r.invoiceId} />}</div>)}</div>}
        {tab === 'earnings' && <div className="space-y-4"><div className={box}><h2 className="text-lg font-bold">Collections bonus from compensation statements</h2><p className="text-sm text-neutral-400 mt-2">Uses your authorized commission statement records and the configured collections manager. The existing policy uses paid-invoice subtotals, including its legacy payment-date fallbacks; it is separate from verified overdue receipts above. Weekly bonuses are assigned to the Monday shown below, not distributed as daily earnings. Statement calculation is not proof of payout.</p><p className="mt-2">{COLLECTIONS_BONUS_TIERS.map(t => `${money(t.minimum)} → ${(t.rate * 100).toFixed(2)}%`).join(' · ')}</p>{bonusError ? <p role="alert" className="text-red-400">{bonusError}</p> : bonuses === null ? <p>Loading compensation records…</p> : <><p className="text-2xl font-bold mt-4">{money(periodBonuses.reduce((s, b) => s + b.commission.total, 0))}</p>{periodBonuses.length === 0 && <p>No collections bonuses returned by your authorized statement for weeks starting in this range. This does not certify that no bonus is owed.</p>}{periodBonuses.map(b => <p key={b.id}>{b.paymentDate.slice(0, 10)} · {b.repName} · Basis {money(b.amount)} · Bonus {money(b.commission.total)}</p>)}</>}<Link className="td-btn mt-3" href="/commissions">Open compensation statement</Link></div>
          <div className={box}><h2 className="text-lg font-bold">Hourly effort estimate</h2><p className="text-2xl font-bold">{money(hourly.reduce((s, c) => s + (c.estimated || 0), 0))}</p><p className="text-sm text-neutral-400">Logged duration × the hourly plan in effect on the call date, from admin compensation settings. {hourly.filter(c => c.estimated !== null).length}/{calls.length} calls have an unambiguous eligible plan and duration. Salary, draws and sales-profit commissions cannot be allocated to collection calls from these records. Other users’ rates are visible only to administrators. This estimate is not approved payroll.</p></div></div>}
        {tab === 'settings' && settings && <div className={`${box} space-y-4`}><h2 className="text-lg font-bold">Collections reporting settings</h2><p>Goals are reporting targets, not compensation rates. Changing the attribution window recalculates historical report attribution.</p>{([
          ['attributionDays', 'Payment attribution window (days)', 1, 365], ['dailyCallGoal', 'Daily logged-call goal', 0, 1000], ['monthlyRecoveryGoal', 'Monthly overdue recovery goal ($)', 0, 100000000],
        ] as const).map(([key, label, min, max]) => <label key={key} className="block">{label}<input type="number" min={min} max={max} step={1} disabled={!report.canEdit} className="block bg-black border rounded p-2 mt-1 max-w-full" value={settings[key]} onChange={e => setSettings({ ...settings, [key]: Number(e.target.value) })} /></label>)}{report.canEdit && <button className="td-btn" disabled={saving} onClick={saveSettings}>{saving ? 'Saving…' : 'Save reporting settings'}</button>}<p role="status">{saved}</p><div className="flex flex-wrap gap-3">{report.canEdit && <><Link className="td-btn" href="/admin/compensation">Compensation plans</Link><Link className="td-btn" href="/admin/update-config">Collections manager assignment</Link></>}</div></div>}
        <details className={`${box} text-sm text-neutral-400`}><summary className="cursor-pointer text-white">How these numbers are calculated</summary><div className="space-y-2 mt-3"><p>Contact rate = reached contacts ÷ logged calls. Payment success = calls with an attributed payment ÷ logged calls. One call covering several invoices counts once.</p><p>A payment is attributed once to the latest structured, reached contact on the same invoice within {report.settings.attributionDays} days. Same-day contacts are excluded because payment records lack reliable time-of-day. Attribution is an association, not proof the call caused payment.</p><p>Promise result means at least one attributed payment by the promised date; it does not prove the full promised amount was paid. Results are observed only through the selected end date. Legacy logs and missing payment records reduce coverage.</p><p>Payments are counted by their saved accounting date. Calls use Arizona time. Partial periods, historical attribution settings and existing compensation statement policies can produce different totals. No demo data is inserted.</p></div></details>
      </>}
    </div></div>
}
