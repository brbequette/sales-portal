"use client"

import { useCallback, useEffect, useState } from "react"
import { FiCheck, FiDatabase, FiLoader, FiPause, FiRefreshCw, FiX } from "react-icons/fi"

type Recommendation = {
  id: string
  title: string
  rationale: string
  triggerType: string
  mode: string
  status: string
  conditions: unknown
  actions: unknown
  evidence: unknown
  simulation: unknown
  account?: { name: string } | null
  createdAt: string
}

export default function AutomationOpportunitiesPage() {
  const [items, setItems] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [indexing, setIndexing] = useState(false)
  const [indexResult, setIndexResult] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/automation-recommendations?status=PROPOSED")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to load recommendations")
      setItems(data.recommendations || [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load recommendations")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function indexRealEvents() {
    setIndexing(true)
    setError("")
    setIndexResult("")
    try {
      const response = await fetch("/api/admin/communications/index-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1000 }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Indexing failed")
      const indexed = data.indexed || {}
      setIndexResult(`Indexed source records: ${indexed.calls || 0} calls, ${indexed.messages || 0} messages, ${indexed.emails || 0} emails. Existing events were updated idempotently.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Indexing failed")
    } finally {
      setIndexing(false)
    }
  }

  async function review(id: string, status: "APPROVED" | "REJECTED" | "PAUSED") {
    const rejectionReason = status === "REJECTED" ? window.prompt("Why should this recommendation be rejected?") : undefined
    if (status === "REJECTED" && !rejectionReason?.trim()) return
    setWorking(id)
    setError("")
    try {
      const response = await fetch("/api/admin/automation-recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, rejectionReason }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Review failed")
      setItems(current => current.filter(item => item.id !== id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review failed")
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Human approval required</div>
          <h1 className="text-3xl font-black text-white">Automation Opportunity Inbox</h1>
          <p className="mt-1 text-sm text-neutral-400">AI can suggest patterns; every recommendation remains draft-only until reviewed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={indexing} onClick={() => void indexRealEvents()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-500/30 px-4 text-sm font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">{indexing ? <FiLoader className="animate-spin" /> : <FiDatabase />} Index real records</button>
          <button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-white hover:bg-white/5"><FiRefreshCw /> Refresh</button>
        </div>
      </div>
      {indexResult && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{indexResult}</div>}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
      {loading ? <div className="flex items-center gap-2 text-neutral-400"><FiLoader className="animate-spin" /> Loading recommendations…</div> : items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-10 text-center text-neutral-400">No recommendations are waiting for review.</div>
      ) : <div className="grid gap-4">{items.map(item => (
        <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-xs font-bold uppercase tracking-wider text-amber-400">{item.triggerType.replaceAll("_", " ")}</div><h2 className="text-lg font-black text-white">{item.title}</h2><div className="text-xs text-neutral-500">{item.account?.name || "System-wide"} · {new Date(item.createdAt).toLocaleString()}</div></div>
            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">{item.mode}</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-neutral-300">{item.rationale}</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <JsonBlock label="Conditions" value={item.conditions} /><JsonBlock label="Proposed actions" value={item.actions} /><JsonBlock label="Simulation" value={item.simulation} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={working === item.id} onClick={() => void review(item.id, "APPROVED")} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-black text-black disabled:opacity-50"><FiCheck /> Approve draft</button>
            <button disabled={working === item.id} onClick={() => void review(item.id, "PAUSED")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-500/30 px-4 text-sm font-bold text-amber-300 disabled:opacity-50"><FiPause /> Pause</button>
            <button disabled={working === item.id} onClick={() => void review(item.id, "REJECTED")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-500/30 px-4 text-sm font-bold text-red-300 disabled:opacity-50"><FiX /> Reject</button>
          </div>
        </article>
      ))}</div>}
    </div>
  )
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-xl bg-black/30 p-3"><div className="mb-2 text-[10px] font-black uppercase tracking-wider text-neutral-500">{label}</div><pre className="whitespace-pre-wrap break-words text-xs text-neutral-300">{JSON.stringify(value, null, 2)}</pre></div>
}
