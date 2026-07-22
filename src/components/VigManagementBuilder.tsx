"use client"
import { useState, useEffect } from "react"
import { FiDollarSign, FiSave, FiCheck, FiRefreshCw, FiZap, FiEye, FiEyeOff, FiTrendingUp, FiLayers } from "react-icons/fi"

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

  useEffect(() => {
    fetchVigData()
  }, [])

  const fetchVigData = async () => {
    try {
      setLoading(true)
      setErrorMsg(null)
      const res = await fetch('/api/admin/users/vig')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
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

  const handleRepChange = (id: string, field: keyof RepConfig, value: any) => {
    setRepConfigs(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const applyPresetProfitGoal = (amount: number) => {
    setRepConfigs(prev => prev.map(r => ({ ...r, dailyProfitGoal: amount })))
  }

  const applyPresetSubtotalGoal = (amount: number) => {
    setRepConfigs(prev => prev.map(r => ({ ...r, dailySubtotalGoal: amount })))
  }

  const applyPresetVigRate = (rate: number) => {
    setRepConfigs(prev => prev.map(r => ({ ...r, constantVigValue: rate })))
  }

  const handleSaveAll = async () => {
    try {
      setSaving(true)
      setSaveSuccess(false)
      const res = await fetch('/api/admin/users/vig', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultVigRate: parseFloat(String(defaultVigRate)) || 1.3,
          repConfigs
        })
      })
      const data = await res.json()
      if (data.success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        alert('Error saving VIG configuration: ' + data.error)
      }
    } catch (e) {
      console.error('Failed to save VIG config:', e)
      alert('Error saving VIG configuration.')
    } finally {
      setSaving(false)
    }
  }

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
        <button
          onClick={fetchVigData}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg"
        >
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
            <FiLayers /> VIG Multipliers & Goals Engine
          </div>
          <h2 className="text-2xl font-black text-white">Sales Rep VIG & Dead Profit Management</h2>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
            All profit goals are strictly calculated using <span className="text-white font-bold">Dead Profit</span> (Subtotal − Base Inventory Cost − CC Fees).
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={saving}
          className={`px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 shadow-xl ${
            saveSuccess 
              ? 'bg-emerald-500 text-black shadow-emerald-500/20' 
              : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02] active:scale-95'
          }`}
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : saveSuccess ? (
            <>
              <FiCheck size={18} /> Saved Successfully!
            </>
          ) : (
            <>
              <FiSave size={18} /> Save All VIG Targets
            </>
          )}
        </button>
      </div>

      {/* Global Controls & Presets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Default VIG Rate */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-neutral-400 block">
            Global Default VIG Rate
          </label>
          <div className="flex items-center gap-3">
            <input 
              type="number"
              step="0.05"
              value={defaultVigRate}
              onChange={e => setDefaultVigRate(e.target.value)}
              className="w-32 bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-white font-mono text-lg font-bold focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-neutral-400 font-medium">Standard $1.30\times$ markup fallback</span>
          </div>
        </div>

        {/* Quick Profit Presets */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <FiZap /> Quick Profit Goal Presets (Dead Profit)
          </label>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => applyPresetProfitGoal(1000)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors"
            >
              $1,000 / day
            </button>
            <button 
              onClick={() => applyPresetProfitGoal(1500)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors"
            >
              $1,500 / day
            </button>
            <button 
              onClick={() => applyPresetProfitGoal(2000)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors"
            >
              $2,000 / day
            </button>
          </div>
        </div>

        {/* Quick Subtotal Presets */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <FiTrendingUp /> Quick Subtotal Presets
          </label>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => applyPresetSubtotalGoal(2000)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors"
            >
              $2,000 / day
            </button>
            <button 
              onClick={() => applyPresetSubtotalGoal(3000)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors"
            >
              $3,000 / day
            </button>
            <button 
              onClick={() => applyPresetSubtotalGoal(4000)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors"
            >
              $4,000 / day
            </button>
          </div>
        </div>

      </div>

      {/* Rep Management Matrix Table */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-neutral-300">
            Sales Rep Configurations ({repConfigs.length} Active Reps)
          </span>
          <button 
            onClick={fetchVigData}
            className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <FiRefreshCw size={12} /> Reload
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-white/5 text-neutral-400 uppercase font-black tracking-wider text-[11px] border-b border-white/10">
              <tr>
                <th className="py-3.5 px-6">Sales Rep</th>
                <th className="py-3.5 px-4 text-center">Board Visibility</th>
                <th className="py-3.5 px-4">VIG Mode & Rate</th>
                <th className="py-3.5 px-4">Daily Dead Profit Goal</th>
                <th className="py-3.5 px-4">Daily Subtotal Goal</th>
                <th className="py-3.5 px-6 text-right">Est. Monthly Goal (22 Workdays)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-neutral-200">
              {repConfigs.map(rep => {
                const dailyProfit = parseFloat(String(rep.dailyProfitGoal)) || 0
                const dailySub = parseFloat(String(rep.dailySubtotalGoal)) || 0
                const monthlyProfit = dailyProfit * 22
                const monthlySub = dailySub * 22

                return (
                  <tr key={rep.id} className="hover:bg-white/[0.02] transition-colors">
                    
                    {/* Rep Info */}
                    <td className="py-4 px-6 font-bold">
                      <div className="text-white text-sm font-extrabold">{rep.name}</div>
                      <div className="text-[11px] text-neutral-400 font-mono">{rep.email}</div>
                    </td>

                    {/* Visibility Toggle */}
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleRepChange(rep.id, 'isVisible', !rep.isVisible)}
                        className={`p-2 rounded-xl transition-all ${
                          rep.isVisible 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-neutral-800 text-neutral-500 border border-transparent'
                        }`}
                        title={rep.isVisible ? "Visible on Dashboard & TV" : "Hidden from Dashboard"}
                      >
                        {rep.isVisible ? <FiEye size={16} /> : <FiEyeOff size={16} />}
                      </button>
                    </td>

                    {/* VIG Rate Override */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            checked={rep.constantVigEnabled}
                            onChange={e => handleRepChange(rep.id, 'constantVigEnabled', e.target.checked)}
                            className="rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className="text-[11px] font-semibold text-neutral-300">Override Default VIG</span>
                        </div>

                        {rep.constantVigEnabled ? (
                          <div className="flex items-center gap-2">
                            <input 
                              type="number"
                              step="0.05"
                              value={rep.constantVigValue}
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

                    {/* Daily Dead Profit Goal */}
                    <td className="py-4 px-4">
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-3 top-2.5 text-neutral-400 font-mono text-xs">$</span>
                        <input 
                          type="number"
                          step="100"
                          value={rep.dailyProfitGoal}
                          onChange={e => handleRepChange(rep.id, 'dailyProfitGoal', e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-2 text-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </td>

                    {/* Daily Subtotal Goal */}
                    <td className="py-4 px-4">
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-3 top-2.5 text-neutral-400 font-mono text-xs">$</span>
                        <input 
                          type="number"
                          step="100"
                          value={rep.dailySubtotalGoal}
                          onChange={e => handleRepChange(rep.id, 'dailySubtotalGoal', e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-2 text-cyan-300 font-mono font-bold text-xs focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </td>

                    {/* Monthly Preview */}
                    <td className="py-4 px-6 text-right font-mono">
                      <div className="text-amber-400 font-black text-xs">
                        ${monthlyProfit.toLocaleString()} <span className="text-[10px] font-normal text-neutral-400">Profit</span>
                      </div>
                      <div className="text-cyan-400 font-bold text-[11px] mt-0.5">
                        ${monthlySub.toLocaleString()} <span className="text-[10px] font-normal text-neutral-400">Subtotal</span>
                      </div>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  )
}
