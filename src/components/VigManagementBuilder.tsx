"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import {
  FiSave, FiCheck, FiRefreshCw, FiZap, FiEye, FiEyeOff,
  FiTrendingUp, FiLayers, FiChevronDown, FiChevronUp,
  FiAlertTriangle, FiTool, FiCalendar, FiEdit2, FiX, FiPlus
} from "react-icons/fi"

interface RepConfig {
  id: string; name: string; email: string; role: string
  isVisible: boolean; constantVigEnabled: boolean
  constantVigValue: number | string
  dailyProfitGoal: number | string; dailySubtotalGoal: number | string
}

interface MismatchInvoice {
  id: string; zohoId: string; number: string; date: string
  amount: number; actualVig: number; expectedVig: number; customer: string
}

interface MonthRepData {
  vigRate: number; manualVigRate: number | null; lastSyncedVigRate: number | null
  vigReason: string; metric: string
  profitGoal: number; subtotalGoal: number
  workingDays: number; computedWorkingDays: number; storedWorkingDays: number | null; dailyGoal: number
  subtotal: number; deadCost: number; deadProfit: number; invoiceCount: number
  metGoal: boolean; mismatches: MismatchInvoice[]
}

interface HistoricalMonth { monthKey: string; monthName: string; reps: Record<string, MonthRepData> }

// ─── Inline editable cell ──────────────────────────────────────────────────
function EditableNumber({ value, onSave, prefix = "$", suffix = "", step = 100, min = 0, className = "" }: {
  value: number; onSave: (v: number) => void
  prefix?: string; suffix?: string; step?: number; min?: number; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]   = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const n = parseFloat(draft)
    if (!isNaN(n) && n !== value) onSave(n)
    setEditing(false)
  }

  useEffect(() => { if (editing) { setDraft(String(value)); setTimeout(() => inputRef.current?.select(), 0) } }, [editing, value])

  if (editing) return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-neutral-500 text-xs">{prefix}</span>}
      <input ref={inputRef} type="number" step={step} min={min} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-24 bg-black/60 border border-emerald-500/60 rounded px-2 py-0.5 text-white font-mono text-xs font-bold focus:outline-none" />
      {suffix && <span className="text-neutral-500 text-xs">{suffix}</span>}
    </div>
  )

  return (
    <button onClick={() => setEditing(true)} className={`flex items-center gap-1 group cursor-pointer hover:text-white transition-colors ${className}`} title="Click to edit">
      {prefix && <span className="text-neutral-500 text-xs">{prefix}</span>}
      <span className="font-mono font-bold text-xs">{typeof value === 'number' && value !== Math.floor(value) ? value.toFixed(2) : value.toLocaleString()}</span>
      {suffix && <span className="text-neutral-400 text-xs">{suffix}</span>}
      <FiEdit2 size={9} className="opacity-0 group-hover:opacity-60 transition-opacity ml-0.5" />
    </button>
  )
}

