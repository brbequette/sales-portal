"use client"
import { useState, useEffect } from "react"
import { FiDollarSign, FiSave, FiCheck, FiRefreshCw, FiZap, FiEye, FiEyeOff, FiTrendingUp, FiLayers, FiChevronDown, FiChevronUp } from "react-icons/fi"

interface RepConfig {
  id: string
  name: string
  email: string
  role: string
  isVisible: boolean
  constantVigEnabled: boolean
  constantVigValue: number | string
  dailyProfitGoal: number | string
  dailySubtotalGoal: number | string
}

export default function VigManagementBuilder() {
  const [defaultVigRate, setDefaultVigRate] = useState<number | string>(1.3)
  const [repConfigs, setRepConfigs] = useState<RepConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Historical VIG state
  const [historicalRates, setHistoricalRates] = useState<any[]>([])
  const [historicalLoading, setHistoricalLoading] = useState(true)
  const [expandedReps, setExpandedReps] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchVigData()
    fetchHistoricalRates()
  }, [])

  const fetchVigData = async () => {
    try {
      setLoading(true)
      setErrorMsg(null)
      const res = await fetch('/api/admin/users/vig')
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const data = await res.json()
      if (data.success) {
        setDefaultVigRate(data.defaultVigRate)
        setRepConfigs(data.repConfigs || [])
      } else {
        throw new Error(data.error || 'Failed to load VIG configuration.')
      }
    } catch (e: any) {
      console.error('Failed to fetch VIG data:', e)
      setErrorMsg(e.message || 'Error loading VIG configuration.')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistoricalRates = async () => {
    try {
      setHistoricalLoading(true)
      const res = await fetch('/api/get-rep-stats?showHidden=true')
      const data = await res.json()
      if (data.success) {
        setHistoricalRates(data.historicalVigRates || [])
      }
    } catch (e) {
      console.error('Failed to fetch historical vig rates:', e)
    } finally {
      setHistoricalLoading(false)
    }
  }

  const handleRepChange = (id: string, field: keyof RepConfig, value: any) => {
    setRepConfigs(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const applyPresetProfitGoal = (amount: number) => {
    setRepConfigs(prev => prev.map(r => ({ ...r, dailyProfitGoal: amount })))
  }

  const applyPresetSubtotalGoal = (amount: number) => {
    setRepConfigs(prev => prev.map(r => ({ ...r, dailySubtotalGoal: amount })))
  }

  const [recalculatingId, setRecalculatingId] = useState<string | null>(null)
  const [recalculatingAll, setRecalculatingAll] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null)

  const handleRecalculateDocuments = async (repId?: string) => {
    try {
      if (repId) setRecalculatingId(repId)
      else setRecalculatingAll(true)
      setRecalcMessage(null)
      const res = await fetch('/api/admin/recalculate-vig-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId, monthKey: selectedMonth || undefined, applyToAll: !repId })
      })
      const data = await res.json()
      if (data.success) {
        setRecalcMessage(data.message || `Successfully recalculated ${data.updatedCount} document(s)!`)
        setTimeout(() => setRecalcMessage(null), 5000)
      } else {
        alert('Error recalculating documents: ' + data.error)
      }
    } catch (e: any) {
      alert('Error recalculating documents with new VIG rates.')
    } finally {
      setRecalculatingId(null)
      setRecalculatingAll(false)
    }
  }

  const [syncingZoho, setSyncingZoho] = useState(false)
  const [syncZohoMessage, setSyncZohoMessage] = useState<string | null>(null)

  const handleSyncAllVigToZoho = async () => {
    try {
      setSyncingZoho(true)
      setSyncZohoMessage("Pushing VIG rates to Zoho Books...")
      const res = await fetch('/api/sync-vig-to-zoho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId: "all", monthKey: selectedMonth || "2026-08", newVigRate: 1.3 })
      })
      const data = await res.json()
      if (data.success || res.ok) {
        setSyncZohoMessage("✅ Synced VIG Rates to Zoho Books successfully!")
        setTimeout(() => setSyncZohoMessage(null), 5000)
      } else {
        alert("Error syncing to Zoho Books: " + (data.error || data.message))
      }
    } catch (e: any) {
      alert("Error pushing to Zoho Books: " + e.message)
    } finally {
      setSyncingZoho(false)
    }
  }

  const handleSaveAll = async () => {
    try {
      setSaving(true)
      setSaveSuccess(false)
      const res = await fetch('/api/admin/users/vig', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultVigRate: parseFloat(String(defaultVigRate)) || 1.3, repConfigs })
      })
      const data = await res.json()
      if (data.success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        alert('Error saving VIG configuration: ' + data.error)
      }
    } catch (e) {
      alert('Error saving VIG configuration.')
    } finally {
      setSaving(false)
    }
  }

  // Active-only filter — "active" means isVisible=true on the board
  const activeConfigs = showAll ? repConfigs : repConfigs.filter(r => r.isVisible)
  const activeRepIds = new Set(activeConfigs.map(r => r.id))

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-neutral-400 font-bold gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading VIG &amp; Target Management...</span>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="p-8 bg-red-950/30 border border-red-500/30 rounded-2xl text-center space-y-4">
        <div className="text-red-400 font-black text-lg">Failed to Load VIG Management</div>
        <p className="text-xs text-neutral-400 max-w-md mx-auto">{errorMsg}</p>
        <button onClick={fetchVigData} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg">
          🔄 Retry Loading
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* Top Banner & Save Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-neutral-900 via-neutral-900 to-emerald-950/30 p-6 rounded-2xl border border-white/10 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-black text-xs tracking-widest uppercase mb-1">
            <FiLayers /> VIG Multipliers &amp; Goals Engine
          </div>
          <h2 className="text-2xl font-black text-white">Sales Rep VIG &amp; Dead Profit Management</h2>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
            All profit goals are strictly calculated using <span className="text-white font-bold">Dead Profit</span> (Subtotal − Base Inventory Cost − CC Fees − Additional Costs).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5">
            <span className="text-[11px] font-bold text-neutral-400 uppercase">Month Filter:</span>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white text-xs font-mono font-bold focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-neutral-900 text-white">All Months (Everything)</option>
              <option value="2025-01" className="bg-neutral-900 text-white">Jan 2025</option>
              <option value="2025-02" className="bg-neutral-900 text-white">Feb 2025</option>
              <option value="2025-03" className="bg-neutral-900 text-white">Mar 2025</option>
              <option value="2025-04" className="bg-neutral-900 text-white">Apr 2025</option>
              <option value="2025-05" className="bg-neutral-900 text-white">May 2025</option>
              <option value="2025-06" className="bg-neutral-900 text-white">Jun 2025</option>
              <option value="2025-07" className="bg-neutral-900 text-white">Jul 2025</option>
            </select>
          </div>

          <button
            onClick={() => handleRecalculateDocuments()}
            disabled={recalculatingAll}
            className="px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            {recalculatingAll ? <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> : <FiRefreshCw size={14} />}
            ⚡ Cascading Recalculate VIG
          </button>

          <button
            onClick={handleSyncAllVigToZoho}
            disabled={syncingZoho}
            className="px-4 py-3 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            {syncingZoho ? <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" /> : <FiZap size={14} />}
            🚀 Push Rates to Zoho Books
          </button>

          <button
            onClick={handleSaveAll}
            disabled={saving}
            className={`px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 shadow-xl cursor-pointer ${
              saveSuccess ? 'bg-emerald-500 text-black shadow-emerald-500/20' : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02] active:scale-95'
            }`}
          >
            {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saveSuccess ? <><FiCheck size={18} /> Saved Successfully!</> : <><FiSave size={18} /> Save All VIG Targets</>}
          </button>
        </div>
      </div>

      {recalcMessage && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in duration-200">
          <FiCheck size={16} /> {recalcMessage}
        </div>
      )}
      {syncZohoMessage && (
        <div className="p-4 bg-indigo-950/40 border border-indigo-500/40 rounded-xl text-indigo-300 text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in duration-200">
          <FiZap size={16} /> {syncZohoMessage}
        </div>
      )}

      {/* Global Controls & Presets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-neutral-400 block">Global Default VIG Rate</label>
          <div className="flex items-center gap-3">
            <input
              type="number" step="0.05" value={defaultVigRate}
              onChange={e => setDefaultVigRate(e.target.value)}
              className="w-32 bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-white font-mono text-lg font-bold focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-neutral-400 font-medium">Standard $1.30\times$ markup fallback</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <FiZap /> Quick Profit Goal Presets (Dead Profit)
          </label>
          <div className="flex items-center gap-2">
            {[1000, 1500, 2000].map(a => (
              <button key={a} onClick={() => applyPresetProfitGoal(a)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors">
                ${a.toLocaleString()} / day
              </button>
            ))}
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <FiTrendingUp /> Quick Subtotal Presets
          </label>
          <div className="flex items-center gap-2">
            {[2000, 3000, 4000].map(a => (
              <button key={a} onClick={() => applyPresetSubtotalGoal(a)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors">
                ${a.toLocaleString()} / day
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rep Management Matrix Table */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-neutral-300">
            Sales Rep Configurations ({activeConfigs.length}{showAll ? '' : ' Active'} Reps)
          </span>
          <div className="flex items-center gap-3">
            {/* Show All toggle */}
            <button
              onClick={() => setShowAll(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                showAll
                  ? 'bg-neutral-700 text-white border-neutral-500'
                  : 'bg-black/40 text-neutral-400 border-white/10 hover:text-white'
              }`}
              title={showAll ? 'Showing all reps — click to show active only' : 'Showing active reps only — click to show all'}
            >
              {showAll ? <FiEye size={12} /> : <FiEyeOff size={12} />}
              {showAll ? 'Show Active Only' : 'Show All Reps'}
            </button>
            <button onClick={fetchVigData} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors">
              <FiRefreshCw size={12} /> Reload
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-white/5 text-neutral-400 uppercase font-black tracking-wider text-[11px] border-b border-white/10">
              <tr>
                <th className="py-3.5 px-6">Sales Rep</th>
                <th className="py-3.5 px-4 text-center">Board Visibility</th>
                <th className="py-3.5 px-4">VIG Mode &amp; Rate</th>
                <th className="py-3.5 px-4">Daily Dead Profit Goal</th>
                <th className="py-3.5 px-4">Daily Subtotal Goal</th>
                <th className="py-3.5 px-4 text-center">Recalculate VIG</th>
                <th className="py-3.5 px-6 text-right">Est. Monthly Goal (22 Workdays)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-neutral-200">
              {activeConfigs.map(rep => {
                const dailyProfit = parseFloat(String(rep.dailyProfitGoal)) || 0
                const dailySub = parseFloat(String(rep.dailySubtotalGoal)) || 0
                return (
                  <tr key={rep.id} className={`hover:bg-white/[0.02] transition-colors ${!rep.isVisible ? 'opacity-60' : ''}`}>
                    <td className="py-4 px-6 font-bold">
                      <div className="text-white text-sm font-extrabold">{rep.name}</div>
                      <div className="text-[11px] text-neutral-400 font-mono">{rep.email}</div>
                      {!rep.isVisible && <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Hidden from Board</span>}
                    </td>

                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleRepChange(rep.id, 'isVisible', !rep.isVisible)}
                        className={`p-2 rounded-xl transition-all ${rep.isVisible ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-500 border border-transparent'}`}
                        title={rep.isVisible ? "Visible on Dashboard & TV" : "Hidden from Dashboard"}
                      >
                        {rep.isVisible ? <FiEye size={16} /> : <FiEyeOff size={16} />}
                      </button>
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox" checked={rep.constantVigEnabled}
                            onChange={e => handleRepChange(rep.id, 'constantVigEnabled', e.target.checked)}
                            className="rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className="text-[11px] font-semibold text-neutral-300">Override Default VIG</span>
                        </div>
                        {rep.constantVigEnabled ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number" step="0.05" value={rep.constantVigValue}
                              onChange={e => handleRepChange(rep.id, 'constantVigValue', e.target.value)}
                              className="w-24 bg-emerald-950/30 border border-emerald-500/40 rounded-lg px-3 py-1.5 text-emerald-300 font-mono text-xs font-bold focus:outline-none focus:border-emerald-400"
                            />
                            <span className="text-[10px] text-emerald-400 font-bold">Override Rate</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400 font-mono">Default ({defaultVigRate}x)</span>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-3 top-2.5 text-neutral-400 font-mono text-xs">$</span>
                        <input
                          type="number" step="100" value={rep.dailyProfitGoal}
                          onChange={e => handleRepChange(rep.id, 'dailyProfitGoal', e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-2 text-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-3 top-2.5 text-neutral-400 font-mono text-xs">$</span>
                        <input
                          type="number" step="100" value={rep.dailySubtotalGoal}
                          onChange={e => handleRepChange(rep.id, 'dailySubtotalGoal', e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-2 text-cyan-300 font-mono font-bold text-xs focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleRecalculateDocuments(rep.id)}
                        disabled={recalculatingId === rep.id}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 mx-auto active:scale-95 shadow"
                      >
                        {recalculatingId === rep.id ? <div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> : <FiRefreshCw size={12} />}
                        <span>Re-run</span>
                      </button>
                    </td>

                    <td className="py-4 px-6 text-right font-mono">
                      <div className="text-amber-400 font-black text-xs">
                        ${(dailyProfit * 22).toLocaleString()} <span className="text-[10px] font-normal text-neutral-400">Profit</span>
                      </div>
                      <div className="text-cyan-400 font-bold text-[11px] mt-0.5">
                        ${(dailySub * 22).toLocaleString()} <span className="text-[10px] font-normal text-neutral-400">Subtotal</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Historical VIG Rate Cards ────────────────────────────────────────── */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2">
              👤 Sales Rep Historical VIG Rate Cards
            </div>
            <p className="text-[11px] text-neutral-500 mt-0.5">Click an employee card to expand and view/edit all historical monthly VIG rates &amp; goals.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAll(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                showAll ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-black/40 text-neutral-400 border-white/10 hover:text-white'
              }`}
            >
              {showAll ? <FiEye size={12} /> : <FiEyeOff size={12} />}
              {showAll ? 'Active Only' : 'Show All'}
            </button>
            <button onClick={fetchHistoricalRates} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors">
              <FiRefreshCw size={12} /> Reload
            </button>
          </div>
        </div>

        {historicalLoading ? (
          <div className="flex items-center justify-center p-10 text-neutral-500 text-xs font-bold gap-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            Loading historical rates...
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {activeConfigs.map(rep => {
              const isExpanded = !!expandedReps[rep.id]
              // Determine the current effective vig rate for the most recent month
              const latestMonth = historicalRates[0]
              const latestData = latestMonth?.reps?.[rep.id]
              const currentVigRate = latestData?.vigRate ?? 1.3

              return (
                <div key={rep.id}>
                  {/* Rep header row — click to expand */}
                  <div className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-black text-sm">
                        {rep.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-extrabold text-white text-sm">{rep.name}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">{rep.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Current VIG</div>
                        <div className={`text-base font-black ${currentVigRate === 1.0 ? 'text-indigo-400' : currentVigRate === 1.3 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {currentVigRate.toFixed(1)}x
                        </div>
                      </div>
                      <button
                        onClick={() => setExpandedReps(prev => ({ ...prev, [rep.id]: !prev[rep.id] }))}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs border border-emerald-500/40 transition-all"
                      >
                        <span>{isExpanded ? 'Hide Historical Rates' : '📅 View Historical Rates'}</span>
                        {isExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded historical table */}
                  {isExpanded && (
                    <div className="px-6 pb-6 bg-black/30 space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-bold text-neutral-400 uppercase tracking-wider py-2 border-b border-white/10">
                        <span>Historical Monthly Rate Records</span>
                        <span>72-Month Timeline</span>
                      </div>

                      {historicalRates.length === 0 ? (
                        <div className="text-center py-6 text-neutral-500 text-xs">No historical records found.</div>
                      ) : (
                        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                          {historicalRates.map(h => {
                            const md = h.reps?.[rep.id] || { vigRate: 1.3, manualVigRate: null, lastSyncedVigRate: null, profitGoal: 20000, subtotalGoal: 40000, metric: 'PROFIT', subtotal: 0, profit: 0, deadProfit: 0, metGoal: false }
                            const isManual = md.manualVigRate !== null
                            const metGoalClass = md.metGoal ? 'text-emerald-400' : 'text-amber-400'

                            return (
                              <div key={h.monthKey} className="glass-panel border border-white/10 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 hover:border-emerald-500/20 transition-all text-xs">
                                {/* Month + VIG */}
                                <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                                  <div>
                                    <div className="font-bold text-white text-sm">{h.monthName}</div>
                                    <div className="text-neutral-500 text-[10px] font-mono">{h.monthKey}</div>
                                  </div>
                                  <div className={`ml-auto sm:ml-2 px-2 py-1 rounded-lg border text-[11px] font-black ${
                                    isManual ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : md.vigRate === 1.3 ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-rose-500/40 text-rose-300 bg-rose-500/10'
                                  }`}>
                                    {md.vigRate.toFixed(1)}x{isManual ? ' 🔧' : ''}
                                  </div>
                                </div>

                                {/* Subtotal */}
                                <div className="space-y-0.5">
                                  <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider">Subtotal Actual</div>
                                  <div className="font-mono font-bold text-sky-300">${(md.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                  <div className="text-[9px] text-neutral-600">Goal: ${(md.subtotalGoal || 40000).toLocaleString()}</div>
                                </div>

                                {/* Dead Profit */}
                                <div className="space-y-0.5">
                                  <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider">Dead Profit</div>
                                  <div className={`font-mono font-bold ${metGoalClass}`}>${(md.deadProfit || md.profit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                  <div className="text-[9px] text-neutral-600">Goal: ${(md.profitGoal || 20000).toLocaleString()}</div>
                                </div>

                                {/* Manual override */}
                                <div className="space-y-0.5">
                                  <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider">Manual Override</div>
                                  <div className="flex items-center gap-1">
                                    {isManual ? (
                                      <span className="text-amber-300 font-mono font-bold">{md.manualVigRate.toFixed(2)}x</span>
                                    ) : (
                                      <span className="text-neutral-500 italic">Auto</span>
                                    )}
                                  </div>
                                  {md.lastSyncedVigRate && (
                                    <div className="text-[9px] text-neutral-600">Synced: {md.lastSyncedVigRate.toFixed(2)}x</div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
