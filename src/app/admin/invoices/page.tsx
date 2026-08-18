"use client"

import { toastConfirm } from '@/lib/toastConfirm'

import { useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { FiDatabase, FiRefreshCw, FiAlertTriangle, FiCheckCircle } from "react-icons/fi"

export default function InvoiceManagementPage() {
  const { isInitialized } = useZoho()
  
  const [selectedMonth, setSelectedMonth] = useState("")
  const [force, setForce] = useState(true)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState("")

  const handleRunBulkFix = async () => {
    toastConfirm("Are you sure you want to recalculate invoice costs? This will query Zoho for live invoice data and update the database.", async () => {
    
    setRunning(true)
    setResults(null)
    setError("")
    
    try {
      const res = await fetch("/api/bulk-calculate-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docTypes: ["invoices"],
          month: selectedMonth || undefined,
          force
        })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        setResults(data)
      } else {
        setError(data.error || "Failed to run bulk calculation.")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  });}

  if (!isInitialized) return <div className="p-8 text-white">Loading...</div>

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
            <FiDatabase className="text-blue-500" size={17} />
          </div>
          <div>
            <h1 className="page-title">Invoice Cost Management</h1>
            <p className="page-subtitle">Recalculate and fix historical invoice numbers in bulk</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="max-w-4xl space-y-5">
          <div className="glass-panel border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-6">Bulk Fix Utility</h2>
            
            <div className="bg-neutral-800 p-6 rounded-lg border border-neutral-700 space-y-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 text-amber-500"><FiAlertTriangle size={24} /></div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Warning: Resource Intensive</p>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    This utility queries the live Zoho Books API for every targeted invoice to recalculate the Profit, Dead Cost, and Commission numbers based on the latest rates. 
                    It will then synchronize those corrected numbers back into the local database and push the updates back to Zoho.
                  </p>
                </div>
              </div>

              <hr className="border-neutral-700 my-4" />

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-2">Target Month (Optional)</label>
                  <input 
                    type="month" 
                    value={selectedMonth} 
                    onChange={e => setSelectedMonth(e.target.value)} 
                    className="w-full glass-panel border border-neutral-700 rounded-lg p-3 text-white color-scheme-dark" 
                  />
                  <p className="text-xs text-neutral-500 mt-1">Leave blank to target ALL invoices (Not recommended without limiting).</p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input 
                    type="checkbox" 
                    id="force" 
                    checked={force} 
                    onChange={e => setForce(e.target.checked)} 
                    className="w-4 h-4 glass-panel border-neutral-700 rounded text-blue-500" 
                  />
                  <label htmlFor="force" className="text-sm text-neutral-300 font-bold cursor-pointer">
                    Force Recalculate (Override existing values)
                  </label>
                </div>
                
                <div className="pt-4">
                  <button 
                    disabled={running}
                    onClick={handleRunBulkFix}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                  >
                    {running ? <FiRefreshCw className="animate-spin" /> : <FiDatabase />} 
                    {running ? "Processing..." : "Run Bulk Recalculation"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm font-bold">
              {error}
            </div>
          )}

          {results && (
            <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-6">
              <h2 className="text-emerald-400 font-bold flex items-center gap-2 mb-4"><FiCheckCircle /> Bulk Fix Completed!</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="glass-panel p-4 rounded-lg border border-white/10">
                  <p className="text-xs text-neutral-500 font-bold uppercase">Processed</p>
                  <p className="text-2xl font-bold text-white">{results.stats?.processed || 0}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg border border-white/10">
                  <p className="text-xs text-neutral-500 font-bold uppercase">Updated</p>
                  <p className="text-2xl font-bold text-blue-400">{results.stats?.updated || 0}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg border border-white/10">
                  <p className="text-xs text-neutral-500 font-bold uppercase">Errors</p>
                  <p className="text-2xl font-bold text-red-400">{results.stats?.errors || 0}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg border border-white/10">
                  <p className="text-xs text-neutral-500 font-bold uppercase">Skipped</p>
                  <p className="text-2xl font-bold text-neutral-400">{results.stats?.skipped || 0}</p>
                </div>
              </div>
              
              {results.message && (
                 <p className="text-sm text-neutral-400 glass-panel p-3 rounded-lg border border-white/10 font-mono">
                   {results.message}
                 </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


