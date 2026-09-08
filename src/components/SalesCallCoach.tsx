"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { FiAlertCircle, FiBookOpen, FiCheckCircle, FiChevronRight, FiClock, FiExternalLink, FiHeadphones, FiMessageSquare, FiPhone, FiSave, FiSearch, FiShoppingCart, FiTarget, FiUser } from "react-icons/fi"
import { EMPTY_FACT_FINDING, FactFindingPanel, type FactFindingValues } from "@/components/FactFindingPanel"
import { OrderBuilder } from "@/components/OrderBuilder"

type Script = {
  id: string; name: string; callType: string; department: string; scenario: string; objective?: string | null
  content: string; discoveryPrompts?: string[] | null; objectionResponses?: Array<{ trigger: string; response: string }> | null
  closingPrompt?: string | null; priority?: number
}

type QueueContext = {
  id: string; name: string; phone?: string | null; recommendedReason: string; reasons: string[]; status?: string
  primaryContact?: { firstName?: string | null; lastName?: string | null } | null
  tasks?: Array<{ subject: string; priority: string; dueDate?: string | null }>
}

const DEPARTMENT_LABELS: Record<string, string> = { SALES: "Sales", COLLECTIONS: "Collections", SUPPORT: "Support", SHIPPING: "Shipping" }

