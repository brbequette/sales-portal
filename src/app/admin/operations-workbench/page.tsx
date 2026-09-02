"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { FiAlertTriangle, FiCheckCircle, FiClock, FiExternalLink, FiRefreshCw, FiRotateCw, FiSearch } from "react-icons/fi"

type QueueRow = {
  id: string; kind: string; entityType: string; entityId: string; number?: string | null; title: string
  stage: string; owner?: string | null; dueAt?: string | null; priority: number; blocker?: string | null
  href?: string | null; actionId?: string
}

const labels: Record<string, string> = { WORK: "Assigned work", ZOHO_FAILURE: "Zoho failure", UNMATCHED: "Unmatched record", EMAIL_REVIEW: "Email review", TASK: "Follow-up" }

export default function OperationsWorkbenchPage() {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("ALL")
  const [metrics, setMetrics] = useState<Record<string, number | null>>({})
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [response, scoreResponse] = await Promise.all([fetch("/api/operations/work-queue", { cache: "no-store" }), fetch("/api/operations/scorecard", { cache: "no-store" })])
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to load work")
      setRows(data.rows || [])
      if (scoreResponse.ok) setMetrics((await scoreResponse.json()).metrics || {})
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load work") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => rows.filter(row => {
    if (kind !== "ALL" && row.kind !== kind) return false
    const haystack = `${row.title} ${row.number || ""} ${row.owner || ""} ${row.stage} ${row.blocker || ""}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  }), [rows, query, kind])
  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.kind]: (acc[row.kind] || 0) + 1 }), {}), [rows])
  const retry = async (row: QueueRow) => {
    if (!row.actionId) return
    const response = await fetch(`/api/operations/actions/${row.actionId}`, { method: "POST" })
    const data = await response.json()
    if (!response.ok) return toast.error(data.error || "Retry could not be queued")
    toast.success(data.receipt?.message || "Retry queued")
    await load()
  }
  return <div className="flex-1 overflow-y-auto p-4 md:p-7">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-xs font-black uppercase tracking-[.2em] text-orange-400">Company command center</div><h1 className="text-2xl font-black text-white">Operational work queue</h1><p className="mt-1 text-sm text-neutral-400">One prioritized view of handoffs, Zoho failures, unmatched records, email reviews, and due follow-ups.</p></div>
      <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><FiRefreshCw className={loading ? "animate-spin" : ""}/>Refresh</button>
    </header>
    <section className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      {[['First-attempt success',metrics.firstAttemptSuccessRate,'%'],['Failed writes',metrics.failedActions,''],['Avg. cycle',metrics.averageCycleHours,'h'],['Active work',metrics.activeWork,''],['Overdue work',metrics.overdueWork,''],['Tracked shipments',metrics.shipmentTrackingRate,'%']].map(([label,value,suffix])=><div key={String(label)} className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[.04] to-transparent p-3"><div className="text-[10px] font-black uppercase tracking-wider text-neutral-600">{label}</div><div className="mt-1 text-xl font-black text-white">{value==null?'—':`${value}${suffix}`}</div><div className="text-[10px] text-neutral-600">Last 30 days</div></div>)}
    </section>
    <section className="mb-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <button onClick={() => setKind("ALL")} className={`rounded-xl border p-3 text-left ${kind === "ALL" ? "border-orange-500/50 bg-orange-500/10" : "border-white/10 bg-white/[.025]"}`}><div className="text-2xl font-black text-white">{rows.length}</div><div className="text-xs text-neutral-500">All active</div></button>
      {Object.entries(labels).map(([id, label]) => <button key={id} onClick={() => setKind(id)} className={`rounded-xl border p-3 text-left ${kind === id ? "border-orange-500/50 bg-orange-500/10" : "border-white/10 bg-white/[.025]"}`}><div className="text-2xl font-black text-white">{counts[id] || 0}</div><div className="text-xs text-neutral-500">{label}</div></button>)}
    </section>
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><FiSearch className="text-neutral-600"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customer, document, owner, stage, or blocker" className="h-11 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-600"/></div>
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e13]">
      {!loading && !filtered.length && <div className="grid min-h-48 place-items-center text-center"><div><FiCheckCircle className="mx-auto mb-2 text-3xl text-emerald-400"/><div className="font-bold text-white">No work matches this view</div><div className="text-sm text-neutral-500">The selected operational queue is clear.</div></div></div>}
      {filtered.map(row => {
        const overdue = row.dueAt && new Date(row.dueAt) < new Date()
        return <div key={row.id} className="grid gap-3 border-b border-white/5 p-4 last:border-0 md:grid-cols-[minmax(0,1fr)_150px_150px_auto] md:items-center">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${row.priority >= 90 ? "bg-red-500/15 text-red-300" : row.priority >= 80 ? "bg-amber-500/15 text-amber-300" : "bg-sky-500/15 text-sky-300"}`}>{labels[row.kind] || row.kind}</span>{row.number && <span className="font-mono text-xs text-neutral-500">{row.number}</span>}</div><div className="mt-2 truncate font-bold text-white">{row.title}</div>{row.blocker && <div className="mt-1 flex items-start gap-1 text-xs text-amber-300"><FiAlertTriangle className="mt-0.5 shrink-0"/>{row.blocker}</div>}</div>
          <div><div className="text-[10px] font-black uppercase text-neutral-600">Stage</div><div className="text-sm font-bold text-neutral-300">{row.stage}</div></div>
          <div><div className="text-[10px] font-black uppercase text-neutral-600">Owner / deadline</div><div className="text-sm text-neutral-300">{row.owner || "UNASSIGNED"}</div>{row.dueAt && <div className={`flex items-center gap-1 text-xs ${overdue ? "text-red-400" : "text-neutral-500"}`}><FiClock/>{new Date(row.dueAt).toLocaleString()}</div>}</div>
          <div className="flex gap-2">{row.actionId && <button onClick={() => void retry(row)} className="flex items-center gap-1 rounded-lg bg-orange-500/15 px-3 py-2 text-xs font-bold text-orange-300"><FiRotateCw/>Queue retry</button>}{row.href && <Link href={row.href} className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-white">Open<FiExternalLink/></Link>}</div>
        </div>
      })}
    </div>
  </div>
}
