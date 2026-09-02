"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { FiArrowRight, FiBarChart2, FiCheckCircle, FiExternalLink, FiLoader, FiPhone, FiRefreshCw, FiSearch, FiTarget, FiUser, FiUsers, FiZap } from "react-icons/fi"
import { SalesCallCoach } from "@/components/SalesCallCoach"

type QueueItem = {
  id: string; name: string; status: string; quality?: string | null; timeZone?: string | null
  score: number; reasons: string[]; recommendedReason: string; phone?: string | null
  primaryContact?: { id?: string; firstName?: string | null; lastName?: string | null; designation?: string | null } | null
  tasks: Array<{ id: string; subject: string; priority: string; dueDate?: string | null }>
  callLogs: Array<{ status: string; aiSummary?: string | null; createdAt: string }>
  communicationEvents: Array<{ channel: string; eventType: string; summary?: string | null; occurredAt: string }>
}

function useBrowserLocation() {
  return useSyncExternalStore(
    callback => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback) },
    () => window.location.search,
    () => "",
  )
}

function contactName(item: QueueItem) {
  return [item.primaryContact?.firstName, item.primaryContact?.lastName].filter(Boolean).join(" ") || "Contact review needed"
}

export default function TodaysCallsPage() {
  const router = useRouter()
  const locationSearch = useBrowserLocation()
  const locationParams = useMemo(() => new URLSearchParams(locationSearch), [locationSearch])
  const displayMode = locationParams.get("display") === "1"
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"ALL" | "URGENT" | "CALLABLE" | "RESEARCH">("ALL")
  const [working, setWorking] = useState(false)
  const [secondDisplayConnected, setSecondDisplayConnected] = useState(false)
  const [mobilePane, setMobilePane] = useState<"queue" | "call">("queue")

  useEffect(() => {
    setWorking(sessionStorage.getItem("titan-sales-workday-active") === "1")
    setSecondDisplayConnected(sessionStorage.getItem("titan-dual-screen-connected") === "1")
    const update = (event: Event) => setSecondDisplayConnected(Boolean((event as CustomEvent<{ connected?: boolean }>).detail?.connected))
    window.addEventListener("titan:dual-screen-status", update)
    return () => window.removeEventListener("titan:dual-screen-status", update)
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/sales/todays-calls")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to build call queue")
      const nextQueue: QueueItem[] = data.queue || []
      setQueue(nextQueue)
      setSelectedId(current => {
        const requested = new URLSearchParams(window.location.search).get("accountId")
        if (requested && nextQueue.some(item => item.id === requested)) return requested
        if (current && nextQueue.some(item => item.id === current)) return current
        return nextQueue[0]?.id || ""
      })
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to build call queue") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    // Initial queue hydration intentionally begins when the interactive workspace mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const chooseAccount = useCallback((id: string) => {
    setSelectedId(id)
    setMobilePane("call")
    const params = new URLSearchParams(window.location.search)
    params.set("accountId", id)
    router.replace(`/sales/todays-calls?${params.toString()}`, { scroll: false })
  }, [router])

  const filteredQueue = useMemo(() => queue.filter(item => {
    const needle = search.trim().toLowerCase()
    if (needle && !`${item.name} ${contactName(item)} ${item.phone || ""}`.toLowerCase().includes(needle)) return false
    if (filter === "URGENT" && item.score < 50) return false
    if (filter === "CALLABLE" && !item.phone) return false
    if (filter === "RESEARCH" && item.phone) return false
    return true
  }), [filter, queue, search])

  const selected = queue.find(item => item.id === selectedId) || null
  const urgentCount = queue.filter(item => item.score >= 50).length
  const callableCount = queue.filter(item => Boolean(item.phone)).length
  const dueTaskCount = queue.reduce((sum, item) => sum + item.tasks.length, 0)

  if (displayMode) return selected ? (
    <SalesCallCoach item={selected} displayMode />
  ) : (
    <div className="flex min-h-[100dvh] items-center justify-center bg-black p-8 text-center"><div><FiTarget className="mx-auto mb-4 text-4xl text-emerald-400" /><h1 className="text-xl font-black text-white">Select the next customer on screen 1</h1><p className="mt-2 text-sm text-neutral-400">The full communications and selling workspace will appear here automatically.</p></div></div>
  )

  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-black">
    <header className="shrink-0 border-b border-white/10 bg-neutral-950 px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-emerald-400"><FiZap /> Sales execution workspace</div><h1 className="mt-0.5 text-xl font-black text-white md:text-2xl">Next Best Action</h1><p className="text-xs text-neutral-500">One prioritized customer, complete context, communication, selling, and follow-up.</p></div>
        <div className="flex flex-wrap gap-2">{!working && <button onClick={() => { sessionStorage.setItem("titan-sales-workday-active", "1"); setWorking(true) }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-xs font-black text-black"><FiZap />Get to Work</button>}<Link href="/sales/leads-calling" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 text-xs font-black text-orange-300"><FiUsers /> Work new leads</Link><Link href="/sales" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-neutral-300"><FiBarChart2 /> Pipeline</Link><button onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-black text-black disabled:opacity-50"><FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh</button></div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2"><Metric label="Urgent" value={urgentCount} tone="red" /><Metric label="Callable" value={callableCount} tone="emerald" /><Metric label="Open actions" value={dueTaskCount} tone="amber" /></div>
    </header>

    <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-white/10 bg-black p-1 lg:hidden"><button onClick={() => setMobilePane("queue")} className={`min-h-11 rounded-lg text-xs font-black ${mobilePane === "queue" ? "bg-emerald-500 text-black" : "text-neutral-400"}`}>Work queue ({filteredQueue.length})</button><button onClick={() => setMobilePane("call")} disabled={!selected} className={`min-h-11 rounded-lg text-xs font-black disabled:opacity-40 ${mobilePane === "call" ? "bg-cyan-500 text-black" : "text-neutral-400"}`}>Active customer</button></div>
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className={`${mobilePane === "queue" ? "flex" : "hidden"} min-h-0 w-full shrink-0 flex-col border-b border-white/10 bg-neutral-950 lg:flex lg:max-h-none lg:w-[390px] lg:border-b-0 lg:border-r`}>
        <div className="shrink-0 space-y-2 border-b border-white/10 p-3">
          <div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, contact, or phone" className="h-10 w-full rounded-xl border border-white/10 bg-black pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-500/50" /></div>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-black p-1">{(["ALL", "URGENT", "CALLABLE", "RESEARCH"] as const).map(option => <button key={option} onClick={() => setFilter(option)} className={`min-h-8 rounded-lg text-[9px] font-black ${filter === option ? "bg-emerald-500 text-black" : "text-neutral-500 hover:text-white"}`}>{option}</button>)}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && <div className="m-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
          {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-neutral-500"><FiLoader className="animate-spin" /> Ranking the workday…</div> : filteredQueue.length === 0 ? <div className="p-10 text-center text-sm text-neutral-500">No customers match this view.</div> : filteredQueue.map((item, index) => <QueueCard key={item.id} item={item} rank={queue.indexOf(item) + 1 || index + 1} active={item.id === selectedId} onChoose={chooseAccount} />)}
        </div>
      </aside>

      <main className={`${mobilePane === "call" ? "block" : "hidden"} relative min-h-0 flex-1 bg-neutral-950 lg:block`}>
        {selected ? secondDisplayConnected ? <div className="flex h-full min-h-[560px] flex-col p-5"><div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[.06] p-5"><div><div className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Screen 2 is the live call coach</div><h2 className="mt-1 text-2xl font-black">{selected.name.toUpperCase()}</h2><p className="mt-2 max-w-xl text-sm text-neutral-400">This controller stays focused on queue movement, dialing, outcomes, and the next task—without repeating the script and customer intelligence shown beside you.</p></div><div className="flex gap-2">{selected.phone && <a href={`tel:${selected.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-black text-black"><FiPhone />Call {selected.phone}</a>}<Link href={`/account?id=${encodeURIComponent(selected.id)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-bold"><FiExternalLink />Account tools</Link></div></div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="text-[10px] font-black uppercase text-neutral-500">Required next action</div><div className="mt-2 text-lg font-black">{selected.recommendedReason}</div>{selected.tasks.slice(0,3).map(task => <div key={task.id} className="mt-3 rounded-xl bg-black/30 p-3 text-sm">{task.subject}</div>)}</div><div className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="text-[10px] font-black uppercase text-neutral-500">Complete and advance</div><p className="mt-2 text-sm text-neutral-400">Log the outcome in Account tools, then move directly to the next ranked customer.</p>{queue.indexOf(selected) < queue.length - 1 && <button onClick={() => chooseAccount(queue[queue.indexOf(selected) + 1].id)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 text-sm font-black">Next customer <FiArrowRight /></button>}</div></div></div> : <SalesCallCoach item={selected} /> : <div className="flex h-full min-h-[560px] items-center justify-center p-8 text-center"><div><FiCheckCircle className="mx-auto mb-3 text-4xl text-emerald-400" /><h2 className="text-xl font-black text-white">The queue is clear</h2><p className="mt-2 text-sm text-neutral-500">Refresh the queue or work new leads.</p></div></div>}
      </main>
    </div>
  </div>
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "red" | "emerald" | "amber" }) {
  const styles = { red: "border-red-500/20 bg-red-500/[.07] text-red-300", emerald: "border-emerald-500/20 bg-emerald-500/[.07] text-emerald-300", amber: "border-amber-500/20 bg-amber-500/[.07] text-amber-300" }
  return <div className={`rounded-xl border px-3 py-2 ${styles[tone]}`}><div className="text-[9px] font-black uppercase">{label}</div><div className="text-lg font-black text-white">{value}</div></div>
}

function QueueCard({ item, rank, active, onChoose }: { item: QueueItem; rank: number; active: boolean; onChoose: (id: string) => void }) {
  return <button onClick={() => onChoose(item.id)} className={`mb-2 w-full rounded-2xl border p-3 text-left transition ${active ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_24px_rgba(16,185,129,.08)]" : "border-white/10 bg-white/[.025] hover:border-white/20"}`}><div className="flex items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${active ? "bg-emerald-500 text-black" : "bg-white/5 text-neutral-400"}`}>{rank}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h2 className="truncate text-sm font-black text-white">{item.name.toUpperCase()}</h2><span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${item.score >= 50 ? "bg-red-500/15 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>{item.score}</span></div><div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-400"><FiUser className="text-emerald-400" /><span className="truncate">{contactName(item)}</span></div><div className="mt-2 rounded-lg bg-black/30 px-2 py-1.5 text-[11px] font-bold text-neutral-200">{item.recommendedReason}</div><div className="mt-2 flex items-center justify-between text-[10px]"><span className={item.phone ? "text-emerald-300" : "text-red-300"}>{item.phone || "Research phone"}</span><span className="text-neutral-600">{item.timeZone || "No timezone"}</span></div></div></div></button>
}
