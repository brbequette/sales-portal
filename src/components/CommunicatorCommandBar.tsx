"use client"

import { useCallback, useEffect, useState } from "react"
import { FiAlertCircle, FiCheckCircle, FiClock, FiMail, FiMessageSquare, FiPhoneCall, FiRefreshCw, FiVoicemail } from "react-icons/fi"

type CommandData = {
  metrics: { callsToday: number; missedCalls: number; voicemails: number; emailsNeedingResponse: number; inboundMessages: number; openCommitments: number }
  connections: { voiceWebSdk: boolean; voiceOAuth: boolean; sms: boolean; emailIngestion: boolean }
  mailbox?: { address: string; lastSyncAt?: string | null; lastSyncStatus?: string | null; lastSyncError?: string | null } | null
}

export function CommunicatorCommandBar({ accountId }: { accountId: string }) {
  const [data, setData] = useState<CommandData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/communications/command-center?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Unable to load communication status")
      setData(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load communication status")
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { void load() }, [load])

  const metrics = data ? [
    { label: "Calls today", value: data.metrics.callsToday, icon: <FiPhoneCall /> },
    { label: "Missed", value: data.metrics.missedCalls, icon: <FiAlertCircle /> },
    { label: "Voicemail", value: data.metrics.voicemails, icon: <FiVoicemail /> },
    { label: "Emails to answer", value: data.metrics.emailsNeedingResponse, icon: <FiMail /> },
    { label: "Inbound messages", value: data.metrics.inboundMessages, icon: <FiMessageSquare /> },
    { label: "Open commitments", value: data.metrics.openCommitments, icon: <FiClock /> },
  ] : []

  return <section className="border-b border-white/10 bg-[#090d13] px-5 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-2 text-[10px] font-black uppercase tracking-[.2em] text-neutral-500">Live command center</div>
      {data && Object.entries({ Voice: data.connections.voiceOAuth, "Browser phone": data.connections.voiceWebSdk, "SMS/MMS": data.connections.sms, "Email ingestion": data.connections.emailIngestion }).map(([label, ready]) => <span key={label} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${ready ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>{ready ? <FiCheckCircle /> : <FiAlertCircle />}{label}</span>)}
      <button onClick={() => void load()} disabled={loading} className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 hover:bg-white/10 disabled:opacity-50"><FiRefreshCw className={loading ? "animate-spin" : ""} />Refresh</button>
    </div>
    {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{metrics.map(metric => <div key={metric.label} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2"><span className="text-cyan-400">{metric.icon}</span><div><div className="text-base font-black leading-none text-white">{metric.value}</div><div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-neutral-500">{metric.label}</div></div></div>)}</div>}
    {data?.mailbox && <div className="mt-2 text-[10px] text-neutral-600">Email ingestion: {data.mailbox.address} · {data.mailbox.lastSyncAt ? `last synced ${new Date(data.mailbox.lastSyncAt).toLocaleString()}` : "awaiting first sync"}{data.mailbox.lastSyncError ? ` · ${data.mailbox.lastSyncError}` : ""}</div>}
  </section>
}
