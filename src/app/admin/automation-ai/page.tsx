"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  FiActivity, FiAlertTriangle, FiCheckCircle, FiCpu, FiDatabase,
  FiMail, FiMessageSquare, FiRefreshCw, FiSettings, FiTool, FiZap,
} from "react-icons/fi"

type Provider = { provider: string; model: string }
type AIStatus = {
  success: boolean
  preference?: string
  providers?: Provider[]
  fallbackEnabled?: boolean
  activeTools?: number
  recentChats?: number
  helpfulRate?: number | null
  error?: string
}

const automations = [
  { name: "Zoho document sync", detail: "Delta sync, line items, payments and conflict detection", href: "/admin/data-integrations", icon: FiDatabase },
  { name: "Cost and commission processing", detail: "Tariff, VIG, cost, profit and commission derivation", href: "/admin/data-integrations", icon: FiRefreshCw },
  { name: "Sales flow", detail: "Stage actions, scheduled calls and re-engagement", href: "/admin/sales-stages", icon: FiZap },
  { name: "Message delivery", detail: "Scheduled email and message processing", href: "/admin/communications", icon: FiMessageSquare },
  { name: "Email intelligence", detail: "Classification, suggested replies and follow-up tasks", href: "/messages", icon: FiMail },
]

const recommendedAI = [
  "Prioritize daily sales and collections work queues using local data",
  "Summarize account history and the complete estimate-to-payment timeline",
  "Detect anomalous margins, missing costs, duplicate records and sync drift",
  "Draft customer follow-ups, campaign copy and internal call preparation",
  "Explain metric calculations using retrieved records instead of generated numbers",
]

export default function AutomationAIPage() {
  const [status, setStatus] = useState<AIStatus | null>(null)

  useEffect(() => {
    fetch("/api/admin/ai-status")
      .then(response => response.json())
      .then(setStatus)
      .catch(error => setStatus({ success: false, error: error.message }))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Control Center</div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Automation & AI</h1>
          <p className="mt-1 text-sm text-neutral-400">One place to understand automated work, AI providers and human approvals.</p>
        </div>
        <Link href="/admin/ai-tools" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-black hover:bg-amber-400">
          <FiTool /> Manage AI Tools
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard label="Routing" value={status?.preference?.toUpperCase() || "LOADING"} note={status?.fallbackEnabled ? "Fallback enabled" : "Single provider"} icon={FiCpu} />
        <StatusCard label="Providers" value={String(status?.providers?.length ?? "—")} note={status?.providers?.map(item => `${item.provider}: ${item.model}`).join(" · ") || "Checking configuration"} icon={FiActivity} />
        <StatusCard label="Active AI tools" value={String(status?.activeTools ?? "—")} note="Permission-controlled actions" icon={FiTool} />
        <StatusCard label="30-day helpful rate" value={status?.helpfulRate == null ? "—" : `${status.helpfulRate}%`} note={`${status?.recentChats ?? 0} assistant conversations`} icon={FiCheckCircle} />
      </section>

      {status && !status.success && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <FiAlertTriangle className="mt-0.5 shrink-0" /> {status.error}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-black text-white">Active automation domains</h2>
            <p className="text-xs text-neutral-500">Automations execute deterministic business rules; AI assists with language, prioritization and anomaly review.</p>
          </div>
          <Link href="/admin/settings" className="text-neutral-400 hover:text-white" aria-label="Automation settings"><FiSettings /></Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {automations.map(item => (
            <Link key={item.name} href={item.href} className="group flex min-h-20 items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-4 hover:border-emerald-500/30 hover:bg-emerald-500/5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"><item.icon /></div>
              <div><div className="font-bold text-white group-hover:text-emerald-300">{item.name}</div><div className="text-xs text-neutral-500">{item.detail}</div></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
        <h2 className="font-black text-white">Best AI opportunities</h2>
        <p className="mb-4 text-xs text-neutral-500">Ollama handles frequent private summaries and classification. OpenAI can be used as an optional fallback for complex reasoning and structured output.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {recommendedAI.map(item => <div key={item} className="flex gap-2 rounded-xl bg-black/20 p-3 text-sm text-neutral-300"><FiCheckCircle className="mt-0.5 shrink-0 text-amber-400" />{item}</div>)}
        </div>
      </section>
    </div>
  )
}

function StatusCard({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof FiCpu }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500"><Icon className="text-amber-400" />{label}</div><div className="mt-2 text-2xl font-black text-white">{value}</div><div className="mt-1 truncate text-xs text-neutral-500" title={note}>{note}</div></div>
}
