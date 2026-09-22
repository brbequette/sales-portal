"use client"
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useEffect, useState } from "react"

export function CampaignRecoveryPanel() {
  const [jobs, setJobs] = useState<any[]>([]); const [error, setError] = useState("")
  const load = async () => { const response = await fetch("/api/admin/campaign-recovery", { cache: "no-store" }); const data = await response.json(); if (response.ok) setJobs(data.jobs || []); else setError(data.error || "Recovery status unavailable") }
  useEffect(() => { void load() }, [])
  const resume = async (jobId: string) => { const response = await fetch("/api/admin/campaign-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume-pending", jobId }) }); if (!response.ok) setError((await response.json()).error); else void load() }
  return <section className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
    <h2 className="text-lg font-bold text-white">Server-side Campaign Recovery &amp; After Send Review</h2>
    <p className="mt-1 text-sm text-neutral-400">Workers continue without an open browser. Accepted means provider submission only; delivery receipts are tracked separately.</p>
    {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    <div className="mt-4 space-y-3">{jobs.map(job => <article key={job.id} className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-white">{job.name}</strong><span className="ml-2 text-neutral-400">{job.status} · {job.reviewState}</span></div><div className="flex gap-2"><a className="rounded border border-white/20 px-2 py-1 text-cyan-300" href={`/api/admin/campaign-recovery?exportJob=${job.id}`}>Export review</a>{!["LEGACY_QUARANTINED","COMPLETED","COMPLETED_WITH_ERRORS","CANCELLED"].includes(job.status) && <button className="rounded bg-emerald-700 px-2 py-1 text-white" onClick={() => void resume(job.id)}>Resume pending</button>}</div></div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-300">{Object.entries(job.recipientCounts || {}).map(([state,count]) => <span key={state}>{state}: {String(count)}</span>)}</div>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-400">{Object.entries(job.deliveryCounts || {}).map(([state,count]) => <span key={state}>{state}: {String(count)}</span>)}</div>
      {job.status === "LEGACY_QUARANTINED" && <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-red-200">No ordinary resume. {job.quarantineReason} Recorded accepted: {job.legacyRecordedAccepted ?? 0}; failed: {job.legacyRecordedFailed ?? 0}; raw missing results: {job.legacyRawMissingCount ?? 0}. Missing never means safe to resend.</div>}
    </article>)}</div>
  </section>
}
