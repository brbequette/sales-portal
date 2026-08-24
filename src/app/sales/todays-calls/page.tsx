"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { FiClock, FiLoader, FiPhone, FiRefreshCw, FiUser } from "react-icons/fi"

type QueueItem = {
  id: string
  name: string
  status: string
  timeZone?: string | null
  score: number
  reasons: string[]
  recommendedReason: string
  phone?: string | null
  primaryContact?: { firstName?: string | null; lastName?: string | null; designation?: string | null } | null
  tasks: Array<{ id: string; subject: string; priority: string; dueDate?: string | null }>
  callLogs: Array<{ status: string; aiSummary?: string | null; createdAt: string }>
  communicationEvents: Array<{ channel: string; eventType: string; summary?: string | null; occurredAt: string }>
}

export default function TodaysCallsPage() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/sales/todays-calls")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to build call queue")
      setQueue(data.queue || [])
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to build call queue") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">Sales execution</div><h1 className="text-3xl font-black text-white">Today&apos;s Calls</h1><p className="mt-1 text-sm text-neutral-400">Accounts ranked by due commitments, inactivity and follow-up urgency.</p></div><button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-white hover:bg-white/5"><FiRefreshCw /> Refresh queue</button></div>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>}
    {loading ? <div className="flex items-center gap-2 text-neutral-400"><FiLoader className="animate-spin" /> Ranking accounts…</div> : queue.length === 0 ? <div className="rounded-2xl border border-white/10 p-10 text-center text-neutral-400">No calls are currently due.</div> : <div className="grid gap-4 xl:grid-cols-2">{queue.map((item, index) => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 font-black text-emerald-300">{index + 1}</div><div className="min-w-0"><h2 className="truncate text-lg font-black text-white">{item.name.toUpperCase()}</h2><div className="text-xs text-neutral-500">{item.status} · {item.timeZone || "Timezone unknown"}</div></div></div><div className="rounded-lg bg-amber-500/10 px-3 py-1 text-sm font-black text-amber-300">{item.score}</div></div>
      <div className="mt-4 rounded-xl bg-black/30 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Why call now</div><div className="mt-1 text-sm font-bold text-white">{item.recommendedReason}</div><div className="mt-2 flex flex-wrap gap-1.5">{item.reasons.map(reason => <span key={reason} className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-neutral-300">{reason}</span>)}</div></div>
      <div className="mt-4 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2"><div className="flex items-center gap-2"><FiUser className="text-emerald-400" />{[item.primaryContact?.firstName, item.primaryContact?.lastName].filter(Boolean).join(" ") || "Contact review needed"}</div><div className="flex items-center gap-2"><FiClock className="text-amber-400" />{item.tasks[0]?.subject || "Relationship follow-up"}</div></div>
      {item.callLogs[0]?.aiSummary && <p className="mt-3 line-clamp-2 text-xs text-neutral-400">Last call: {item.callLogs[0].aiSummary}</p>}
      <div className="mt-5 flex flex-wrap gap-2">{item.phone ? <a href={`tel:${item.phone}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-black text-black"><FiPhone /> Call {item.phone}</a> : <span className="inline-flex min-h-10 items-center rounded-lg border border-red-500/30 px-4 text-sm font-bold text-red-300">Missing phone</span>}<Link href={`/sales?accountId=${encodeURIComponent(item.id)}`} className="inline-flex min-h-10 items-center rounded-lg border border-white/10 px-4 text-sm font-bold text-white hover:bg-white/5">Open account</Link></div>
    </article>)}</div>}
  </div>
}
