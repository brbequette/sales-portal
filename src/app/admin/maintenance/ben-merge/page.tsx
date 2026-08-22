"use client"

import { useEffect, useState } from "react"

const ENDPOINT = "/api/admin/maintenance/merge-ben-bequette"
const CONFIRMATION = "MERGE BEN BEQUETTE ACCOUNTS"

export default function BenMergeMaintenancePage() {
  const [audit, setAudit] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)

  async function refresh() {
    setLoading(true)
    const response = await fetch(ENDPOINT, { cache: "no-store" })
    setAudit(await response.json())
    setLoading(false)
  }

  useEffect(() => { void refresh() }, [])

  async function merge() {
    setMerging(true)
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: CONFIRMATION }),
    })
    const data = await response.json()
    setResult(data)
    await refresh()
    setMerging(false)
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 text-white">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-400">Production maintenance</p>
        <h1 className="mt-2 text-3xl font-black">Benjamin Bequette identity merge</h1>
        <p className="mt-2 text-zinc-400">This moves every related record to the Zoho-linked account. It does not recalculate or sync invoice costs.</p>
      </div>

      <section className="rounded-2xl border border-zinc-700 bg-zinc-950 p-6">
        {loading ? <p>Auditing production…</p> : (
          <>
            <p className="text-lg font-bold">Matched accounts: {audit?.matchedUsers ?? 0}</p>
            <pre className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap text-xs text-zinc-300">{JSON.stringify(audit?.users, null, 2)}</pre>
          </>
        )}
      </section>

      {audit?.matchedUsers > 1 && (
        <button
          type="button"
          disabled={merging}
          onClick={merge}
          className="rounded-xl bg-orange-500 px-6 py-4 font-black text-black disabled:opacity-50"
        >
          {merging ? "Merging records…" : "Merge all records into the canonical Benjamin account"}
        </button>
      )}

      {result && (
        <section className={`rounded-2xl border p-6 ${result.success ? "border-emerald-600 bg-emerald-950/40" : "border-red-600 bg-red-950/40"}`}>
          <h2 className="text-xl font-black">{result.success ? "Merge complete" : "Merge failed"}</h2>
          <pre className="mt-4 max-h-[40vh] overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </main>
  )
}
