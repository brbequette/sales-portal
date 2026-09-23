"use client"

import { useMemo, useState } from "react"
import { parse } from "csv-parse/browser/esm/sync"

type Row = Record<string, string>
type DocumentBatch = { invoiceId: string; rows: Row[] }

export default function InvoiceExportImportPage() {
  const [files, setFiles] = useState<File[]>([])
  const [documents, setDocuments] = useState<DocumentBatch[]>([])
  const [status, setStatus] = useState("Choose the CSV files extracted from the Zoho invoice ZIP.")
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const ids = useMemo(() => documents.map(item => item.invoiceId), [documents])

  async function loadFiles(selected: File[]) {
    setFiles(selected)
    setPreview(null)
    setStatus("Reading invoice export...")
    const grouped = new Map<string, Row[]>()
    for (const file of selected) {
      const rows = parse(await file.text(), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true }) as Row[]
      for (const row of rows) {
        const id = String(row["Invoice ID"] || "").trim()
        if (!id) continue
        const current = grouped.get(id) || []
        current.push(row)
        grouped.set(id, current)
      }
    }
    const next = [...grouped.entries()].map(([invoiceId, rows]) => ({ invoiceId, rows }))
    setDocuments(next)
    setStatus(`Ready: ${next.length.toLocaleString()} invoices from ${selected.length} CSV files. No Zoho calls will be made.`)
  }

  async function run(mode: "preview" | "apply") {
    setRunning(true)
    const totals = { creates: 0, updates: 0, unresolved: 0, invalid: 0, received: 0, zohoCalls: 0, failures: [] as any[] }
    try {
      for (let offset = 0; offset < documents.length; offset += 50) {
        setStatus(`${mode === "preview" ? "Checking" : "Updating"} invoices ${offset + 1}–${Math.min(offset + 50, documents.length)} of ${documents.length}...`)
        const response = await fetch("/api/admin/invoice-export-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, documents: documents.slice(offset, offset + 50) }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || `Batch failed (${response.status})`)
        totals.creates += data.creates || 0
        totals.updates += data.updates || 0
        totals.unresolved += data.unresolved || 0
        totals.invalid += data.invalid || 0
        totals.received += data.received || 0
        totals.zohoCalls += data.zohoCalls || 0
        if (data.unresolvedSample?.length || data.invalidSample?.length) totals.failures.push(...(data.unresolvedSample || []), ...(data.invalidSample || []))
      }
      if (mode === "apply" && totals.unresolved === 0 && totals.invalid === 0) {
        setStatus("Finalizing authoritative invoice set...")
        const response = await fetch("/api/admin/invoice-export-import", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "FINALIZE PORTAL INVOICE IMPORT", invoiceIds: ids }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Finalize failed")
        ;(totals as any).orphaned = data.orphaned || 0
      }
      setPreview(totals)
      setStatus(`${mode === "preview" ? "Preview complete" : "Portal update complete"}. Zoho calls: ${totals.zohoCalls}.`)
    } catch (error) {
      setStatus(`Stopped: ${error instanceof Error ? error.message : "Import failed"}`)
    } finally { setRunning(false) }
  }

  return <main className="min-h-screen bg-neutral-950 p-6 text-white">
    <div className="mx-auto max-w-4xl space-y-5">
      <div><h1 className="text-2xl font-bold">Invoice Export Import</h1><p className="mt-1 text-sm text-neutral-400">Portal-only import from Zoho Books CSV exports. This workflow never writes to Zoho.</p></div>
      <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <label className="block rounded-lg border border-dashed border-orange-500/50 p-6 text-center cursor-pointer">
          <span className="font-semibold">{files.length ? `${files.length} CSV files selected` : "Choose Invoice00.csv and Invoice01.csv"}</span>
          <input className="hidden" type="file" accept=".csv,text/csv" multiple onChange={event => void loadFiles(Array.from(event.target.files || []))} />
        </label>
        <p className="text-sm text-neutral-300">{status}</p>
        <div className="flex gap-3">
          <button className="rounded-lg bg-neutral-700 px-4 py-2 font-semibold disabled:opacity-40" disabled={!documents.length || running} onClick={() => void run("preview")}>Preview portal changes</button>
          <button className="rounded-lg bg-orange-600 px-4 py-2 font-semibold disabled:opacity-40" disabled={!preview || preview.unresolved > 0 || preview.invalid > 0 || running} onClick={() => void run("apply")}>Apply to Sales Hub only</button>
        </div>
      </section>
      {preview && <pre className="max-h-96 overflow-auto rounded-xl border border-white/10 bg-black p-4 text-xs">{JSON.stringify(preview, null, 2)}</pre>}
    </div>
  </main>
}

