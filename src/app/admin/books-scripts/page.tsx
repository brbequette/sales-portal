"use client"
import React, { useState } from "react"
import { FiPlay, FiCheck, FiAlertCircle, FiLoader } from "react-icons/fi"

export default function BooksScriptsPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  const runScript = async (scriptName: string, endpoint: string) => {
    if (!confirm(`Are you sure you want to run ${scriptName}? This may modify live Zoho Books data.`)) return
    
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
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white">Zoho Books Maintenance Scripts</h1>
      <p className="text-neutral-400">Run manual backend scripts to fix or sync Zoho Books data.</p>
      
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
                if (!confirm('⚠️ This will MODIFY live Zoho Books invoices by adding tariff surcharges. Are you absolutely sure?')) return
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
                    setResults(prev => ({ ...prev, ['tariff-live']: `Done! ${s.processed} invoices updated, ${s.skipped} skipped, ${s.errors} errors.` }))
                  } else {
                    setResults(prev => ({ ...prev, ['tariff-live']: `Error: ${data.error}` }))
                  }
                } catch (err: any) {
                  setResults(prev => ({ ...prev, ['tariff-live']: `Error: ${err.message}` }))
                } finally {
                  setLoading(null)
                }
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
