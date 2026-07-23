"use client"

import { toastConfirm } from '@/lib/toastConfirm'
import React, { useState } from "react"
import { FiPlay, FiCheck, FiAlertCircle, FiLoader, FiCpu, FiDatabase, FiRefreshCw, FiZap } from "react-icons/fi"

// ── Types ───────────────────────────────────────────────────────────────────
interface PhaseResult {
  entity: string
  pages: number
  processed: number
  skipped: number
  errors: number
  done: boolean
  errorDetail?: string
}

interface FullSyncState {
  running: boolean
  phase: 'idle' | 'invoices' | 'salesorders' | 'estimates' | 'done' | 'error'
  phases: PhaseResult[]
  log: string[]
  startedAt: number | null
}

export default function BooksScriptsPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  // ── Full Sync state ──────────────────────────────────────────────────────
  const [fullSync, setFullSync] = useState<FullSyncState>({
    running: false, phase: 'idle', phases: [], log: [], startedAt: null,
  })
  const [fullSyncForce, setFullSyncForce] = useState(true)

  // ── Bulk Process state ───────────────────────────────────────────────────
  const [bulkFilter, setBulkFilter] = useState<'unpaid' | 'all' | 'recent' | 'daterange' | 'draft'>('daterange')
  const [bulkEntity, setBulkEntity] = useState<'invoices' | 'salesorders' | 'estimates'>('invoices')
  const [bulkForce, setBulkForce] = useState(false)
  const [bulkProgress, setBulkProgress] = useState("")
  const [bulkRunning, setBulkRunning] = useState(false)
  // Date range defaults to current month
  const nowY = new Date().getFullYear()
  const nowM = String(new Date().getMonth() + 1).padStart(2, '0')
  const lastDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const [bulkStartDate, setBulkStartDate] = useState(`${nowY}-${nowM}-01`)
  const [bulkEndDate, setBulkEndDate] = useState(`${nowY}-${nowM}-${lastDayOfMonth}`)

  // ── Helpers ──────────────────────────────────────────────────────────────
  const runScript = async (scriptName: string, endpoint: string) => {
    toastConfirm(`Are you sure you want to run ${scriptName}? This may modify live Zoho Books data.`, async () => {
      setLoading(scriptName)
      try {
        const res = await fetch(endpoint, { method: 'POST' })
        const data = await res.json()
        setResults(prev => ({ ...prev, [scriptName]: data.message || "Completed successfully" }))
      } catch (err: any) {
        setResults(prev => ({ ...prev, [scriptName]: `Error: ${err.message}` }))
      } finally {
        setLoading(null)
      }
    });
  }

  // ── Full Sync (all entities, all pages, newest first) ───────────────────
  const runFullSync = async () => {
    toastConfirm(
      'This will fetch ALL documents from Zoho (most recent first), recalculate all costs, VIG, commissions, and sync custom fields back to Zoho. Line items and customer info will NOT be changed. Continue?',
      async () => {
        const startedAt = Date.now()
        const entities: Array<'invoices' | 'salesorders' | 'estimates'> = ['invoices', 'salesorders', 'estimates']
        const entityLabels: Record<string, string> = {
          invoices: 'Invoices',
          salesorders: 'Sales Orders',
          estimates: 'Quotes/Estimates',
        }

        setFullSync({ running: true, phase: 'invoices', phases: [], log: [`Started at ${new Date().toLocaleTimeString()}`], startedAt })

        const phaseResults: PhaseResult[] = []

        for (const entity of entities) {
          setFullSync(prev => ({ ...prev, phase: entity as any, log: [...prev.log, `-- Processing ${entityLabels[entity]}...`] }))

          let page = 1
          let totalProcessed = 0
          let totalErrors = 0
          let totalSkipped = 0

          try {
            while (true) {
              setFullSync(prev => ({
                ...prev,
                log: [...prev.log.slice(-30), `  ${entityLabels[entity]} page ${page}: ${totalProcessed} processed, ${totalErrors} errors`],
              }))

              const res = await fetch('/.netlify/functions/bulk-process-costs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  entity,
                  page,
                  filter: 'all',
                  perPage: 25,
                  force: fullSyncForce,
                }),
              })

              if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${await res.text()}`)
              }

              const data = await res.json()
              if (!data.success) throw new Error(data.error || 'Unknown error')

              for (const r of (data.results || [])) {
                if (r.status === 'processed') totalProcessed++
                else if (r.status === 'skipped') totalSkipped++
                else if (r.status === 'error') totalErrors++
              }

              if (!data.hasMore) break
              page++
              if (page > 500) break // Hard safety cap
              
              // Small delay between pages to avoid Zoho rate limits
              await new Promise(r => setTimeout(r, 200))
            }

            phaseResults.push({ entity, pages: page, processed: totalProcessed, skipped: totalSkipped, errors: totalErrors, done: true })
            setFullSync(prev => ({
              ...prev,
              phases: [...phaseResults],
              log: [...prev.log, `  Done: ${totalProcessed} processed, ${totalSkipped} skipped, ${totalErrors} errors across ${page} page(s)`],
            }))
          } catch (err: any) {
            phaseResults.push({ entity, pages: page, processed: totalProcessed, skipped: totalSkipped, errors: totalErrors, done: false, errorDetail: err.message })
            setFullSync(prev => ({
              ...prev,
              phases: [...phaseResults],
              log: [...prev.log, `  ERROR: ${err.message}`],
            }))
          }
        }

        const elapsed = ((Date.now() - startedAt) / 1000 / 60).toFixed(1)
        const totalProc = phaseResults.reduce((s, p) => s + p.processed, 0)
        const totalErr  = phaseResults.reduce((s, p) => s + p.errors, 0)

        setFullSync(prev => ({
          ...prev,
          running: false,
          phase: 'done',
          log: [...prev.log, `-- Complete in ${elapsed}min | ${totalProc} docs updated | ${totalErr} errors`],
        }))
      }
    )
  }

  // ── Bulk Process (single entity, single page loop) ───────────────────────
  const runBulkProcessCosts = async () => {
    const entityLabel = bulkEntity === 'invoices' ? 'invoices' : bulkEntity === 'salesorders' ? 'sales orders' : 'quotes'
    toastConfirm(`Process costs for ${bulkFilter === 'all' ? 'ALL' : bulkFilter} ${entityLabel}? This will recalculate dead costs, dead profit, VIG, profit, and commissions.`, async () => {

      setBulkRunning(true)
      setBulkProgress("Starting...")
      setResults(prev => ({ ...prev, 'bulk-costs': '' }))

      let page = 1
      let totalProcessed = 0
      let totalErrors = 0
      let totalSkipped = 0

      try {
        while (true) {
          setBulkProgress(`Processing page ${page}... (${totalProcessed} done, ${totalErrors} errors)`)

          const res = await fetch('/.netlify/functions/bulk-process-costs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity: bulkEntity,
              page,
              filter: bulkFilter,
              perPage: 25,
              force: bulkForce,
              ...(bulkFilter === 'daterange' ? { startDate: bulkStartDate, endDate: bulkEndDate } : {}),
            })
          })

          const data = await res.json()
          if (!data.success) {
            setResults(prev => ({ ...prev, 'bulk-costs': `Error on page ${page}: ${data.error}` }))
            break
          }

          for (const r of (data.results || [])) {
            if (r.status === 'processed') totalProcessed++
            else if (r.status === 'skipped') totalSkipped++
            else totalErrors++
          }

          if (!data.hasMore) {
            setResults(prev => ({ ...prev, 'bulk-costs': `Done! ${totalProcessed} processed, ${totalSkipped} skipped, ${totalErrors} errors across ${page} pages.` }))
            break
          }

          page++
          if (page > 200) break // Safety
        }
      } catch (err: any) {
        setResults(prev => ({ ...prev, 'bulk-costs': `Error: ${err.message}` }))
      } finally {
        setBulkRunning(false)
        setBulkProgress("")
      }
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const anyBusy = fullSync.running || bulkRunning || loading !== null

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white">Zoho Books Maintenance Scripts</h1>
      <p className="text-neutral-400">Run manual backend scripts to fix or sync Zoho Books data.</p>

      {/* ── Full Data Sync (NEW) ── */}
      <div className="glass-panel border border-emerald-500/40 p-6 rounded-2xl space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2"><FiZap /> Full Data Sync — All Documents</h2>
            <p className="text-sm text-neutral-400 mt-2 max-w-2xl">
              Fetches <strong>every</strong> document from Zoho Books (Invoices, Sales Orders, Quotes) — newest first — recalculates all costs,
              VIG rates, dead profit, commissions, and syncs custom fields back to Zoho.<br />
              <span className="text-emerald-500 font-semibold">Line items and customer info are never modified.</span> Only custom fields and portal DB are updated.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer select-none mt-1">
            <input
              type="checkbox"
              checked={fullSyncForce}
              onChange={e => setFullSyncForce(e.target.checked)}
              disabled={anyBusy}
              className="w-3.5 h-3.5 accent-emerald-500"
            />
            <span className={fullSyncForce ? 'text-emerald-400 font-bold' : ''}>Force Recalc</span>
          </label>
        </div>

        {/* Phase status pills */}
        {fullSync.phases.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {fullSync.phases.map(p => (
              <div key={p.entity} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border ${
                p.done ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-red-500/15 border-red-500/30 text-red-400'
              }`}>
                {p.done ? <FiCheck size={11} /> : <FiAlertCircle size={11} />}
                {p.entity}: {p.processed} updated / {p.skipped} skipped
                {p.errors > 0 && <span className="text-red-400"> / {p.errors} err</span>}
              </div>
            ))}
          </div>
        )}

        {/* Live log */}
        {(fullSync.running || fullSync.phase === 'done' || fullSync.phase === 'error') && fullSync.log.length > 0 && (
          <div className="bg-black/40 border border-white/10 rounded-xl p-3 font-mono text-xs text-neutral-400 max-h-40 overflow-y-auto space-y-0.5">
            {fullSync.log.slice(-20).map((line, i) => (
              <div key={i} className={line.startsWith('--') ? 'text-emerald-400 font-bold' : line.includes('ERROR') ? 'text-red-400' : ''}>{line}</div>
            ))}
            {fullSync.running && (
              <div className="flex items-center gap-1.5 text-emerald-400 mt-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Processing...
              </div>
            )}
          </div>
        )}

        <button
          disabled={anyBusy}
          onClick={runFullSync}
          className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
        >
          {fullSync.running ? <FiLoader className="animate-spin" /> : <FiZap />}
          {fullSync.running
            ? `Syncing ${fullSync.phase === 'invoices' ? 'Invoices' : fullSync.phase === 'salesorders' ? 'Sales Orders' : 'Quotes'}...`
            : fullSync.phase === 'done'
            ? 'Run Full Sync Again'
            : 'Run Full Data Sync (All Documents)'}
        </button>
      </div>

      {/* ── Bulk Process Costs (per entity) ── */}
      <div className="glass-panel border border-indigo-500/30 p-6 rounded-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-indigo-400 flex items-center gap-2"><FiCpu /> Bulk Process Document Costs</h2>
            <p className="text-sm text-neutral-400 mt-2">
              Recalculate <strong>dead costs, dead profit, VIG, profit, and commissions</strong> for a specific entity/filter. Updates all custom fields in Zoho Books.
              Only fields that changed are written (prevents unnecessary API calls).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            <select
              value={bulkEntity}
              onChange={e => setBulkEntity(e.target.value as any)}
              disabled={anyBusy}
              className="bg-neutral-800 border border-neutral-700 text-white text-xs font-bold rounded-lg px-3 py-2"
            >
              <option value="invoices">Invoices</option>
              <option value="salesorders">Sales Orders</option>
              <option value="estimates">Quotes</option>
            </select>
            <select
              value={bulkFilter}
              onChange={e => setBulkFilter(e.target.value as any)}
              disabled={anyBusy}
              className="bg-neutral-800 border border-neutral-700 text-white text-xs font-bold rounded-lg px-3 py-2"
            >
              <option value="daterange">Date Range</option>
              <option value="draft">Draft Only</option>
              <option value="unpaid">Unpaid Only</option>
              <option value="recent">Last 90 Days</option>
              <option value="all">All</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bulkForce}
                onChange={e => setBulkForce(e.target.checked)}
                disabled={anyBusy}
                className="w-3.5 h-3.5 accent-amber-500"
              />
              <span className={bulkForce ? 'text-amber-400 font-bold' : ''}>Force Recalc</span>
            </label>
          </div>
        </div>

        {/* Date range row — shown when filter = daterange */}
        {bulkFilter === 'daterange' && (
          <div className="flex items-center gap-3 flex-wrap bg-indigo-950/30 border border-indigo-500/20 rounded-xl px-4 py-3">
            <span className="text-xs font-bold text-indigo-300">Date Range:</span>
            {/* Month quick-picks */}
            {(() => {
              const today = new Date()
              const months = Array.from({ length: 6 }, (_, i) => {
                const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
                const y = d.getFullYear()
                const m = String(d.getMonth() + 1).padStart(2, '0')
                const lastDay = new Date(y, d.getMonth() + 1, 0).getDate()
                return { label: d.toLocaleString('default', { month: 'short', year: 'numeric' }), start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` }
              })
              return months.map(mn => (
                <button
                  key={mn.start}
                  onClick={() => { setBulkStartDate(mn.start); setBulkEndDate(mn.end) }}
                  disabled={anyBusy}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                    bulkStartDate === mn.start && bulkEndDate === mn.end
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-indigo-500 hover:text-white'
                  }`}
                >
                  {mn.label}
                </button>
              ))
            })()}
            <div className="flex items-center gap-2 ml-auto">
              <input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)}
                disabled={anyBusy}
                className="bg-neutral-800 border border-neutral-700 text-white text-xs rounded-lg px-2 py-1.5 [color-scheme:dark]"
              />
              <span className="text-neutral-500 text-xs">to</span>
              <input type="date" value={bulkEndDate} onChange={e => setBulkEndDate(e.target.value)}
                disabled={anyBusy}
                className="bg-neutral-800 border border-neutral-700 text-white text-xs rounded-lg px-2 py-1.5 [color-scheme:dark]"
              />
            </div>
          </div>
        )}

        {bulkProgress && (
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-3">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
            {bulkProgress}
          </div>
        )}

        {results['bulk-costs'] && (
          <div className={`text-xs font-bold p-3 rounded-lg border ${results['bulk-costs'].includes('Done') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {results['bulk-costs']}
          </div>
        )}

        <button
          disabled={anyBusy}
          onClick={runBulkProcessCosts}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {bulkRunning ? <FiLoader className="animate-spin" /> : <FiCpu />}
          {bulkRunning ? 'Processing...' : `Process ${
            bulkFilter === 'daterange' ? `${bulkStartDate} to ${bulkEndDate}` :
            bulkFilter === 'draft'     ? 'Draft' :
            bulkFilter === 'all'       ? 'All' :
            bulkFilter === 'recent'    ? 'Last 90 Days' : 'Unpaid'
          } ${bulkEntity === 'invoices' ? 'Invoices' : bulkEntity === 'salesorders' ? 'Sales Orders' : 'Quotes'}`}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Script 1 */}
        <div className="glass-panel border border-[var(--border)] p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Process Draft Invoices</h2>
            <p className="text-sm text-neutral-400 mt-2">Finds all Draft invoices in Zoho Books and changes their status to Sent automatically (with rate limiting).</p>
          </div>
          <div>
            {results['drafts'] && <div className="mb-3 text-xs text-emerald-400 flex items-center gap-2 bg-emerald-500/10 p-2 rounded"><FiCheck /> {results['drafts']}</div>}
            <button
              disabled={anyBusy}
              onClick={() => runScript('drafts', '/api/admin/books/process-drafts')}
              className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-black font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {loading === 'drafts' ? <FiLoader className="animate-spin" /> : <FiPlay />}
              Run Script
            </button>
          </div>
        </div>

        {/* Script 2 */}
        <div className="glass-panel border border-[var(--border)] p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Backfill Payment Dates</h2>
            <p className="text-sm text-neutral-400 mt-2">Pulls paid invoices from Zoho Books and syncs their last payment dates into the local database.</p>
          </div>
          <div>
            {results['backfill'] && <div className="mb-3 text-xs text-emerald-400 flex items-center gap-2 bg-emerald-500/10 p-2 rounded"><FiCheck /> {results['backfill']}</div>}
            <button
              disabled={anyBusy}
              onClick={() => runScript('backfill', '/api/admin/books/backfill-payments')}
              className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-black font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {loading === 'backfill' ? <FiLoader className="animate-spin" /> : <FiPlay />}
              Run Script
            </button>
          </div>
        </div>

        {/* Script 3 */}
        <div className="glass-panel border border-[var(--border)] p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Fix Overdue Status</h2>
            <p className="text-sm text-neutral-400 mt-2">Scans local invoices marked Overdue, checks their real status in Zoho, and fixes false-positives.</p>
          </div>
          <div>
            {results['overdue'] && <div className="mb-3 text-xs text-emerald-400 flex items-center gap-2 bg-emerald-500/10 p-2 rounded"><FiCheck /> {results['overdue']}</div>}
            <button
              disabled={anyBusy}
              onClick={() => runScript('overdue', '/api/admin/books/fix-overdue')}
              className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-black font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {loading === 'overdue' ? <FiLoader className="animate-spin" /> : <FiPlay />}
              Run Script
            </button>
          </div>
        </div>

        {/* Script 4: Tariff Dry Run */}
        <div className="glass-panel border border-amber-500/30 p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-lg font-bold text-amber-400">Batch Tariff Update (Dry Run)</h2>
            <p className="text-sm text-neutral-400 mt-2">Preview which 2026 unpaid invoices will get a 12.5% tariff surcharge. No changes are made -- shows what <em>would</em> happen.</p>
          </div>
          <div>
            {results['tariff-dry'] && <div className="mb-3 text-xs text-amber-400 flex items-center gap-2 bg-amber-500/10 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap"><FiCheck /> {results['tariff-dry']}</div>}
            <button
              disabled={anyBusy}
              onClick={async () => {
                setLoading('tariff-dry')
                try {
                  const res = await fetch('/api/batch-tariff-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dryRun: true })
                  })
                  const data = await res.json()
                  if (data.success) {
                    const s = data.summary
                    const invoiceList = (data.invoices || []).map((inv: any) => `  ${inv.invoiceNumber} -- ${inv.customerName}: DC=$${inv.nonGiftDeadCost?.toFixed(2)}, Tariff=$${inv.tariffAmount?.toFixed(2)}`).join('\n')
                    setResults(prev => ({ ...prev, ['tariff-dry']: `Found ${s.totalUnpaid2026} unpaid, ${s.zeroAdjustment} with $0 adj, ${s.processed} eligible, ${s.skipped} skipped.\n${invoiceList}` }))
                  } else {
                    setResults(prev => ({ ...prev, ['tariff-dry']: `Error: ${data.error}` }))
                  }
                } catch (err: any) {
                  setResults(prev => ({ ...prev, ['tariff-dry']: `Error: ${err.message}` }))
                } finally {
                  setLoading(null)
                }
              }}
              className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {loading === 'tariff-dry' ? <FiLoader className="animate-spin" /> : <FiPlay />}
              Preview (Dry Run)
            </button>
          </div>
        </div>

        {/* Script 5: Tariff Live */}
        <div className="glass-panel border border-red-500/30 p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-lg font-bold text-red-400">Batch Tariff Update (LIVE)</h2>
            <p className="text-sm text-neutral-400 mt-2">Applies 12.5% tariff surcharge to all qualifying 2026 unpaid invoices. <strong className="text-red-400">This modifies live invoices.</strong></p>
          </div>
          <div>
            {results['tariff-live'] && <div className="mb-3 text-xs text-emerald-400 flex items-center gap-2 bg-emerald-500/10 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap"><FiCheck /> {results['tariff-live']}</div>}
            <button
              disabled={anyBusy}
              onClick={async () => {
                toastConfirm('This will MODIFY live Zoho Books invoices by adding tariff surcharges. Are you absolutely sure?', async () => {
                  setLoading('tariff-live')
                  try {
                    const res = await fetch('/api/batch-tariff-update', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dryRun: false })
                    })
                    const data = await res.json()
                    if (data.success) {
                      const s = data.summary
                      const errors = (data.invoices || []).filter((inv: any) => inv.status === 'error')
                      const errorList = errors.length > 0 ? '\n\nErrors:\n' + errors.map((inv: any) => `  ${inv.invoiceNumber} (${inv.customerName}): ${inv.error}`).join('\n') : ''
                      setResults(prev => ({ ...prev, ['tariff-live']: `Done! ${s.processed} invoices updated, ${s.skipped} skipped, ${s.errors} errors.${errorList}` }))
                    } else {
                      setResults(prev => ({ ...prev, ['tariff-live']: `Error: ${data.error}` }))
                    }
                  } catch (err: any) {
                    setResults(prev => ({ ...prev, ['tariff-live']: `Error: ${err.message}` }))
                  } finally {
                    setLoading(null)
                  }
                });
              }}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {loading === 'tariff-live' ? <FiLoader className="animate-spin" /> : <FiAlertCircle />}
              Run LIVE Update
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