function merge(content: string, account: any, item: QueueContext) {
  const contact = item.primaryContact
  const contactName = [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || "there"
  const values: Record<string, string> = {
    AccountName: item.name, ContactName: contactName, Industry: account?.industry || "your operation",
    Status: account?.status || item.status || "active", LastPurchase: account?.lastPurchaseAt ? new Date(account.lastPurchaseAt).toLocaleDateString() : "not yet recorded",
    CurrentSupplier: account?.currentSupplier || "your current supplier",
  }
  return content.replace(/{{(\w+)}}/g, (_, key) => values[key] || (key === "RepName" ? "your Titan representative" : ""))
}

export function SalesCallCoach({ item, displayMode = false }: { item: QueueContext; displayMode?: boolean }) {
  const [account, setAccount] = useState<any>(null)
  const [scripts, setScripts] = useState<Script[]>([])
  const [department, setDepartment] = useState("SALES")
  const [selectedId, setSelectedId] = useState("")
  const [objectionQuery, setObjectionQuery] = useState("")
  const [mobileTab, setMobileTab] = useState<"script" | "discovery" | "context" | "objections">("script")
  const [factFinding, setFactFinding] = useState<FactFindingValues>(EMPTY_FACT_FINDING)
  const [savedFactFinding, setSavedFactFinding] = useState<FactFindingValues>(EMPTY_FACT_FINDING)
  const [savingFacts, setSavingFacts] = useState(false)
  const [factMessage, setFactMessage] = useState("")
  const [workspace, setWorkspace] = useState<"coach" | "sell">("coach")

  useEffect(() => {
    let active = true
    Promise.all([
      fetch(`/api/get-account-details?id=${encodeURIComponent(item.id)}`, { cache: "no-store" }).then(response => response.json()),
      fetch("/api/scripts", { cache: "no-store" }).then(response => response.json()),
    ]).then(([accountData, scriptData]) => {
      if (!active) return
      const nextAccount = accountData.account || null
      setAccount(nextAccount)
      const nextFacts: FactFindingValues = {
        ...EMPTY_FACT_FINDING,
        bladeSizes: nextAccount?.bladeSizes || "",
        materialsCut: nextAccount?.materialsCut || "",
        currentSupplier: nextAccount?.currentSupplier || "",
        avgBladeCost: nextAccount?.averageBladeCost || nextAccount?.avgBladeCost || "",
        crewCount: nextAccount?.crewCount || "",
        bladesPerOrder: nextAccount?.bladesPerOrder || "",
        improvementPriority: nextAccount?.improvementPriority || "",
      }
      setFactFinding(nextFacts)
      setSavedFactFinding(nextFacts)
      setFactMessage("")
      setScripts(scriptData.scripts || [])
    }).catch(() => undefined)
    return () => { active = false }
  }, [item.id])

  const relevant = useMemo(() => scripts.filter(script => (script.department || "SALES") === department), [department, scripts])
  const chosen = relevant.find(script => script.id === selectedId) || relevant[0] || scripts[0]
  const objections = (chosen?.objectionResponses || []).filter(entry => `${entry.trigger} ${entry.response}`.toLowerCase().includes(objectionQuery.toLowerCase()))
  const contactName = [item.primaryContact?.firstName, item.primaryContact?.lastName].filter(Boolean).join(" ") || "Contact review needed"
  const history = account?.callLogs || []
  const documents = [...(account?.invoices || []), ...(account?.salesOrders || []), ...(account?.quotes || [])]
  const factsDirty = JSON.stringify(factFinding) !== JSON.stringify(savedFactFinding)
  const answeredFacts = Object.values(factFinding).filter(value => Array.isArray(value) ? value.length > 0 : Boolean(value)).length

  const saveFactFinding = async () => {
    setSavingFacts(true); setFactMessage("")
    try {
      const response = await fetch("/api/update-account-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: item.id,
          bladeSizes: factFinding.bladeSizes,
          materialsCut: factFinding.materialsCut,
          currentSupplier: factFinding.currentSupplier,
          averageBladeCost: factFinding.avgBladeCost,
          crewCount: factFinding.crewCount,
          bladesPerOrder: factFinding.bladesPerOrder,
          improvementPriority: factFinding.improvementPriority,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to save fact-finding")
      setAccount((current: any) => ({ ...current, ...data.account }))
      setSavedFactFinding(factFinding)
      setFactMessage("Saved to the account")
    } catch (caught) {
      setFactMessage(caught instanceof Error ? caught.message : "Unable to save fact-finding")
    } finally { setSavingFacts(false) }
  }

  return <div className={`flex min-h-0 flex-col bg-[#07090d] text-white ${displayMode ? "h-dvh" : "h-full"}`}>
    <header className="shrink-0 border-b border-white/10 bg-black/70 px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-400">Live call coach</div><h1 className="truncate text-xl font-black uppercase md:text-2xl">{item.name}</h1><div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-400"><span className="flex items-center gap-1"><FiUser />{contactName}</span><span>{item.phone || "Phone research required"}</span></div></div>
        <div className="flex flex-wrap gap-2">{item.phone && <a href={`tel:${item.phone}`} className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-black text-black"><FiPhone />Call</a>}<button type="button" onClick={() => setWorkspace(current => current === "sell" ? "coach" : "sell")} className={`flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black ${workspace === "sell" ? "bg-white text-black" : "bg-orange-500 text-black"}`}><FiShoppingCart />{workspace === "sell" ? "Back to coach" : "Sell & close"}</button><Link href={`/account?id=${encodeURIComponent(item.id)}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-bold"><FiExternalLink />Full account</Link></div>
      </div>
      {workspace === "coach" && <><div className="mt-3 flex gap-1 overflow-x-auto">{Object.entries(DEPARTMENT_LABELS).map(([id, label]) => <button key={id} onClick={() => { setDepartment(id); setSelectedId("") }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black ${department === id ? "bg-cyan-600" : "bg-white/5 text-neutral-400"}`}>{label}</button>)}</div>
      <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-black p-1 lg:hidden">{(["script", "discovery", "context", "objections"] as const).map(tab => <button key={tab} onClick={() => setMobileTab(tab)} className={`min-h-9 rounded-lg text-[9px] font-black uppercase ${mobileTab === tab ? "bg-white/10 text-white" : "text-neutral-500"}`}>{tab}</button>)}</div></>}
    </header>

    {workspace === "sell" ? <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-7xl"><div className="mb-4 rounded-2xl border border-orange-500/20 bg-orange-500/[.07] p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-300"><FiShoppingCart />Sell to {item.name}</div><p className="mt-1 text-sm text-neutral-400">Use the captured job facts to recommend products, price the deal, and create the quote or sales order without leaving the call.</p></div><OrderBuilder accountId={item.id} accountName={item.name} accountDetail={account} factFinding={factFinding} accent="emerald" onSuccess={() => setWorkspace("coach")} /></div></main> : <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(310px,.75fr)]">
      <section className={`${mobileTab !== "script" && mobileTab !== "discovery" ? "hidden lg:block" : "block"} min-h-0 overflow-y-auto border-white/10 p-4 lg:border-r md:p-5`}>
        <div className="mx-auto max-w-4xl">
          <div className={mobileTab === "discovery" ? "hidden lg:block" : "block"}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-400"><FiBookOpen />Recommended script</div><p className="mt-1 text-xs text-neutral-500">Chosen from the approved admin library for this type of conversation.</p></div>{relevant.length > 1 && <select value={chosen?.id || ""} onChange={event => setSelectedId(event.target.value)} className="rounded-xl border border-white/10 bg-neutral-950 px-3 py-2 text-xs"><option value="">Best match</option>{relevant.map(script => <option key={script.id} value={script.id}>{script.name}</option>)}</select>}</div>
          {chosen ? <div className="mt-4 space-y-4">
            {chosen.objective && <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.07] p-4"><div className="text-[10px] font-black uppercase text-cyan-300">Call objective</div><div className="mt-1 text-sm font-bold">{chosen.objective}</div></div>}
            <article className="rounded-2xl border border-white/10 bg-white/[.035] p-5 text-base leading-8 text-neutral-100 md:p-6 md:text-lg">{merge(chosen.content, account, item)}</article>
            {(chosen.discoveryPrompts || []).length > 0 && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[.05] p-4"><div className="text-xs font-black uppercase tracking-wider text-emerald-300">Ask and listen</div><div className="mt-3 grid gap-2 md:grid-cols-2">{chosen.discoveryPrompts?.map((prompt, index) => <div key={`${prompt}-${index}`} className="flex gap-2 rounded-xl bg-black/30 p-3 text-sm"><FiChevronRight className="mt-0.5 shrink-0 text-emerald-400" />{merge(prompt, account, item)}</div>)}</div></div>}
            {chosen.closingPrompt && <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[.06] p-4"><div className="text-[10px] font-black uppercase text-orange-300">Advance the call</div><div className="mt-1 text-sm font-bold">{merge(chosen.closingPrompt, account, item)}</div></div>}
          </div> : <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-10 text-center"><FiAlertCircle className="mx-auto text-3xl text-amber-400" /><div className="mt-3 font-black">No active {DEPARTMENT_LABELS[department]} script</div><p className="mt-1 text-sm text-neutral-500">An administrator can publish one in the Call Scripting Center.</p></div>}</div>
          <div className={`${mobileTab !== "discovery" ? "hidden lg:block" : "block"} mt-5 border-t border-white/10 pt-5`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"><FiCheckCircle />Account fact-finding</div><p className="mt-1 text-xs text-neutral-500">Capture answers while you ask. These are the same facts used throughout the account call system.</p></div><div className="flex items-center gap-3"><span className="text-xs font-bold text-neutral-500">{answeredFacts}/7 complete</span><button type="button" onClick={() => void saveFactFinding()} disabled={!factsDirty || savingFacts} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-400 px-4 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-40"><FiSave />{savingFacts ? "Saving…" : "Save facts"}</button></div></div>
            {factMessage && <div className={`mb-3 rounded-xl border px-3 py-2 text-xs ${factMessage === "Saved to the account" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>{factMessage}</div>}
            <FactFindingPanel values={factFinding} onChange={setFactFinding} mode="dialer-followup" questionCount={7} accentColor="amber" updatedAt={account?.factFindingUpdatedAt || account?.bladeSizesUpdatedAt || undefined} updatedBy={account?.factFindingUpdatedBy || account?.bladeSizesUpdatedBy || undefined} />
          </div>
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto p-4 md:p-5">
        <div className={`${mobileTab !== "context" ? "hidden lg:block" : "block"} space-y-4`}>
          <section className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="flex items-center gap-2 text-xs font-black uppercase text-violet-300"><FiTarget />Why this customer now</div><div className="mt-3 text-sm font-bold">{item.recommendedReason}</div><div className="mt-2 space-y-1 text-xs text-neutral-500">{item.reasons.slice(1).map(reason => <div key={reason}>• {reason}</div>)}</div></section>
          <section className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="text-xs font-black uppercase text-cyan-300">Customer intelligence</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Stat label="Documents" value={documents.length} /><Stat label="Prior calls" value={history.length} /><Stat label="Open tasks" value={item.tasks?.length || 0} /><Stat label="Status" value={account?.status || item.status || "—"} /></div>{item.tasks?.slice(0, 3).map(task => <div key={task.subject} className="mt-2 rounded-lg bg-black/30 p-2 text-xs"><b>{task.subject}</b>{task.dueDate && <span className="ml-2 text-neutral-500"><FiClock className="inline" /> {new Date(task.dueDate).toLocaleDateString()}</span>}</div>)}</section>
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[.05] p-4"><div className="flex items-center gap-2 text-xs font-black uppercase text-emerald-300"><FiHeadphones />Calling setup</div><p className="mt-2 text-xs leading-5 text-neutral-400">Desktop: use ZDialer click-to-call with the assigned headset. Tablet/phone: use ZDialer mobile with Bluetooth, then return here to complete the outcome and advance.</p></section>
        </div>
        <div className={`${mobileTab !== "objections" ? "hidden lg:block" : "block"} mt-4 border-t border-white/10 pt-4`}>
          <div className="flex items-center gap-2 text-xs font-black uppercase text-rose-300"><FiMessageSquare />Conflict & objection resolver</div>
          <div className="relative mt-3"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" /><input value={objectionQuery} onChange={event => setObjectionQuery(event.target.value)} placeholder="Customer says…" className="h-10 w-full rounded-xl border border-white/10 bg-black pl-9 pr-3 text-xs outline-none focus:border-rose-500/50" /></div>
          <div className="mt-3 space-y-2">{objections.length ? objections.map(entry => <details key={entry.trigger} className="rounded-xl border border-white/10 bg-white/[.03] p-3" open={objectionQuery.length > 1}><summary className="cursor-pointer text-sm font-bold text-white">{entry.trigger}</summary><p className="mt-2 border-t border-white/5 pt-2 text-sm leading-6 text-neutral-300">{merge(entry.response, account, item)}</p></details>) : <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-neutral-500">No approved response matches this phrase.</div>}</div>
        </div>
      </aside>
    </main>}
  </div>
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-black/30 p-3"><div className="text-[9px] font-black uppercase text-neutral-600">{label}</div><div className="mt-1 truncate font-bold text-white">{value}</div></div>
}
