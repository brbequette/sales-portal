"use client"

import { useEffect, useState } from "react"

export default function RossCommissionReconciliationPage() {
  const [audit, setAudit] = useState<any>(null)
  const [status, setStatus] = useState("Loading read-only audit...")
  const [running, setRunning] = useState(false)
  async function load() {
    setRunning(true)
    const response = await fetch("/api/admin/commissions/ross-reconciliation", { cache: "no-store" })
    const data = await response.json()
    setAudit(data)
    setStatus(response.ok ? "Preview complete. No Zoho calls were made." : data.error || "Audit failed")
    setRunning(false)
  }
  useEffect(() => { void load() }, [])
  async function apply() {
    if (!confirm(`Apply ${audit?.updateCount || 0} portal-only invoice corrections for Ross? This will not write to Zoho.`)) return
    setRunning(true)
    const response = await fetch("/api/admin/commissions/ross-reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "APPLY ROSS PORTAL COMMISSION RECONCILIATION" }) })
    const data = await response.json()
    setAudit(data)
    setStatus(response.ok ? `Applied ${data.updateCount} portal corrections. Zoho calls: 0.` : data.error || "Apply failed")
    setRunning(false)
  }
  return <main className="min-h-screen bg-neutral-950 p-6 text-white"><div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-2xl font-bold">Ross Commission Reconciliation</h1><p className="text-sm text-neutral-400">Goal-based VIG, profit and 50% commission audit for invoices issued from 2025-01-01 through 2026-12-31. Portal only.</p></div>
    <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4"><p>{status}</p><div className="flex gap-3"><button className="rounded-lg bg-neutral-700 px-4 py-2 disabled:opacity-40" disabled={running} onClick={() => void load()}>Refresh preview</button><button className="rounded-lg bg-orange-600 px-4 py-2 disabled:opacity-40" disabled={running || !audit || audit.blockedCount > 0 || audit.updateCount === 0} onClick={() => void apply()}>Apply portal corrections</button></div></section>
    {audit && <pre className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black p-4 text-xs">{JSON.stringify(audit, null, 2)}</pre>}
  </div></main>
}
