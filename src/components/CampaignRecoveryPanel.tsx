"use client"
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useEffect, useState } from "react"

export function CampaignRecoveryPanel() {
  const [jobs, setJobs] = useState<any[]>([]); const [error, setError] = useState("")
  const [detail, setDetail] = useState<any[]>([]); const [filter, setFilter] = useState("ALL")
  const load = async () => { const response = await fetch("/api/admin/campaign-recovery", { cache: "no-store" }); const data = await response.json(); if (response.ok) setJobs(data.jobs || []); else setError(data.error || "Recovery status unavailable") }
  useEffect(() => { void load() }, [])
  const resume = async (jobId: string) => { const response = await fetch("/api/admin/campaign-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume-pending", jobId }) }); if (!response.ok) setError((await response.json()).error); else void load() }
  const review = async (jobId: string) => { const response = await fetch(`/api/admin/campaign-recovery?jobId=${jobId}`, { cache: "no-store" }); const data = await response.json(); setDetail(data.recipients || []) }
  const retryAmbiguous = async (jobId: string, recipientId: string) => { if (window.prompt('Type RETRY AMBIGUOUS RECIPIENT to authorize one reviewed retry') !== 'RETRY AMBIGUOUS RECIPIENT') return; await fetch('/api/admin/campaign-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry-ambiguous', jobId, recipientId, confirmation: 'RETRY AMBIGUOUS RECIPIENT' }) }); void review(jobId) }
  return <section className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
    <h2 className="text-lg font-bold text-white">Server-side Campaign Recovery &amp; After Send Review</h2>
    <p className="mt-1 text-sm text-neutral-400">Workers continue without an open browser. Accepted means provider submission only; delivery receipts are tracked separately.</p>
    {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    <div className="mt-4 space-y-3">{jobs.map(job => <article key={job.id} className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-white">{job.name}</strong><span className="ml-2 text-neutral-400">{job.status} · {job.reviewState}</span></div><div className="flex gap-2"><button className="rounded border border-white/20 px-2 py-1 text-cyan-300" onClick={() => void review(job.id)}>Review recipients</button><a className="rounded border border-white/20 px-2 py-1 text-cyan-300" href={`/api/admin/campaign-recovery?exportJob=${job.id}`}>JSON export</a>{!["LEGACY_QUARANTINED","COMPLETED","COMPLETED_WITH_ERRORS","CANCELLED"].includes(job.status) && <button className="rounded bg-emerald-700 px-2 py-1 text-white" onClick={() => void resume(job.id)}>Resume pending</button>}</div></div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-300">{Object.entries(job.recipientCounts || {}).map(([state,count]) => <span key={state}>{state}: {String(count)}</span>)}</div>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-400">{Object.entries(job.deliveryCounts || {}).map(([state,count]) => <span key={state}>{state}: {String(count)}</span>)}</div>
      {job.status === "LEGACY_QUARANTINED" && <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-red-200">No ordinary resume. {job.quarantineReason} Recorded accepted: {job.legacyRecordedAccepted ?? 0}; failed: {job.legacyRecordedFailed ?? 0}; raw missing results: {job.legacyRawMissingCount ?? 0}. Missing never means safe to resend.</div>}
    </article>)}</div>
    {detail.length > 0 && <div className="mt-5 rounded-lg border border-white/10 p-3"><div className="mb-2 flex items-center justify-between"><strong>Recipient review queue</strong><select value={filter} onChange={event => setFilter(event.target.value)} className="bg-neutral-900 p-1"><option>ALL</option>{["PENDING","LEASED","SENDING","ACCEPTED","FAILED","AMBIGUOUS","SKIPPED"].map(value => <option key={value}>{value}</option>)}</select></div>{detail.filter(row => filter === "ALL" || row.state === filter || row.deliveryStatus === filter.toLowerCase()).map(row => <div key={row.id} className="flex flex-wrap justify-between border-t border-white/5 py-2 text-xs"><span>#{row.originalIndex} · {row.normalizedPhone} · {row.state} · {row.deliveryStatus} · {row.lastProviderCode || "no code"} · {row.dispositionReason || row.lastProviderMessage || ""}</span>{row.state === "AMBIGUOUS" && <button className="text-amber-300" onClick={() => void retryAmbiguous(row.campaignJobId || jobs.find(job => job.recipientCounts?.AMBIGUOUS)?.id, row.id)}>Review one retry</button>}</div>)}</div>}
  </section>
}
