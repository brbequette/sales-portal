"use client"

import { toastConfirm } from '@/lib/toastConfirm'
import React, { useState } from "react"
import { FiPlay, FiCheck, FiAlertCircle, FiLoader, FiCpu } from "react-icons/fi"

export default function BooksScriptsPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  // Bulk process costs state
  const [bulkFilter, setBulkFilter] = useState<'unpaid' | 'all' | 'recent'>('unpaid')
  const [bulkEntity, setBulkEntity] = useState<'invoices' | 'salesorders' | 'estimates'>('invoices')
  const [bulkProgress, setBulkProgress] = useState("")
  const [bulkRunning, setBulkRunning] = useState(false)

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
  });}

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
          body: JSON.stringify({ entity: bulkEntity, page, filter: bulkFilter, perPage: 25 })
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
          setResults(prev => ({ ...prev, 'bulk-costs': `✅ Complete! ${totalProcessed} processed, ${totalSkipped} skipped, ${totalErrors} errors across ${page} pages.` }))
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
  });}

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white">Zoho Books Maintenance Scripts</h1>
      <p className="text-neutral-400">Run manual backend scripts to fix or sync Zoho Books data.</p>
      
      {/* â”€â”€ Bulk Process Costs — Full Width â”€â”€ */}
      <div className="glass-panel border border-indigo-500/30 p-6 rounded-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-indigo-400 flex items-center gap-2"><FiCpu /> Bulk Process Document Costs</h2>
            <p className="text-sm text-neutral-400 mt-2">
              Recalculate <strong>dead costs, dead profit, VIG, profit, and commissions</strong> for invoices, sales orders, or quotes. Updates all custom fields in Zoho Books. 
              Only fields that changed are written (prevents unnecessary API calls).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={bulkEntity}
              onChange={e => setBulkEntity(e.target.value as any)}
              disabled={bulkRunning}
              className="bg-neutral-800 border border-neutral-700 text-white text-xs font-bold rounded-lg px-3 py-2 shrink-0"
            >
              <option value="invoices">Invoices</option>
              <option value="salesorders">Sales Orders</option>
              <option value="estimates">Quotes</option>
            </select>
            <select
              value={bulkFilter}
              onChange={e => setBulkFilter(e.target.value as any)}
              disabled={bulkRunning}
              className="bg-neutral-800 border border-neutral-700 text-white text-xs font-bold rounded-lg px-3 py-2 shrink-0"
            >
              <option value="unpaid">Unpaid Only</option>
              <option value="recent">Last 90 Days</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        {bulkProgress && (
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-3">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
            {bulkProgress}
          </div>
        )}

        {results['bulk-costs'] && (
          <div className={`text-xs font-bold p-3 rounded-lg border ${results['bulk-costs'].includes('✅') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {results['bulk-costs']}
          </div>
        )}

        <button
          disabled={bulkRunning || loading !== null}
          onClick={runBulkProcessCosts}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {bulkRunning ? <FiLoader className="animate-spin" /> : <FiCpu />}
          {bulkRunning ? 'Processing...' : `Process ${bulkFilter === 'all' ? 'All' : bulkFilter === 'recent' ? 'Recent' : 'Unpaid'} ${bulkEntity === 'invoices' ? 'Invoices' : bulkEntity === 'salesorders' ? 'Sales Orders' : 'Quotes'}`}
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
              disabled={loading !== null}
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
              disabled={loading !== null}
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
              disabled={loading !== null}
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
            <p className="text-sm text-neutral-400 mt-2">Preview which 2026 unpaid invoices will get a 12.5% tariff surcharge. No changes are made — shows what <em>would</em> happen.</p>
          </div>
          <div>
            {results['tariff-dry'] && <div className="mb-3 text-xs text-amber-400 flex items-center gap-2 bg-amber-500/10 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap"><FiCheck /> {results['tariff-dry']}</div>}
            <button 
              disabled={loading !== null}
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
                    const invoiceList = (data.invoices || []).map((inv: any) => `  ${inv.invoiceNumber} — ${inv.customerName}: DC=$${inv.nonGiftDeadCost?.toFixed(2)}, Tariff=$${inv.tariffAmount?.toFixed(2)}`).join('\n')
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

        {/* Script 5: Tariff Live Run */}
        <div className="glass-panel border border-red-500/30 p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-lg font-bold text-red-400">Batch Tariff Update (LIVE)</h2>
            <p className="text-sm text-neutral-400 mt-2">Applies 12.5% tariff surcharge to all qualifying 2026 unpaid invoices. <strong className="text-red-400">This modifies live invoices.</strong></p>
          </div>
          <div>
            {results['tariff-live'] && <div className="mb-3 text-xs text-emerald-400 flex items-center gap-2 bg-emerald-500/10 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap"><FiCheck /> {results['tariff-live']}</div>}
            <button 
              disabled={loading !== null}
              onClick={async () => {
                toastConfirm('⚠ï¸ This will MODIFY live Zoho Books invoices by adding tariff surcharges. Are you absolutely sure?', async () => {
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
              });}}
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


