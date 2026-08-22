"use client"

import { useState } from "react"
import { FiCheckCircle, FiDatabase, FiImage, FiUpload, FiAlertTriangle } from "react-icons/fi"

type Summary = {
  rows: number
  createLocal: number
  skippedMissing: number
  updateLocal: number
  withImages: number
  withAttributes: number
  createdZoho: number
  updatedZoho: number
  uploadedImages: number
  nextOffset: number | null
  fillOnly: boolean
  createMissing: boolean
  questionableCount: number
  diffs: ImportDiff[]
  failures: Array<{ sku: string; message: string }>
}

type ImportDiff = { sku: string; field: string; current: unknown; incoming: unknown; action: "fill" | "preserve" | "create"; reason: string }

const emptyTotals = (): Summary => ({ rows: 0, createLocal: 0, skippedMissing: 0, updateLocal: 0, withImages: 0, withAttributes: 0, createdZoho: 0, updatedZoho: 0, uploadedImages: 0, nextOffset: null, fillOnly: true, createMissing: false, questionableCount: 0, diffs: [], failures: [] })
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function CatalogImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Summary | null>(null)
  const [result, setResult] = useState<Summary | null>(null)
  const [syncZoho, setSyncZoho] = useState(true)
  const [syncImages, setSyncImages] = useState(true)
  const [fillOnly, setFillOnly] = useState(true)
  const [createMissing, setCreateMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const requestBatch = async (mode: "preview" | "apply", offset = 0) => {
    if (!file) throw new Error("Choose a CSV file first")
    const form = new FormData()
    form.append("file", file)
    form.append("mode", mode)
    form.append("offset", String(offset))
    form.append("limit", mode === "preview" ? "5000" : syncZoho ? "25" : "5000")
    form.append("syncZoho", String(syncZoho))
    form.append("syncImages", String(syncImages))
    form.append("fillOnly", String(fillOnly))
    form.append("createMissing", String(createMissing))
    const response = await fetch("/api/admin/products/import", { method: "POST", body: form })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Import request failed")
    return data.summary as Summary
  }

  const runPreview = async () => {
    setBusy(true); setError(""); setResult(null)
    try { setPreview(await requestBatch("preview")) }
    catch (error: unknown) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }

  const runImport = async () => {
    if (!preview || !file) return
    const action = fillOnly ? "fill empty fields for" : "overwrite differing fields for"
    if (!window.confirm(`Apply the import and ${action} ${preview.rows} products${syncZoho ? " in the portal and Zoho Books" : " in the portal"}?`)) return
    setBusy(true); setError(""); setResult(null)
    const totals = emptyTotals()
    totals.rows = preview.rows
    totals.fillOnly = fillOnly
    totals.createMissing = createMissing
    let offset = 0
    try {
      do {
        const batch = await requestBatch("apply", offset)
        totals.createLocal += batch.createLocal
        totals.skippedMissing += batch.skippedMissing
        totals.updateLocal += batch.updateLocal
        totals.withImages += batch.withImages
        totals.withAttributes += batch.withAttributes
        totals.createdZoho += batch.createdZoho
        totals.updatedZoho += batch.updatedZoho
        totals.uploadedImages += batch.uploadedImages
        totals.failures.push(...batch.failures)
        totals.nextOffset = batch.nextOffset
        setResult({ ...totals, failures: [...totals.failures] })
        offset = batch.nextOffset || 0
      } while (totals.nextOffset !== null)
    } catch (error: unknown) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Catalog CSV Import</h1>
          <p className="page-subtitle">Enrich products, add missing SKUs, and synchronize item details and images with Zoho Books.</p>
        </div>
      </div>
      <div className="page-body max-w-5xl space-y-5">
        {error && <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-300 flex gap-2"><FiAlertTriangle className="shrink-0" />{error}</div>}
        <div className="glass-panel rounded-2xl border border-white/10 p-6 space-y-5">
          <label className="block rounded-xl border border-dashed border-neutral-600 p-8 text-center cursor-pointer hover:border-emerald-500/60 transition-colors">
            <FiUpload className="mx-auto mb-3 text-emerald-400" size={24} />
            <span className="text-sm font-semibold text-white">{file?.name || "Choose Shopify product CSV"}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setResult(null) }} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-100">
              <input type="checkbox" className="mt-0.5" checked={fillOnly} onChange={event => { setFillOnly(event.target.checked); setPreview(null); setResult(null) }} />
              <span><strong>Only fill empty fields</strong><span className="block mt-1 text-xs text-emerald-300/80">Recommended. Existing names, prices, descriptions, classifications, images, and other populated values are preserved.</span></span>
            </label>
            <label className={`sm:col-span-2 flex items-start gap-3 rounded-xl border p-4 text-sm ${createMissing ? "border-amber-500/30 bg-amber-950/20 text-amber-100" : "border-white/10 bg-black/20 text-neutral-300"}`}>
              <input type="checkbox" className="mt-0.5" checked={createMissing} onChange={event => { setCreateMissing(event.target.checked); setPreview(null); setResult(null) }} />
              <span><strong>Create missing products</strong><span className="block mt-1 text-xs text-neutral-400">Off by default. When off, CSV SKUs not already in the portal are shown in preview and skipped. Missing Zoho items are not created.</span></span>
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-neutral-200">
              <input type="checkbox" checked={syncZoho} onChange={event => setSyncZoho(event.target.checked)} />
              <FiDatabase className="text-blue-400" /> Sync item fields to Zoho Books
            </label>
            <label className={`flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm ${syncZoho ? "text-neutral-200" : "text-neutral-600"}`}>
              <input type="checkbox" checked={syncImages} disabled={!syncZoho} onChange={event => setSyncImages(event.target.checked)} />
              <FiImage className="text-amber-400" /> Upload linked product images
            </label>
          </div>
          <div className="flex gap-3">
            <button disabled={!file || busy} onClick={runPreview} className="rounded-xl bg-neutral-800 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? "Working…" : "Preview Import"}</button>
            <button disabled={!preview || busy} onClick={runImport} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">Apply Import</button>
          </div>
        </div>
        {(preview || result) && <SummaryCard title={result ? (busy ? "Import Progress" : "Import Result") : "Preview"} summary={result || preview!} />}
        {preview && <DiffTable diffs={preview.diffs} createMissing={preview.createMissing} />}
      </div>
    </div>
  )
}

