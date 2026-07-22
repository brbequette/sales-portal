"use client"


import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from 'react-hot-toast'
import VigManagementBuilder from "@/components/VigManagementBuilder"

export default function VigManagementPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [reps, setReps] = useState<any[]>([])
  const [historicalRates, setHistoricalRates] = useState<any[]>([])
  const [selectedRepId, setSelectedRepId] = useState<string>("")
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/get-rep-stats")
      const data = await res.json()
      if (data.success) {
        setReps(data.reps)
        setHistoricalRates(data.historicalVigRates)
        if (data.reps.length > 0 && !selectedRepId) {
          setSelectedRepId(data.reps[0].repId)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const selectedRep = reps.find(r => r.repId === selectedRepId)

  const handleToggleConstantVig = async (enabled: boolean) => {
    if (!selectedRep) return
    setReps(prev => prev.map(r => r.repId === selectedRepId ? { ...r, constantVigEnabled: enabled } : r))
    
    await fetch("/api/update-vig-settings", {
      method: "POST",
      body: JSON.stringify({
        action: "UPDATE_CONSTANT",
        repId: selectedRepId,
        constantVigEnabled: enabled,
        constantVigValue: selectedRep.constantVigValue
      })
    })
    fetchStats()
  }

  const handleUpdateConstantValue = async (val: string) => {
    if (!selectedRep) return
    const num = parseFloat(val)
    if (isNaN(num)) return
    
    await fetch("/api/update-vig-settings", {
      method: "POST",
      body: JSON.stringify({
        action: "UPDATE_CONSTANT",
        repId: selectedRepId,
        constantVigEnabled: selectedRep.constantVigEnabled,
        constantVigValue: num
      })
    })
    fetchStats()
  }

  const handleUpdateMonthlyGoal = async (monthKey: string, field: string, value: any) => {
    if (!selectedRep) return
    
    const monthData = historicalRates.find(h => h.monthKey === monthKey)?.reps?.[selectedRepId]
    if (!monthData) return
    
    const payload = {
      action: "UPDATE_MONTHLY_GOAL",
      repId: selectedRepId,
      monthKey,
      metric: monthData.metric,
      profitGoal: monthData.profitGoal,
      subtotalGoal: monthData.subtotalGoal,
      manualVigRate: monthData.manualVigRate,
      [field]: value
    }

    await fetch("/api/update-vig-settings", {
      method: "POST",
      body: JSON.stringify(payload)
    })
    fetchStats()
  }

  const handleSyncToZoho = async (monthKey: string) => {
    if (!selectedRep) return
    const monthData = historicalRates.find(h => h.monthKey === monthKey)?.reps?.[selectedRepId]
    if (!monthData) return

    setSyncing(prev => ({ ...prev, [monthKey]: true }))
    try {
      const res = await fetch("/api/sync-vig-to-zoho", {
        method: "POST",
        body: JSON.stringify({
          repId: selectedRepId,
          monthKey,
          newVigRate: monthData.vigRate
        })
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message, { duration: 6000 })
        fetchStats()
      } else {
        toast.error("Error: " + data.error)
      }
    } catch (err: any) {
      toast.error("Failed to sync: " + err.message)
    } finally {
      setSyncing(prev => ({ ...prev, [monthKey]: false }))
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-neutral-400">Loading VIG management...</div>
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto safe-bottom">
        {/* Full VIG Management Builder (Global Recalculate & Presets) */}
        <VigManagementBuilder />

        {/* Rep Selector & Historical Overrides Table */}
        <div className="glass-panel/50 border border-white/10 rounded-xl p-6 backdrop-blur-md">
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
            <div className="flex-1">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest block mb-2">Select Sales Rep</label>
              <select 
                value={selectedRepId}
                onChange={(e) => setSelectedRepId(e.target.value)}
                className="w-full md:w-64 bg-black border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
              >
                {reps.map(r => (
                  <option key={r.repId} value={r.repId}>{r.repName}</option>
                ))}
              </select>
            </div>

            {selectedRep && (
              <div className="flex-1 flex flex-col sm:flex-row gap-6 p-4 bg-black/40 rounded-lg border border-white/10/50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedRep.constantVigEnabled}
                    onChange={(e) => handleToggleConstantVig(e.target.checked)}
                    className="w-5 h-5 accent-emerald-500 rounded glass-panel border-neutral-700"
                  />
                  <div>
                    <div className="text-sm font-bold text-white">Enable Constant VIG</div>
                    <div className="text-xs text-neutral-500">Overrides all monthly goals</div>
                  </div>
                </label>
                
                {selectedRep.constantVigEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-400">Value:</span>
                    <input 
                      type="number"
                      step="0.1"
                      defaultValue={selectedRep.constantVigValue || 1.5}
                      onBlur={(e) => handleUpdateConstantValue(e.target.value)}
                      className="w-20 glass-panel border border-neutral-700 rounded px-2 py-1 text-center text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Monthly History Table */}
        {selectedRep && (
          <div className="glass-panel/50 border border-white/10 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-black/50 text-neutral-400 border-b border-white/10">
                    <th className="px-6 py-4 font-bold tracking-wider uppercase text-xs">Month</th>
                    <th className="px-6 py-4 font-bold tracking-wider uppercase text-xs">Metric Selection</th>
                    <th className="px-6 py-4 font-bold tracking-wider uppercase text-xs">Subtotal Goal</th>
                    <th className="px-6 py-4 font-bold tracking-wider uppercase text-xs">Profit Goal</th>
                    <th className="px-6 py-4 font-bold tracking-wider uppercase text-xs">Actual Sales</th>
                    <th className="px-6 py-4 font-bold tracking-wider uppercase text-xs">Manual VIG Override</th>
                    <th className="px-6 py-4 font-bold tracking-wider uppercase text-xs text-center">Calculated VIG</th>
                    <th className="px-6 py-4 font-bold tracking-wider uppercase text-xs text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {historicalRates.map((h) => {
                    const monthData = h.reps?.[selectedRepId]
                    if (!monthData) return null
                    
                    const isConstant = selectedRep.constantVigEnabled
                    const isManual = monthData.manualVigRate !== null
                    
                    return (
                      <tr key={h.monthKey} className="hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/30 transition">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">{h.monthName}</div>
                          <div className="text-xs text-neutral-500">{h.monthKey}</div>
                        </td>
                        <td className="px-6 py-4">
                          <select 
                            value={monthData.metric || "PROFIT"}
                            onChange={(e) => handleUpdateMonthlyGoal(h.monthKey, "metric", e.target.value)}
                            disabled={isConstant}
                            className="bg-black border border-white/10 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                          >
                            <option value="PROFIT">Profit</option>
                            <option value="SUBTOTAL">Subtotal</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <span className="text-neutral-500">$</span>
                            <input 
                              type="number" 
                              defaultValue={monthData.subtotalGoal || 40000}
                              onBlur={(e) => handleUpdateMonthlyGoal(h.monthKey, "subtotalGoal", e.target.value)}
                              disabled={isConstant}
                              className="w-24 bg-transparent border-b border-transparent hover:border-neutral-700 focus:border-emerald-500 focus:outline-none text-white disabled:opacity-50 px-1 py-0.5"
                            />
                          </div>
                          <div className="text-[10px] text-neutral-600 mt-1">Act: ${(monthData.subtotal || 0).toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <span className="text-neutral-500">$</span>
                            <input 
                              type="number" 
                              defaultValue={monthData.profitGoal || 20000}
                              onBlur={(e) => handleUpdateMonthlyGoal(h.monthKey, "profitGoal", e.target.value)}
                              disabled={isConstant}
                              className="w-24 bg-transparent border-b border-transparent hover:border-neutral-700 focus:border-emerald-500 focus:outline-none text-white disabled:opacity-50 px-1 py-0.5"
                            />
                          </div>
                          <div className="text-[10px] text-neutral-600 mt-1">Act: ${(monthData.profit || 0).toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`font-mono text-xs ${monthData.sales >= monthData.target ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ${(monthData.sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-neutral-500 mt-1">Target: ${(monthData.target || 0).toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <input 
                              type="number"
                              step="0.1"
                              placeholder="Auto"
                              defaultValue={monthData.manualVigRate || ""}
                              onBlur={(e) => handleUpdateMonthlyGoal(h.monthKey, "manualVigRate", e.target.value)}
                              disabled={isConstant}
                              className="w-16 bg-black border border-white/10 rounded px-2 py-1 text-center text-sm text-amber-400 placeholder-neutral-700 disabled:opacity-50 focus:outline-none focus:border-amber-500"
                            />
                            {isManual && <span className="text-[10px] text-amber-500 uppercase font-bold px-1.5 py-0.5 bg-amber-500/10 rounded">Override</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full border-2 ${isConstant ? 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' : isManual ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' : monthData.vigRate === 1.3 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-rose-500/30 text-rose-400 bg-rose-500/10'} font-black text-lg`}>
                              {monthData.vigRate.toFixed(1)}
                            </div>
                            {monthData.lastSyncedVigRate !== undefined && monthData.lastSyncedVigRate !== monthData.vigRate && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold animate-pulse">
                                🟡 Rate Changed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleSyncToZoho(h.monthKey)}
                            disabled={syncing[h.monthKey]}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white text-xs font-bold rounded shadow-lg shadow-blue-900/20 transition flex items-center justify-center gap-2 ml-auto"
                          >
                            {syncing[h.monthKey] ? (
                              <>
                                <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Syncing...
                              </>
                            ) : (
                              monthData.lastSyncedVigRate !== undefined && monthData.lastSyncedVigRate !== monthData.vigRate ? "Push New Rate to Books" : "Push VIG to Zoho"
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {historicalRates.length === 0 && (
                <div className="p-12 text-center text-neutral-500">No historical data found.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