export default function VigManagementBuilder() {
  const [defaultVigRate, setDefaultVigRate] = useState<number | string>(1.3)
  const [repConfigs, setRepConfigs]         = useState<RepConfig[]>([])
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [saveSuccess, setSaveSuccess]       = useState(false)
  const [errorMsg, setErrorMsg]             = useState<string | null>(null)
  const [showAll, setShowAll]               = useState(false)

  const [historicalMonths, setHistoricalMonths]   = useState<HistoricalMonth[]>([])
  const [holidays, setHolidays]                   = useState<string[]>([])
  const [historicalLoading, setHistoricalLoading] = useState(true)
  const [expandedReps, setExpandedReps]           = useState<Record<string, boolean>>({})
  const [monthsToLoad, setMonthsToLoad]           = useState(24)
  const [showHolidayManager, setShowHolidayManager] = useState(false)
  const [newHolidayDate, setNewHolidayDate]         = useState("")
  const [savingHolidays, setSavingHolidays]         = useState(false)

  const [fixingAll, setFixingAll] = useState<Record<string, boolean>>({})
  const [fixingOne, setFixingOne] = useState<Record<string, boolean>>({})
  const [fixMessage, setFixMessage] = useState<string | null>(null)

  const [recalculatingId, setRecalculatingId]   = useState<string | null>(null)
  const [recalculatingAll, setRecalculatingAll] = useState(false)
  const [selectedMonth, setSelectedMonth]       = useState<string>("")
  const [recalcMessage, setRecalcMessage]       = useState<string | null>(null)
  const [syncingZoho, setSyncingZoho]           = useState(false)
  const [syncZohoMessage, setSyncZohoMessage]   = useState<string | null>(null)

  useEffect(() => { fetchVigData() }, [])
  useEffect(() => { fetchHistoricalRates(monthsToLoad) }, [monthsToLoad])

  const fetchVigData = async () => {
    try {
      setLoading(true); setErrorMsg(null)
      const res  = await fetch('/api/admin/users/vig')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.success) { setDefaultVigRate(data.defaultVigRate); setRepConfigs(data.repConfigs || []) }
      else throw new Error(data.error)
    } catch (e: any) { setErrorMsg(e.message) }
    finally { setLoading(false) }
  }

  const fetchHistoricalRates = useCallback(async (months: number) => {
    try {
      setHistoricalLoading(true)
      const res  = await fetch(`/api/admin/vig-history?months=${months}&mismatches=true`)
      const data = await res.json()
      if (data.success) {
        setHistoricalMonths(data.months || [])
        setHolidays(data.holidays || [])
      }
    } catch (e) { console.error('vig-history fetch failed:', e) }
    finally { setHistoricalLoading(false) }
  }, [])

  // ── Save a single month-goal field for one rep ───────────────────────────
  const saveMonthGoal = async (repId: string, monthKey: string, patch: Record<string, any>) => {
    try {
      const res = await fetch('/api/admin/save-vig-month-goal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId, monthKey, ...patch })
      })
      const data = await res.json()
      if (!data.success) { console.error('save-vig-month-goal failed:', data.error); return }
      // Optimistic UI: re-fetch to get computed values
      fetchHistoricalRates(monthsToLoad)
    } catch (e) { console.error('save-vig-month-goal error:', e) }
  }

  // ── Holiday management ───────────────────────────────────────────────────
  const saveHolidays = async (updated: string[]) => {
    setSavingHolidays(true)
    try {
      const res = await fetch('/api/admin/holidays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidays: updated })
      })
      const data = await res.json()
      if (data.success) { setHolidays(data.holidays); fetchHistoricalRates(monthsToLoad) }
    } catch (e) { console.error('holiday save failed:', e) }
    finally { setSavingHolidays(false) }
  }

  const addHoliday = () => {
    if (!newHolidayDate || holidays.includes(newHolidayDate)) return
    const updated = [...holidays, newHolidayDate].sort()
    saveHolidays(updated)
    setNewHolidayDate("")
  }

  const removeHoliday = (d: string) => saveHolidays(holidays.filter(h => h !== d))

  // ── Fix invoices ──────────────────────────────────────────────────────────
  const fixOneInvoice = async (inv: MismatchInvoice, repId: string, monthKey: string) => {
    setFixingOne(p => ({ ...p, [inv.id]: true }))
    try {
      const res = await fetch('/api/admin/fix-vig-rate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: [inv.id], repId, monthKey, newVigRate: inv.expectedVig })
      })
      const data = await res.json()
      if (data.success) { setFixMessage(`✅ Fixed invoice ${inv.number}`); setTimeout(() => setFixMessage(null), 4000); fetchHistoricalRates(monthsToLoad) }
      else alert('Fix failed: ' + data.error)
    } catch (e: any) { alert('Error: ' + e.message) }
    finally { setFixingOne(p => ({ ...p, [inv.id]: false })) }
  }

  const fixAllForMonth = async (repId: string, monthKey: string, vigRate: number, mismatches: MismatchInvoice[]) => {
    const key = `${repId}_${monthKey}`
    setFixingAll(p => ({ ...p, [key]: true }))
    try {
      const res = await fetch('/api/admin/fix-vig-rate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixAll: true, invoiceIds: mismatches.map(m => m.id), repId, monthKey, newVigRate: vigRate })
      })
      const data = await res.json()
      if (data.success) { setFixMessage(`✅ Fixed ${data.updatedCount} invoices`); setTimeout(() => setFixMessage(null), 5000); fetchHistoricalRates(monthsToLoad) }
      else alert('Fix failed: ' + data.error)
    } catch (e: any) { alert('Error: ' + e.message) }
    finally { setFixingAll(p => ({ ...p, [key]: false })) }
  }

  const handleRepChange = (id: string, field: keyof RepConfig, value: any) =>
    setRepConfigs(p => p.map(r => r.id === id ? { ...r, [field]: value } : r))

  const handleRecalculateDocuments = async (repId?: string) => {
    try {
      if (repId) setRecalculatingId(repId); else setRecalculatingAll(true)
      const res = await fetch('/api/admin/recalculate-vig-documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId, monthKey: selectedMonth || undefined, applyToAll: !repId })
      })
      const data = await res.json()
      if (data.success) { setRecalcMessage(data.message || `Done!`); setTimeout(() => setRecalcMessage(null), 5000) }
      else alert('Error: ' + data.error)
    } catch (e: any) { alert('Error: ' + e.message) }
    finally { setRecalculatingId(null); setRecalculatingAll(false) }
  }

  const handleSyncAllVigToZoho = async () => {
    try {
      setSyncingZoho(true); setSyncZohoMessage("Pushing to Zoho Books...")
      const res = await fetch('/api/sync-vig-to-zoho', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId: "all", monthKey: selectedMonth || "2026-08", newVigRate: 1.3 })
      })
      const data = await res.json()
      if (data.success || res.ok) { setSyncZohoMessage("✅ Synced!"); setTimeout(() => setSyncZohoMessage(null), 5000) }
      else alert("Error: " + (data.error || data.message))
    } catch (e: any) { alert("Error: " + e.message) }
    finally { setSyncingZoho(false) }
  }

  const handleSaveAll = async () => {
    try {
      setSaving(true); setSaveSuccess(false)
      const res = await fetch('/api/admin/users/vig', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultVigRate: parseFloat(String(defaultVigRate)) || 1.3, repConfigs })
      })
      const data = await res.json()
      if (data.success) { setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000) }
      else alert('Error: ' + data.error)
    } catch { alert('Save failed.') }
    finally { setSaving(false) }
  }

  const activeConfigs = showAll ? repConfigs : repConfigs.filter(r => r.isVisible)

  // Total mismatches across all visible reps
  const globalMismatchCount = historicalMonths.reduce((sum, h) =>
    sum + activeConfigs.reduce((s, r) => s + (h.reps?.[r.id]?.mismatches?.length || 0), 0), 0)

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-16 text-neutral-400 font-bold gap-3">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      Loading VIG &amp; Target Management...
    </div>
  )

  if (errorMsg) return (
    <div className="p-8 bg-red-950/30 border border-red-500/30 rounded-2xl text-center space-y-4">
      <div className="text-red-400 font-black text-lg">Failed to Load</div>
      <p className="text-xs text-neutral-400">{errorMsg}</p>
      <button onClick={fetchVigData} className="px-4 py-2 bg-neutral-800 text-white rounded-xl text-xs font-bold">🔄 Retry</button>
    </div>
  )

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* ── Top Banner ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-neutral-900 via-neutral-900 to-emerald-950/30 p-6 rounded-2xl border border-white/10 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-black text-xs tracking-widest uppercase mb-1"><FiLayers /> VIG Multipliers &amp; Goals Engine</div>
          <h2 className="text-2xl font-black text-white">Sales Rep VIG &amp; Dead Profit Management</h2>
          <p className="text-xs text-neutral-400 mt-1">All goals use <span className="text-white font-bold">Dead Profit</span> (Subtotal − Base Cost − CC Fees − Additional).</p>
          {globalMismatchCount > 0 && (
            <div className="flex items-center gap-2 mt-2 text-[11px] text-rose-300 font-bold">
              <FiAlertTriangle size={12} /> {globalMismatchCount} invoice{globalMismatchCount !== 1 ? 's' : ''} across all reps have incorrect VIG rates
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5">
            <span className="text-[11px] font-bold text-neutral-400 uppercase">Month:</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-transparent text-white text-xs font-mono font-bold focus:outline-none cursor-pointer">
              <option value="" className="bg-neutral-900">All Months</option>
              {Array.from({ length: 12 }, (_, i) => {
                const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
                const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                return <option key={k} value={k} className="bg-neutral-900">{d.toLocaleDateString('en-US',{month:'short',year:'numeric'})}</option>
              })}
            </select>
          </div>
          <button onClick={() => handleRecalculateDocuments()} disabled={recalculatingAll}
            className="px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95">
            {recalculatingAll ? <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> : <FiRefreshCw size={14} />}
            ⚡ Cascading Recalc
          </button>
          <button onClick={handleSyncAllVigToZoho} disabled={syncingZoho}
            className="px-4 py-3 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95">
            {syncingZoho ? <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" /> : <FiZap size={14} />}
            🚀 Push to Zoho
          </button>
          <button onClick={handleSaveAll} disabled={saving}
            className={`px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all shadow-xl cursor-pointer ${saveSuccess ? 'bg-emerald-500 text-black' : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02] active:scale-95'}`}>
            {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saveSuccess ? <><FiCheck size={18} /> Saved!</> : <><FiSave size={18} /> Save All VIG</>}
          </button>
        </div>
      </div>

      {recalcMessage  && <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2"><FiCheck size={16} /> {recalcMessage}</div>}
      {syncZohoMessage && <div className="p-4 bg-indigo-950/40 border border-indigo-500/40 rounded-xl text-indigo-300 text-xs font-bold flex items-center gap-2"><FiZap size={16} /> {syncZohoMessage}</div>}
      {fixMessage     && <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2"><FiCheck size={16} /> {fixMessage}</div>}

      {/* ── Presets + Holiday Manager ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-neutral-400 block">Global Default VIG Rate</label>
          <div className="flex items-center gap-3">
            <input type="number" step="0.05" value={defaultVigRate} onChange={e => setDefaultVigRate(e.target.value)}
              className="w-32 bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-white font-mono text-lg font-bold focus:outline-none focus:border-emerald-500" />
            <span className="text-xs text-neutral-400">Standard 1.30× fallback</span>
          </div>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5"><FiZap /> Quick Profit Presets</label>
          <div className="flex gap-2">
            {[1000,1500,2000].map(a => (
              <button key={a} onClick={() => setRepConfigs(p => p.map(r => ({...r, dailyProfitGoal: a})))}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors">${a.toLocaleString()}/day</button>
            ))}
          </div>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5"><FiTrendingUp /> Quick Subtotal Presets</label>
          <div className="flex gap-2">
            {[2000,3000,4000].map(a => (
              <button key={a} onClick={() => setRepConfigs(p => p.map(r => ({...r, dailySubtotalGoal: a})))}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors">${a.toLocaleString()}/day</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Rep Config Table ─────────────────────────────────────────── */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-neutral-300">Sales Rep Configurations ({activeConfigs.length}{!showAll ? ' Active' : ''} Reps)</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAll(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showAll ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-black/40 text-neutral-400 border-white/10 hover:text-white'}`}>
              {showAll ? <FiEye size={12} /> : <FiEyeOff size={12} />} {showAll ? 'Active Only' : 'Show All'}
            </button>
            <button onClick={fetchVigData} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"><FiRefreshCw size={12} /> Reload</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-white/5 text-neutral-400 uppercase font-black tracking-wider text-[11px] border-b border-white/10">
              <tr>
                <th className="py-3.5 px-6">Sales Rep</th>
                <th className="py-3.5 px-4 text-center">Board</th>
                <th className="py-3.5 px-4">VIG Mode &amp; Rate</th>
                <th className="py-3.5 px-4">Daily Dead Profit Goal</th>
                <th className="py-3.5 px-4">Daily Subtotal Goal</th>
                <th className="py-3.5 px-4 text-center">Recalculate</th>
                <th className="py-3.5 px-6 text-right">Est. Monthly (22 days)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-neutral-200">
              {activeConfigs.map(rep => {
                const dp  = parseFloat(String(rep.dailyProfitGoal)) || 0
                const ds  = parseFloat(String(rep.dailySubtotalGoal)) || 0
                return (
                  <tr key={rep.id} className={`hover:bg-white/[0.02] transition-colors ${!rep.isVisible ? 'opacity-55' : ''}`}>
                    <td className="py-4 px-6">
                      <div className="text-white text-sm font-extrabold">{rep.name}</div>
                      <div className="text-[11px] text-neutral-400 font-mono">{rep.email}</div>
                      {!rep.isVisible && <span className="text-[9px] text-neutral-500 font-bold uppercase">Hidden</span>}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button onClick={() => handleRepChange(rep.id, 'isVisible', !rep.isVisible)}
                        className={`p-2 rounded-xl transition-all ${rep.isVisible ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-500 border border-transparent'}`}>
                        {rep.isVisible ? <FiEye size={16} /> : <FiEyeOff size={16} />}
                      </button>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={rep.constantVigEnabled} onChange={e => handleRepChange(rep.id, 'constantVigEnabled', e.target.checked)} className="rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500" />
                          <span className="text-[11px] font-semibold text-neutral-300">Override Default VIG</span>
                        </label>
                        {rep.constantVigEnabled ? (
                          <div className="flex items-center gap-2">
                            <input type="number" step="0.05" value={rep.constantVigValue} onChange={e => handleRepChange(rep.id, 'constantVigValue', e.target.value)}
                              className="w-24 bg-emerald-950/30 border border-emerald-500/40 rounded-lg px-3 py-1.5 text-emerald-300 font-mono text-xs font-bold focus:outline-none" />
                            <span className="text-[10px] text-emerald-400 font-bold">Override Rate</span>
                          </div>
                        ) : <span className="text-[11px] text-neutral-400 font-mono">Default ({defaultVigRate}x)</span>}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="relative max-w-[140px]"><span className="absolute left-3 top-2.5 text-neutral-400 font-mono text-xs">$</span>
                        <input type="number" step="100" value={rep.dailyProfitGoal} onChange={e => handleRepChange(rep.id, 'dailyProfitGoal', e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-2 text-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-amber-400" /></div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="relative max-w-[140px]"><span className="absolute left-3 top-2.5 text-neutral-400 font-mono text-xs">$</span>
                        <input type="number" step="100" value={rep.dailySubtotalGoal} onChange={e => handleRepChange(rep.id, 'dailySubtotalGoal', e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-2 text-cyan-300 font-mono font-bold text-xs focus:outline-none focus:border-cyan-400" /></div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button onClick={() => handleRecalculateDocuments(rep.id)} disabled={recalculatingId === rep.id}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 mx-auto active:scale-95">
                        {recalculatingId === rep.id ? <div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> : <FiRefreshCw size={12} />} Re-run
                      </button>
                    </td>
                    <td className="py-4 px-6 text-right font-mono">
                      <div className="text-amber-400 font-black text-xs">${(dp*22).toLocaleString()} <span className="text-[10px] text-neutral-400">Profit</span></div>
                      <div className="text-cyan-400 font-bold text-[11px] mt-0.5">${(ds*22).toLocaleString()} <span className="text-[10px] text-neutral-400">Subtotal</span></div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Historical VIG Rate Cards ──────────────────────────────── */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2">👤 Historical VIG Rate Cards</div>
            <p className="text-[11px] text-neutral-500 mt-0.5">Click a rep to expand all months. Goals are editable inline — click any value to change it.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={monthsToLoad} onChange={e => setMonthsToLoad(parseInt(e.target.value))}
              className="bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs font-bold focus:outline-none cursor-pointer">
              {[12,24,36,60,72].map(n => <option key={n} value={n} className="bg-neutral-900">{n} months</option>)}
            </select>
            <button onClick={() => setShowAll(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showAll ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-black/40 text-neutral-400 border-white/10 hover:text-white'}`}>
              {showAll ? <FiEye size={12} /> : <FiEyeOff size={12} />} {showAll ? 'Active Only' : 'Show All'}
            </button>
            <button onClick={() => setShowHolidayManager(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showHolidayManager ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-black/40 text-neutral-400 border-white/10 hover:text-amber-300'}`}>
              <FiCalendar size={12} /> Holidays ({holidays.length})
            </button>
            <button onClick={() => fetchHistoricalRates(monthsToLoad)} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"><FiRefreshCw size={12} /> Reload</button>
          </div>
        </div>

        {/* Holiday Manager Panel */}
        {showHolidayManager && (
          <div className="px-6 py-4 bg-amber-950/20 border-b border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-2"><FiCalendar size={12} /> Company Holidays</div>
                <p className="text-[10px] text-neutral-500 mt-0.5">These dates are excluded from working-day calculations for all months and reps.</p>
              </div>
              {savingHolidays && <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />}
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)}
                className="bg-black/60 border border-amber-500/30 rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-amber-400" />
              <button onClick={addHoliday} disabled={!newHolidayDate || savingHolidays}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                <FiPlus size={12} /> Add Holiday
              </button>
            </div>
            {holidays.length === 0 ? (
              <p className="text-[11px] text-neutral-600 italic">No holidays stored. Add dates above to exclude them from working-day counts.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {holidays.map(h => {
                  const d = new Date(h + 'T12:00:00')
                  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  return (
                    <div key={h} className="flex items-center gap-1.5 bg-black/40 border border-amber-500/20 rounded-lg px-2.5 py-1 text-[11px] font-mono text-amber-200">
                      {label}
                      <button onClick={() => removeHoliday(h)} className="text-neutral-500 hover:text-rose-400 transition-colors ml-1"><FiX size={10} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {historicalLoading ? (
          <div className="flex items-center justify-center p-12 text-neutral-500 text-xs font-bold gap-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            Loading {monthsToLoad} months of VIG history...
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {activeConfigs.map(rep => {
              const isExpanded = !!expandedReps[rep.id]
              const latestData = historicalMonths[0]?.reps?.[rep.id]
              const currentVig = latestData?.vigRate ?? 1.3
              const totalMismatches = historicalMonths.reduce((s, h) => s + (h.reps?.[rep.id]?.mismatches?.length || 0), 0)

              return (
                <div key={rep.id}>
                  {/* Rep header */}
                  <div className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-black text-sm select-none">
                        {rep.name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-extrabold text-white text-sm">{rep.name}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">{rep.email}</div>
                      </div>
                      {totalMismatches > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                          <FiAlertTriangle size={10} /> {totalMismatches} mismatch{totalMismatches !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-neutral-500">Current VIG</div>
                        <div className={`text-base font-black ${currentVig === 1.0 ? 'text-indigo-400' : currentVig === 1.3 ? 'text-emerald-400' : 'text-rose-400'}`}>{currentVig.toFixed(2)}x</div>
                      </div>
                      <button onClick={() => setExpandedReps(p => ({ ...p, [rep.id]: !p[rep.id] }))}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs border border-emerald-500/40 transition-all">
                        {isExpanded ? 'Hide Rates' : '📅 View Rates'}
                        {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded months */}
                  {isExpanded && (
                    <div className="px-4 pb-6 bg-black/30">
                      <div className="space-y-3 max-h-[900px] overflow-y-auto pr-2 pt-3">
                        {historicalMonths.length === 0 ? (
                          <div className="text-center py-8 text-neutral-500 text-xs">No data for this period.</div>
                        ) : historicalMonths.map(h => {
                          const md = h.reps?.[rep.id]
                          if (!md) return null

                          const isManual      = md.manualVigRate !== null
                          const fixKey        = `${rep.id}_${h.monthKey}`
                          const mismatchCount = md.mismatches?.length || 0
                          const isProfit      = md.metric !== 'SUBTOTAL'
                          const goalValue     = isProfit ? md.profitGoal   : md.subtotalGoal
                          const actualValue   = isProfit ? md.deadProfit   : md.subtotal
                          const pct           = goalValue > 0 ? Math.min((actualValue / goalValue) * 100, 100) : 0
                          const overPct       = goalValue > 0 ? Math.max(((actualValue - goalValue) / goalValue) * 100, 0) : 0
                          const isNoData      = md.invoiceCount === 0
                          const isStoredDays  = md.storedWorkingDays !== null

                          return (
                            <div key={h.monthKey} className={`rounded-xl border transition-all ${mismatchCount > 0 ? 'border-rose-500/30 bg-rose-950/10' : 'border-white/10 bg-black/20'}`}>
                              <div className="p-3 space-y-2.5">

                                {/* Row 1: Header */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-white text-sm">{h.monthName}</span>
                                    <span className="text-neutral-600 text-[10px] font-mono">{h.monthKey}</span>

                                    {/* VIG badge with hover tooltip */}
                                    <div className="group relative">
                                      <div className={`px-2 py-0.5 rounded-lg border text-[11px] font-black cursor-help flex items-center gap-1 ${
                                        isManual ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                                        : md.vigRate === 1.3 ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                                        : 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10'
                                      }`}>
                                        {md.vigRate.toFixed(2)}x
                                        {isManual ? ' 🔧' : md.lastSyncedVigRate ? ' 🔄' : ' ⚙️'}
                                      </div>
                                      <div className="absolute left-0 top-7 z-20 hidden group-hover:block w-60 bg-neutral-900 border border-white/20 rounded-xl p-3 shadow-2xl text-[10px] text-neutral-300 leading-relaxed pointer-events-none">
                                        <div className="font-bold text-white mb-1 text-[11px]">Why {md.vigRate.toFixed(2)}x?</div>
                                        <div>{md.vigReason || 'System default'}</div>
                                        {md.manualVigRate && <div className="mt-1 text-amber-300">Manual: {md.manualVigRate.toFixed(2)}x</div>}
                                        {md.lastSyncedVigRate && <div className="mt-0.5 text-sky-300">Zoho synced: {md.lastSyncedVigRate.toFixed(2)}x</div>}
                                      </div>
                                    </div>

                                    {!isNoData && (md.metGoal
                                      ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">✓ Goal Met</span>
                                      : <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">↗ {Math.round(pct)}% of goal</span>
                                    )}
                                    {mismatchCount > 0 && (
                                      <span className="text-[10px] text-rose-300 font-bold flex items-center gap-1"><FiAlertTriangle size={10} /> {mismatchCount} wrong rate</span>
                                    )}
                                  </div>
                                  {mismatchCount > 0 && (
                                    <button onClick={() => fixAllForMonth(rep.id, h.monthKey, md.vigRate, md.mismatches)} disabled={fixingAll[fixKey]}
                                      className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900 text-white text-xs font-bold rounded-lg transition-all active:scale-95">
                                      {fixingAll[fixKey] ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiTool size={11} />}
                                      Fix All {mismatchCount}
                                    </button>
                                  )}
                                </div>

                                {/* Row 2: Working days + Goals (all editable) */}
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-start">

                                  {/* Working Days */}
                                  <div className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1 flex items-center gap-1">
                                      <FiCalendar size={8} /> Working Days
                                    </div>
                                    <EditableNumber
                                      value={md.workingDays} step={1} min={1} prefix="" suffix=" days"
                                      className={isStoredDays ? 'text-amber-300' : 'text-white'}
                                      onSave={v => saveMonthGoal(rep.id, h.monthKey, { workingDays: v })}
                                    />
                                    <div className="text-[9px] text-neutral-600 mt-0.5">
                                      {isStoredDays ? `Override (auto: ${md.computedWorkingDays}d)` : `Auto-calc${holidays.length > 0 ? ` (${holidays.length} holiday${holidays.length!==1?'s':''} excl.)` : ''}`}
                                    </div>
                                  </div>

                                  {/* Profit Goal */}
                                  <div className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1">Profit Goal</div>
                                    <EditableNumber value={md.profitGoal} step={500} className="text-amber-300"
                                      onSave={v => saveMonthGoal(rep.id, h.monthKey, { profitGoal: v })} />
                                    <div className="text-[9px] text-neutral-600 mt-0.5">${md.workingDays > 0 ? Math.round(md.profitGoal/md.workingDays).toLocaleString() : '—'}/day</div>
                                  </div>

                                  {/* Subtotal Goal */}
                                  <div className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1">Subtotal Goal</div>
                                    <EditableNumber value={md.subtotalGoal} step={1000} className="text-sky-300"
                                      onSave={v => saveMonthGoal(rep.id, h.monthKey, { subtotalGoal: v })} />
                                    <div className="text-[9px] text-neutral-600 mt-0.5">${md.workingDays > 0 ? Math.round(md.subtotalGoal/md.workingDays).toLocaleString() : '—'}/day</div>
                                  </div>

                                  {/* Actual Dead Cost */}
                                  <div className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1">Dead Cost</div>
                                    <div className="text-rose-300 font-mono font-bold text-xs">${(md.deadCost||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                                    <div className="text-[9px] text-neutral-600 mt-0.5">{md.subtotal > 0 ? Math.round((md.deadCost/md.subtotal)*100) : 0}% of sub</div>
                                  </div>

                                  {/* Actual Dead Profit */}
                                  <div className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1">Dead Profit</div>
                                    <div className={`font-mono font-bold text-xs ${md.metGoal ? 'text-emerald-400' : 'text-amber-400'}`}>${(md.deadProfit||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                                    <div className="text-[9px] text-neutral-600 mt-0.5">{md.invoiceCount} inv · ${md.invoiceCount > 0 ? Math.round(md.subtotal/md.invoiceCount).toLocaleString() : 0} avg</div>
                                  </div>
                                </div>

                                {/* Row 3: Progress bar */}
                                {!isNoData && (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[9px] text-neutral-500">
                                      <span className="font-bold uppercase tracking-wider">{isProfit ? 'Dead Profit' : 'Subtotal'} vs Goal</span>
                                      <span className="font-mono">${actualValue.toLocaleString(undefined,{maximumFractionDigits:0})} / ${goalValue.toLocaleString()}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all duration-500 ${md.metGoal ? 'bg-emerald-500' : pct > 66 ? 'bg-amber-500' : pct > 33 ? 'bg-orange-500' : 'bg-rose-500'}`}
                                        style={{ width: `${Math.max(pct, 2)}%` }} />
                                    </div>
                                    {overPct > 0 && <div className="text-[9px] text-emerald-400 font-bold">+{Math.round(overPct)}% over goal 🎯</div>}
                                  </div>
                                )}

                                {/* Row 4: Mismatch invoice list */}
                                {mismatchCount > 0 && (
                                  <div className="space-y-1.5 pt-1 border-t border-rose-500/20">
                                    <div className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">
                                      Invoices at Wrong VIG Rate (expected {md.vigRate.toFixed(2)}x)
                                    </div>
                                    {md.mismatches.map(inv => (
                                      <div key={inv.id} className="flex items-center justify-between gap-2 bg-black/40 border border-rose-500/20 rounded-lg px-3 py-1.5 text-xs">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-white font-bold font-mono">{inv.number}</span>
                                          <span className="text-neutral-400">{inv.date}</span>
                                          <span className="text-sky-300 font-mono">${inv.amount.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                                          <span className="text-neutral-300 truncate max-w-[160px]">{inv.customer}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="text-[10px]">
                                            <span className="text-rose-400 font-bold">{inv.actualVig.toFixed(2)}x</span>
                                            <span className="text-neutral-500 mx-1">→</span>
                                            <span className="text-emerald-400 font-bold">{inv.expectedVig.toFixed(2)}x</span>
                                          </span>
                                          <button onClick={() => fixOneInvoice(inv, rep.id, h.monthKey)} disabled={fixingOne[inv.id]}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white font-bold rounded-lg text-[11px] active:scale-95">
                                            {fixingOne[inv.id] ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiTool size={11} />} Fix
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

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
        )}
      </div>
    </div>
  )
}