const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return <span className="italic text-neutral-600">empty</span>
  return typeof value === "object" ? JSON.stringify(value) : String(value)
}

function DiffTable({ diffs, createMissing }: { diffs: ImportDiff[]; createMissing: boolean }) {
  const questionable = diffs.filter(diff => diff.action !== "fill")
  return <div className="glass-panel rounded-2xl border border-amber-500/20 p-6">
    <div className="mb-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-amber-300">Questionable data review</h2>
      <p className="mt-1 text-xs text-neutral-400">Conflicts are preserved in fill-only mode. New SKUs are shown for review and are only created when “Create missing products” is enabled.</p>
    </div>
    {questionable.length === 0 ? <p className="text-sm text-emerald-400">No conflicts or new products found.</p> :
      <div className="max-h-[32rem] overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="sticky top-0 bg-neutral-900 text-neutral-400"><tr><th className="p-3">SKU</th><th className="p-3">Field</th><th className="p-3">Current</th><th className="p-3">CSV value</th><th className="p-3">Decision</th></tr></thead>
          <tbody className="divide-y divide-white/5">{questionable.map((diff, index) => <tr key={`${diff.sku}-${diff.field}-${index}`} className="align-top">
            <td className="p-3 font-bold text-white">{diff.sku}</td><td className="p-3 text-neutral-300">{diff.field}</td>
            <td className="p-3 text-neutral-400 break-words max-w-xs">{displayValue(diff.current)}</td><td className="p-3 text-blue-300 break-words max-w-xs">{displayValue(diff.incoming)}</td>
            <td className="p-3"><span className={`rounded px-2 py-1 font-bold ${diff.action === "preserve" ? "bg-amber-500/10 text-amber-300" : createMissing ? "bg-purple-500/10 text-purple-300" : "bg-neutral-700/50 text-neutral-300"}`}>{diff.action === "preserve" ? "Keep current" : createMissing ? "Will create" : "Will skip"}</span><div className="mt-1 text-[10px] text-neutral-500">{diff.reason}</div></td>
          </tr>)}</tbody>
        </table>
      </div>}
  </div>
}

function SummaryCard({ title, summary }: { title: string; summary: Summary }) {
  const stats = [
    ["CSV products", summary.rows], ["Missing from portal", summary.createLocal], ["Skipped new", summary.skippedMissing], ["Portal updates", summary.updateLocal],
    ["With images", summary.withImages], ["Zoho created", summary.createdZoho], ["Zoho updated", summary.updatedZoho],
    ["Images uploaded", summary.uploadedImages], ["Questionable", summary.questionableCount], ["Failures", summary.failures.length],
  ]
  return <div className="glass-panel rounded-2xl border border-white/10 p-6">
    <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white"><FiCheckCircle className="text-emerald-400" />{title}</h2>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{stats.map(([label, value]) => <div key={String(label)} className="rounded-xl bg-black/20 p-3"><div className="text-[10px] uppercase text-neutral-500">{label}</div><div className="mt-1 text-xl font-bold text-white">{value}</div></div>)}</div>
    {summary.failures.length > 0 && <div className="mt-4 max-h-56 overflow-auto rounded-xl border border-red-500/20 bg-red-950/20 p-3 text-xs text-red-300">{summary.failures.map((failure, index) => <div key={`${failure.sku}-${index}`} className="py-1"><strong>{failure.sku}</strong>: {failure.message}</div>)}</div>}
  </div>
}
