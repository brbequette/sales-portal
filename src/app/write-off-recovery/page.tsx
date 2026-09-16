"use client"

import { useCallback, useEffect, useState } from "react"
import { DEFAULT_WRITE_OFF_RESPONSIBILITY_PERCENTAGE } from "@/lib/write-off-recovery"

type RecoveryCase = {
  id: string; status: string; responsibilityRateBps: number; originalCostCents: number; recoveryCents: number
  responsibilityChargeCents: number; creditCents: number; remainingBalanceCents: number
  invoice: { invoiceNumber: string | null; zohoId: string; account: { name: string } }
  responsibleRep: { name: string | null }
}

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

export default function WriteOffRecoveryPage() {
  const [cases, setCases] = useState<RecoveryCase[]>([])
  const [scope, setScope] = useState<"management" | "personal">("personal")
  const [percentage, setPercentage] = useState(DEFAULT_WRITE_OFF_RESPONSIBILITY_PERCENTAGE)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    try {
      const [casesResponse, policyResponse] = await Promise.all([
        fetch("/api/write-off-recovery", { cache: "no-store" }),
        fetch("/api/write-off-recovery/policy", { cache: "no-store" }),
      ])
      if (!casesResponse.ok || !policyResponse.ok) throw new Error("Recovery data unavailable")
      const [caseData, policyData] = await Promise.all([casesResponse.json(), policyResponse.json()])
      setCases(caseData.cases || []); setScope(caseData.scope); setPercentage(policyData.responsibilityPercentage || DEFAULT_WRITE_OFF_RESPONSIBILITY_PERCENTAGE)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Recovery data unavailable") }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const saveRate = async () => {
    const response = await fetch("/api/write-off-recovery/policy", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responsibilityPercentage: percentage }),
    })
    if (!response.ok) setError((await response.json()).error || "Unable to save rate")
  }

  return <main className="min-h-screen bg-neutral-950 p-6 text-white">
    <div className="mx-auto max-w-7xl space-y-6">
      <div><h1 className="text-2xl font-black">Write-off Recovery</h1><p className="text-sm text-neutral-400">Commission-ledger recovery. Zoho synchronization is disabled pending separate review.</p></div>
      {scope === "management" && <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="text-sm text-neutral-300">Default write-off responsibility percentage</label>
        <div className="mt-2 flex gap-2"><input className="rounded bg-black px-3 py-2" type="number" min={0} max={100} step="0.01" value={percentage} onChange={event => setPercentage(event.target.value)} /><span className="self-center text-neutral-400">%</span><button className="rounded bg-orange-600 px-4 py-2 font-bold" onClick={saveRate}>Save</button></div>
      </section>}
      {error && <p className="rounded border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm"><thead className="bg-white/5 text-neutral-400"><tr><th className="p-3">Invoice / Customer</th><th>Salesperson</th><th>Original cost</th><th>Recoveries</th><th>Charge</th><th>Credits</th><th>Remaining</th><th>Status</th></tr></thead>
          <tbody>{cases.map(item => <tr key={item.id} className="border-t border-white/10"><td className="p-3">{item.invoice.invoiceNumber || item.invoice.zohoId}<div className="text-xs text-neutral-500">{item.invoice.account.name}</div></td><td>{item.responsibleRep.name || "Unassigned"}</td><td>{money(item.originalCostCents)}</td><td>{money(item.recoveryCents)}</td><td>{money(item.responsibilityChargeCents)}</td><td>{money(item.creditCents)}</td><td className="font-bold">{money(item.remainingBalanceCents)}</td><td>{item.status}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  </main>
}
