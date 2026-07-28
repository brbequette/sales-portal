"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from 'react-hot-toast'
import { FiChevronDown, FiChevronUp, FiUser, FiZap, FiRefreshCw, FiAlertTriangle } from "react-icons/fi"
import VigManagementBuilder from "@/components/VigManagementBuilder"

export default function VigManagementPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [reps, setReps] = useState<any[]>([])
  const [historicalRates, setHistoricalRates] = useState<any[]>([])
  const [expandedReps, setExpandedReps] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/get-rep-stats?showHidden=true")
      const data = await res.json()
      if (data.success) {
        setReps(data.reps || [])
        setHistoricalRates(data.historicalVigRates || [])
        // Expand ALL reps by default so historical data is immediately visible
        if (data.reps && data.reps.length > 0) {
          const initialExpanded: Record<string, boolean> = {}
          data.reps.forEach((r: any) => { initialExpanded[r.repId] = true })
          setExpandedReps(initialExpanded)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (repId: string) => {
    setExpandedReps(prev => ({ ...prev, [repId]: !prev[repId] }))
  }

  const handleToggleConstantVig = async (repId: string, enabled: boolean, currentVal: number) => {
    const rep = reps.find(r => r.repId === repId)
    if (!rep) return

    const confirmMsg = `⚠️ Change Constant VIG Setting for ${rep.repName}?\n\nThis will override all monthly VIG goals for this rep and recalculate all documents. Proceed?`
    if (!window.confirm(confirmMsg)) return

    setReps(prev => prev.map(r => r.repId === repId ? { ...r, constantVigEnabled: enabled } : r))
    
    await fetch("/api/update-vig-settings", {
      method: "POST",
      body: JSON.stringify({
        action: "UPDATE_CONSTANT",
        repId: repId,
        constantVigEnabled: enabled,
        constantVigValue: currentVal
      })
    })

    // Recalculate all documents for this rep
    const recalcRes = await fetch("/api/admin/recalculate-vig-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repId, applyToAll: false })
    })
    const recalcData = await recalcRes.json()
    if (recalcData.success) {
      toast.success(`Updated Constant VIG & recalculated ${recalcData.updatedCount || 0} document(s) for ${rep.repName}!`, { duration: 5000 })
    }

    fetchStats()
  }

  const handleUpdateConstantValue = async (repId: string, enabled: boolean, val: string) => {
    const num = parseFloat(val)
    if (isNaN(num)) return

    const rep = reps.find(r => r.repId === repId)
    if (!rep) return

    const confirmMsg = `⚠️ Set Constant VIG Rate to ${num}x for ${rep.repName}?\n\nThis will update and recalculate all invoices and sales orders for this sales rep. Proceed?`
    if (!window.confirm(confirmMsg)) return
    
    await fetch("/api/update-vig-settings", {
      method: "POST",
      body: JSON.stringify({
        action: "UPDATE_CONSTANT",
        repId: repId,
        constantVigEnabled: enabled,
        constantVigValue: num
      })
    })

    const recalcRes = await fetch("/api/admin/recalculate-vig-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repId, applyToAll: false })
    })
    const recalcData = await recalcRes.json()
    if (recalcData.success) {
      toast.success(`Set Constant VIG Rate to ${num}x & recalculated ${recalcData.updatedCount || 0} document(s) for ${rep.repName}!`, { duration: 5000 })
    }

    fetchStats()
  }

  const handleUpdateMonthlyGoal = async (repId: string, monthKey: string, field: string, value: any) => {
    const rep = reps.find(r => r.repId === repId)
    if (!rep) return

    const monthData = historicalRates.find(h => h.monthKey === monthKey)?.reps?.[repId]
    if (!monthData) return

    const fieldLabel = field === 'manualVigRate' ? `Manual VIG Rate Override` : field
    const confirmMsg = `⚠️ VERIFICATION REQUIRED:\n\nRecalculate all documents for ${rep.repName} in ${monthKey}?\n\nChanging ${fieldLabel} to "${value}" will immediately recalculate costs, net profit, and commissions across all invoices and sales orders for this month.\n\nDo you want to proceed?`
    
    if (!window.confirm(confirmMsg)) {
      fetchStats() // Revert UI input
      return
    }

    const payload = {
      action: "UPDATE_MONTHLY_GOAL",
      repId: repId,
      monthKey,
      metric: monthData.metric,
      profitGoal: monthData.profitGoal,
      subtotalGoal: monthData.subtotalGoal,
      manualVigRate: monthData.manualVigRate,
      [field]: value
    }

    try {
      await fetch("/api/update-vig-settings", {
        method: "POST",
        body: JSON.stringify(payload)
      })

      // Immediately recalculate documents for this rep and month
      const recalcRes = await fetch("/api/admin/recalculate-vig-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repId: repId, monthKey })
      })
      const recalcData = await recalcRes.json()
      if (recalcData.success) {
        toast.success(`✅ Saved & recalculated ${recalcData.updatedCount || 0} document(s) for ${rep.repName} (${monthKey})!`, { duration: 5000 })
      }
    } catch (e: any) {
      toast.error("Error saving VIG goal: " + e.message)
    }

    fetchStats()
  }

  const handleSyncToZoho = async (repId: string, monthKey: string) => {
    const rep = reps.find(r => r.repId === repId)
    if (!rep) return
    const monthData = historicalRates.find(h => h.monthKey === monthKey)?.reps?.[repId]
    if (!monthData) return

    const syncKey = `${repId}_${monthKey}`
    setSyncing(prev => ({ ...prev, [syncKey]: true }))
    try {
      const res = await fetch("/api/sync-vig-to-zoho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repId: repId,
          monthKey,
          newVigRate: monthData.vigRate
        })
      })

      const contentType = res.headers.get("content-type") || ""
      let data: any = {}
      if (contentType.includes("application/json")) {
        data = await res.json()
      } else {
        const text = await res.text()
        throw new Error(`Server HTTP ${res.status}: ${text.replace(/<[^>]*>?/gm, '').substring(0, 120)}`)
      }

      if (res.ok && data.success) {
        toast.success(data.message || "Synced VIG rate to Zoho Books successfully!", { duration: 6000 })
        fetchStats()
      } else {
        toast.error("Error: " + (data.error || data.message || `Server returned status ${res.status}`))
      }
    } catch (err: any) {
      toast.error("Failed to sync: " + err.message)
    } finally {
      setSyncing(prev => ({ ...prev, [syncKey]: false }))
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-neutral-400">Loading VIG management...</div>
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto safe-bottom">
        {/* Full VIG Management Builder (Global Controls & Presets) */}
        <VigManagementBuilder />

        {/* Header section */}
        <div className="flex items-center justify-between mt-8 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FiUser className="text-emerald-400" /> Sales Rep Historical VIG Rate Cards
            </h2>
            <p className="text-xs text-neutral-400">Click any employee card to expand and view/edit all historical monthly VIG rates & goals.</p>
          </div>
        </div>

        {/* EXPANDABLE ACCORDION DIVS FOR ALL SALES REPS */}
        <div className="space-y-4">
          {reps.map((rep) => {
            const isExpanded = !!expandedReps[rep.repId]
            const currentMonthKey = historicalRates[0]?.monthKey || "2026-07"
            const currentVigData = historicalRates[0]?.reps?.[rep.repId]
            const currentVigRate = currentVigData?.vigRate || 1.3

            return (
              <div 
                key={rep.repId} 
                className="glass-panel/50 border border-white/10 rounded-xl overflow-hidden backdrop-blur-md transition-all duration-200"
              >
                {/* Rep Header Bar (Clickable) */}
                <div 
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-black/40 hover:bg-black/60 cursor-pointer border-b border-white/5"
                  onClick={() => toggleExpand(rep.repId)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-base shadow-inner">
                      {rep.repName?.split(" ").map((n: string) => n[0]).join("").substring(0, 2) || "SR"}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        {rep.repName}
                        {rep.constantVigEnabled && (
                          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                            Constant VIG ({rep.constantVigValue || 1.5}x)
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">{rep.email || "Sales Representative"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6" onClick={(e) => e.stopPropagation()}>
                    {/* Constant VIG Toggle inside Card Header */}
                    <div className="flex items-center gap-3 bg-black/60 px-3 py-1.5 rounded-lg border border-white/10">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-neutral-300">
                        <input 
                          type="checkbox"
                          checked={rep.constantVigEnabled}
                          onChange={(e) => handleToggleConstantVig(rep.repId, e.target.checked, rep.constantVigValue || 1.5)}
                          className="w-4 h-4 accent-emerald-500 rounded"
                        />
                        <span>Constant VIG</span>
                      </label>
                      {rep.constantVigEnabled && (
                        <input 
                          type="number"
                          step="0.1"
                          defaultValue={rep.constantVigValue || 1.5}
                          onBlur={(e) => handleUpdateConstantValue(rep.repId, rep.constantVigEnabled, e.target.value)}
                          className="w-16 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-center text-emerald-400 font-bold text-xs focus:outline-none focus:border-emerald-500"
                        />
                      )}
                    </div>

                    {/* Active Rate Badge */}
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Current VIG</div>
                      <div className={`text-base font-black ${currentVigRate === 1.0 ? 'text-indigo-400' : currentVigRate === 1.3 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {currentVigRate.toFixed(1)}x
                      </div>
                    </div>

                    {/* Prominent Expand/Collapse Button for Historical Table */}
                    <button 
                      onClick={() => toggleExpand(rep.repId)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs border border-emerald-500/40 shadow-sm transition-all"
                      title={isExpanded ? "Hide Historical Rates" : "Show Historical Rates"}
                    >
                      <span>{isExpanded ? "Hide 72-Month Historical Rates" : "📅 View 72-Month Historical Rates"}</span>
                      {isExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* EXPANDABLE CONTENT DIV (Multi-row per record responsive cards) */}
                {isExpanded && (
                  <div className="p-4 sm:p-6 bg-black/30 border-t border-white/5 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider px-1 pb-1 border-b border-white/10">
                      <span>Historical Monthly Rate Records</span>
                      <span>72-Month Timeline</span>
                    </div>

                    <div className="space-y-3">
                      {historicalRates.map((h) => {
                        const monthData = h.reps?.[rep.repId] || h.reps?.[rep.id] || (rep.repName ? h.reps?.[rep.repName] : null) || (rep.repName ? h.reps?.[rep.repName.toLowerCase().trim()] : null) || {
                          metric: "PROFIT",
                          target: 20000,
                          subtotalGoal: 40000,
                          profitGoal: 20000,
                          sales: 0,
                          profit: 0,
                          subtotal: 0,
                          vigRate: 1.3,
                          manualVigRate: null,
                          lastSyncedVigRate: null,
                          metGoal: false
                        }

                        const isConstant = rep.constantVigEnabled
                        const isManual = monthData.manualVigRate !== null
                        const syncKey = `${rep.repId}_${h.monthKey}`

                        return (
                          <div 
                            key={h.monthKey} 
                            className="glass-panel border border-white/10 rounded-xl p-3.5 space-y-3 hover:border-emerald-500/30 transition-all duration-200"
                          >
                            {/* Row 1: Header (Month, Metric Selector, VIG Rate Badge, Sync Button) */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-2.5">
                              <div className="flex items-center gap-3">
                                <div className="font-bold text-white text-sm">
                                  {h.monthName} <span className="text-xs font-normal text-neutral-400">({h.monthKey})</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-md border border-white/10">
                                  <span className="text-[10px] uppercase font-bold text-neutral-400">Target:</span>
                                  <select 
                                    value={monthData.metric || "PROFIT"}
                                    onChange={(e) => handleUpdateMonthlyGoal(rep.repId, h.monthKey, "metric", e.target.value)}
                                    disabled={isConstant}
                                    className="bg-transparent text-xs font-bold text-emerald-400 focus:outline-none disabled:opacity-50"
                                  >
                                    <option value="PROFIT" className="bg-neutral-900 text-white">Profit Goal</option>
                                    <option value="SUBTOTAL" className="bg-neutral-900 text-white">Subtotal Goal</option>
                                  </select>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {/* VIG Rate Badge */}
                                <div className="flex items-center gap-2">
                                  <div className={`px-2.5 py-1 rounded-lg border text-xs font-black flex items-center gap-1 ${isConstant ? 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10' : isManual ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : monthData.vigRate === 1.3 ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-rose-500/40 text-rose-300 bg-rose-500/10'}`}>
                                    <span>VIG: {monthData.vigRate.toFixed(1)}x</span>
                                  </div>
                                  {monthData.lastSyncedVigRate !== undefined && monthData.lastSyncedVigRate !== monthData.vigRate && (
                                    <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold animate-pulse">
                                      🟡 Changed
                                    </span>
                                  )}
                                </div>

                                {/* Sync Button */}
                                <button
                                  onClick={() => handleSyncToZoho(rep.repId, h.monthKey)}
                                  disabled={syncing[syncKey]}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white text-xs font-bold rounded-lg shadow-md transition flex items-center gap-1.5 shrink-0"
                                >
                                  {syncing[syncKey] ? (
                                    <>
                                      <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                      <span>Syncing...</span>
                                    </>
                                  ) : (
                                    <span>{monthData.lastSyncedVigRate !== undefined && monthData.lastSyncedVigRate !== monthData.vigRate ? "Push New Rate" : "Push VIG to Zoho"}</span>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Row 2: Metrics Grid (Subtotal Goal/Act, Profit Goal/Act, Manual Override) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-black/40 p-3 rounded-lg border border-white/5 text-xs">
                              {/* Subtotal Goal & Actual */}
                              <div className="space-y-1">
                                <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Subtotal Goal & Actual</div>
                                <div className="flex items-center gap-1">
                                  <span className="text-neutral-500 font-bold">$</span>
                                  <input 
                                    type="number" 
                                    defaultValue={monthData.subtotalGoal || 40000}
                                    onBlur={(e) => handleUpdateMonthlyGoal(rep.repId, h.monthKey, "subtotalGoal", e.target.value)}
                                    disabled={isConstant}
                                    className="w-24 bg-black/60 border border-white/10 rounded px-2 py-0.5 text-white disabled:opacity-50 focus:outline-none focus:border-emerald-500 font-mono text-xs font-bold"
                                  />
                                </div>
                                <div className={`font-mono text-xs font-bold pt-0.5 ${(monthData.subtotal || 0) >= (monthData.subtotalGoal || 40000) ? 'text-emerald-400' : 'text-sky-300'}`}>
                                  Actual: ${(monthData.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </div>
                              </div>

                              {/* Profit Goal & Actual */}
                              <div className="space-y-1">
                                <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Profit Goal & Actual</div>
                                <div className="flex items-center gap-1">
                                  <span className="text-neutral-500 font-bold">$</span>
                                  <input 
                                    type="number" 
                                    defaultValue={monthData.profitGoal || 20000}
                                    onBlur={(e) => handleUpdateMonthlyGoal(rep.repId, h.monthKey, "profitGoal", e.target.value)}
                                    disabled={isConstant}
                                    className="w-24 bg-black/60 border border-white/10 rounded px-2 py-0.5 text-white disabled:opacity-50 focus:outline-none focus:border-emerald-500 font-mono text-xs font-bold"
                                  />
                                </div>
                                <div className={`font-mono text-xs font-bold pt-0.5 ${(monthData.deadProfit || monthData.profit || 0) >= (monthData.profitGoal || 20000) ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  Actual Dead Profit: ${(monthData.deadProfit ?? monthData.profit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </div>
                              </div>

                              {/* Manual VIG Override */}
                              <div className="space-y-1">
                                <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Manual VIG Override</div>
                                <div className="flex items-center gap-2 pt-0.5">
                                  <input 
                                    type="number"
                                    step="0.1"
                                    placeholder="Auto"
                                    defaultValue={monthData.manualVigRate || ""}
                                    onBlur={(e) => handleUpdateMonthlyGoal(rep.repId, h.monthKey, "manualVigRate", e.target.value)}
                                    disabled={isConstant}
                                    className="w-20 bg-black/60 border border-white/10 rounded px-2 py-0.5 text-center text-xs text-amber-400 placeholder-neutral-600 disabled:opacity-50 focus:outline-none focus:border-amber-500 font-bold"
                                  />
                                  {isManual && <span className="text-[9px] text-amber-300 uppercase font-bold px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded">Override Active</span>}
                                </div>
                                <div className="text-[10px] text-neutral-500">Default rate calculated from goals</div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}


