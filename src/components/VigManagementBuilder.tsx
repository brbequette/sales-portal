"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import {
  FiSave, FiCheck, FiRefreshCw, FiZap, FiEye, FiEyeOff,
  FiTrendingUp, FiLayers, FiChevronDown, FiChevronUp,
  FiAlertTriangle, FiTool, FiCalendar, FiEdit2, FiExternalLink,
  FiArrowUp, FiFileText, FiX, FiDollarSign
} from "react-icons/fi"

// ────────────────────────────────────────────────────────────────
// Month Documents Breakdown Modal (showing Invoices, SOs, Quotes & 1.3x vs 1.5x Loss)
// ────────────────────────────────────────────────────────────────
function MonthDocumentsModal({
  monthKey,
  monthName,
  repId,
  repName,
  onClose,
}: {
  monthKey: string
  monthName: string
  repId: string
  repName: string
  onClose: () => void
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<"All" | "Invoice" | "Sales Order" | "Estimate">("All")
  const [search, setSearch] = useState("")

  useEffect(() => {
    const fetchDocs = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/month-documents?monthKey=${monthKey}&repId=${repId}`)
        const json = await res.json()
        if (json.success) setData(json)
      } catch (e) {
        console.error("Failed to fetch month documents:", e)
      } finally {
        setLoading(false)
      }
    }
    fetchDocs()
  }, [monthKey, repId])

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-neutral-900 border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-300 font-bold">Loading {monthName} documents & VIG loss analysis...</p>
        </div>
      </div>
    )
  }

  const docs = data?.documents || []
  const totals = data?.totals || {}
  const settings = data?.settings || { baselineVig: 1.3, targetVig: 1.5 }

  const filteredDocs = docs.filter((d: any) => {
    const matchesType = filterType === "All" || d.docType === filterType
    const matchesSearch =
      d.number.toLowerCase().includes(search.toLowerCase()) ||
      d.customerName.toLowerCase().includes(search.toLowerCase())
    return matchesType && matchesSearch
  })

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-950 border border-white/15 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-neutral-900/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest">
              <FiFileText size={14} />
              <span>Document & VIG Analysis</span>
              <span>•</span>
              <span className="text-white">{repName}</span>
            </div>
            <h2 className="text-xl font-black text-white mt-0.5">{monthName} ({monthKey}) All Documents</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-neutral-900/40 border-b border-white/10">
          <div className="bg-black/50 border border-white/10 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase text-neutral-400">Total Subtotal</div>
            <div className="text-base font-black text-white font-mono mt-0.5">${totals.subtotal?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 0}</div>
            <div className="text-[10px] text-neutral-500">{totals.documentCount || 0} total documents</div>
          </div>

          <div className="bg-black/50 border border-emerald-500/30 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase text-emerald-400">Profit @ {settings.baselineVig}x VIG</div>
            <div className="text-base font-black text-emerald-300 font-mono mt-0.5">${totals.baselineProfit?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 0}</div>
            <div className="text-[10px] text-neutral-500">Baseline VIG</div>
          </div>

          <div className="bg-black/50 border border-amber-500/30 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase text-amber-400">Target @ {settings.targetVig}x VIG</div>
            <div className="text-base font-black text-amber-300 font-mono mt-0.5">${totals.targetProfit?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 0}</div>
            <div className="text-[10px] text-neutral-500">Target 1.5x Goal</div>
          </div>

          <div className={`bg-black/50 border rounded-xl p-3 ${totals.lossToTarget > 0 ? "border-rose-500/40 bg-rose-950/20" : "border-emerald-500/40 bg-emerald-950/20"}`}>
            <div className="text-[10px] font-bold uppercase text-neutral-300">
              {settings.targetVig}x vs {settings.baselineVig}x Loss
            </div>
            <div className={`text-base font-black font-mono mt-0.5 ${totals.lossToTarget > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {totals.lossToTarget > 0 ? `-$${totals.lossToTarget?.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "✓ Target Met"}
            </div>
            <div className="text-[10px] text-neutral-400">
              {totals.lossToTarget > 0 ? "Potential loss to 1.5x target" : "Full 1.5x margin captured"}
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="p-3 border-b border-white/10 bg-neutral-900/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl p-1 text-xs">
            {(["All", "Invoice", "Sales Order", "Estimate"] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  filterType === t ? "bg-emerald-500 text-black shadow-md" : "text-neutral-400 hover:text-white"
                }`}
              >
                {t}s
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search documents or customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500 max-w-xs w-full"
          />
        </div>

        {/* Document Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredDocs.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs font-bold">No documents found for this selection.</div>
          ) : (
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-white/5 text-neutral-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Doc #</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3 text-right">Subtotal</th>
                  <th className="p-3 text-right">Profit @ 1.3x</th>
                  <th className="p-3 text-right">Profit @ 1.5x</th>
                  <th className="p-3 text-right">Loss / Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredDocs.map((d: any) => (
                  <tr key={d.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="p-3 font-mono font-bold text-white">{d.number}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        d.docType === 'Invoice' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        d.docType === 'Sales Order' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}>
                        {d.docType}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-400">{d.date}</td>
                    <td className="p-3 text-neutral-200 font-medium truncate max-w-[180px]">{d.customerName}</td>
                    <td className="p-3 text-right font-mono font-bold text-white">${d.subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="p-3 text-right font-mono text-emerald-400">${d.deadProfitBaseline.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="p-3 text-right font-mono text-amber-300">${d.deadProfitTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="p-3 text-right font-mono font-bold">
                      {d.lossToTarget > 0 ? (
                        <span className="text-rose-400">-${d.lossToTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      ) : (
                        <span className="text-emerald-400">-$0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
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
  subtotal: number; deadProfit: number; invoiceCount: number
  metGoal: boolean; mismatches: MismatchInvoice[]
}

interface HistoricalMonth { monthKey: string; monthName: string; reps: Record<string, MonthRepData> }

// ────────────────────────────────────────────────────────────────
// Inline editable number cell
// ────────────────────────────────────────────────────────────────
function EditCell({ value, onSave, prefix = "$", suffix = "", step = 100, min = 0, textClass = "text-white" }: {
  value: number; onSave: (v: number) => void
  prefix?: string; suffix?: string; step?: number; min?: number; textClass?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState("")
  const ref = useRef<HTMLInputElement>(null)

  const open  = () => { setDraft(String(value)); setEditing(true); setTimeout(() => ref.current?.select(), 0) }
  const close = () => setEditing(false)
  const commit = () => { const n = parseFloat(draft); if (!isNaN(n) && n !== value) onSave(n); close() }

  if (editing) return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-neutral-500 text-[10px]">{prefix}</span>}
      <input ref={ref} type="number" step={step} min={min} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') close() }}
        className="w-20 bg-black/70 border border-emerald-500/60 rounded px-2 py-0.5 text-white font-mono text-xs font-bold focus:outline-none" />
      {suffix && <span className="text-neutral-500 text-[10px]">{suffix}</span>}
    </div>
  )

  return (
    <button onClick={open} title="Click to edit"
      className={`flex items-center gap-1 group cursor-pointer hover:text-white transition-colors ${textClass}`}>
      {prefix && <span className="text-neutral-500 text-[10px]">{prefix}</span>}
      <span className="font-mono font-bold text-xs">{Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)}</span>
      {suffix && <span className="text-neutral-400 text-[10px] ml-0.5">{suffix}</span>}
      <FiEdit2 size={8} className="opacity-0 group-hover:opacity-50 transition-opacity" />
    </button>
  )
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
function vigRateBadge(rate: number, isManual: boolean, isSynced: boolean) {
  const cls = isManual
    ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
    : rate >= 1.5 ? 'border-rose-500/40 text-rose-300 bg-rose-500/10'
    : rate === 1.3 ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
    : 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10'
  const icon = isManual ? '🔧' : isSynced ? '🔄' : '⚙️'
  return { cls, icon }
}

// ────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────
export default function VigManagementBuilder() {
  const [defaultVigRate, setDefaultVigRate]   = useState<number | string>(1.3)
  const [targetVigRate, setTargetVigRate]     = useState<number | string>(1.5)
  const [baselineVigRate, setBaselineVigRate] = useState<number | string>(1.3)
  const [tariffRate, setTariffRate]           = useState<number | string>(12.5)
  const [repConfigs, setRepConfigs]           = useState<RepConfig[]>([])
  const [loading, setLoading]                 = useState(true)
  const [saving, setSaving]                   = useState(false)
  const [saveSuccess, setSaveSuccess]         = useState(false)
  const [errorMsg, setErrorMsg]               = useState<string | null>(null)
  const [showAll, setShowAll]                 = useState(false)

  const [historicalMonths, setHistoricalMonths]   = useState<HistoricalMonth[]>([])
  const [holidayCount, setHolidayCount]           = useState(0)
  const [historicalLoading, setHistoricalLoading] = useState(true)
  const [expandedReps, setExpandedReps]           = useState<Record<string, boolean>>({})
  const [monthsToLoad, setMonthsToLoad]           = useState(24)

  const [fixingAll, setFixingAll] = useState<Record<string, boolean>>({})
  const [fixingOne, setFixingOne] = useState<Record<string, boolean>>({})
  const [applyingEscalation, setApplyingEscalation] = useState<Record<string, boolean>>({})
  const [fixMessage, setFixMessage] = useState<string | null>(null)

  const [recalculatingId, setRecalculatingId]   = useState<string | null>(null)
  const [recalculatingAll, setRecalculatingAll] = useState(false)
  const [selectedMonth, setSelectedMonth]       = useState<string>("")
  const [recalcMessage, setRecalcMessage]       = useState<string | null>(null)
  const [syncingZoho, setSyncingZoho]           = useState(false)
  const [syncZohoMessage, setSyncZohoMessage]   = useState<string | null>(null)
  const [activeDocModal, setActiveDocModal]     = useState<{ monthKey: string; monthName: string; repId: string; repName: string } | null>(null)

  useEffect(() => { fetchVigData() }, [])
  useEffect(() => { fetchHistoricalRates(monthsToLoad) }, [monthsToLoad])

  const fetchVigData = async () => {
    try {
      setLoading(true); setErrorMsg(null)
      const [res, sRes] = await Promise.all([
        fetch('/api/admin/users/vig'),
        fetch('/api/admin/settings')
      ])
      const data = await res.json()
      const sData = await sRes.json()
      if (data.success) { setDefaultVigRate(data.defaultVigRate); setRepConfigs(data.repConfigs || []) }
      else throw new Error(data.error)

      if (sData.success && sData.settings) {
        setTargetVigRate(sData.settings.target_vig_rate ?? 1.5)
        setBaselineVigRate(sData.settings.baseline_vig_rate ?? 1.3)
        setTariffRate(sData.settings.tariff_surcharge_rate ? sData.settings.tariff_surcharge_rate * 100 : 12.5)
      }
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
        setHolidayCount(data.holidayCount ?? 0)
      }
    } catch (e) { console.error('vig-history fetch failed:', e) }
    finally { setHistoricalLoading(false) }
  }, [])

  // ── Save a month-goal field ──────────────────────────────────
  const saveMonthGoal = async (repId: string, monthKey: string, patch: Record<string, any>) => {
    try {
      const res  = await fetch('/api/admin/save-vig-month-goal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId, monthKey, ...patch })
      })
      const data = await res.json()
      if (data.success) fetchHistoricalRates(monthsToLoad)
      else console.error('save-vig-month-goal:', data.error)
    } catch (e) { console.error(e) }
  }

  // ── Save with Working Days recalculation: keep daily rates constant, update monthly goals ──
  const saveWorkingDaysRecalc = (repId: string, monthKey: string, newDays: number, md: MonthRepData) => {
    const oldDays = md.workingDays || 1
    const dailyProfit = oldDays > 0 ? md.profitGoal / oldDays : 0
    const dailySub = oldDays > 0 ? md.subtotalGoal / oldDays : 0
    saveMonthGoal(repId, monthKey, {
      workingDays: newDays,
      profitGoal: Math.round(dailyProfit * newDays),
      subtotalGoal: Math.round(dailySub * newDays)
    })
  }

  // ── Save Daily Rate: compute monthly goal = dailyRate × workingDays ──
  const saveDailyRate = (repId: string, monthKey: string, newDailyRate: number, field: 'profit' | 'subtotal', workingDays: number) => {
    const monthlyGoal = Math.round(newDailyRate * workingDays)
    if (field === 'profit') {
      saveMonthGoal(repId, monthKey, { profitGoal: monthlyGoal })
    } else {
      saveMonthGoal(repId, monthKey, { subtotalGoal: monthlyGoal })
    }
  }

  // ── Apply VIG escalation for next month ─────────────────────
  const applyEscalation = async (repId: string, nextMonthKey: string, newRate: number) => {
    const key = `${repId}_${nextMonthKey}`
    setApplyingEscalation(p => ({ ...p, [key]: true }))
    try {
      const res  = await fetch('/api/admin/save-vig-month-goal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId, monthKey: nextMonthKey, manualVigRate: newRate })
      })
      const data = await res.json()
      if (data.success) {
        setFixMessage(`✅ VIG escalated to ${newRate.toFixed(2)}x for ${nextMonthKey}`)
        setTimeout(() => setFixMessage(null), 5000)
        fetchHistoricalRates(monthsToLoad)
      }
    } catch (e: any) { alert(e.message) }
    finally { setApplyingEscalation(p => ({ ...p, [key]: false })) }
  }

  // ── Fix invoice VIG ──────────────────────────────────────────
  const fixOneInvoice = async (inv: MismatchInvoice, repId: string, monthKey: string) => {
    setFixingOne(p => ({ ...p, [inv.id]: true }))
    try {
      const res  = await fetch('/api/admin/fix-vig-rate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: [inv.id], repId, monthKey, newVigRate: inv.expectedVig })
      })
      const data = await res.json()
      if (data.success) {
        setFixMessage(`✅ Fixed ${inv.number}`)
        setTimeout(() => setFixMessage(null), 4000)
        fetchHistoricalRates(monthsToLoad)
      }
    } catch (e: any) { alert(e.message) }
    finally { setFixingOne(p => ({ ...p, [inv.id]: false })) }
  }

  const fixAllForMonth = async (repId: string, monthKey: string, vigRate: number, mismatches: MismatchInvoice[]) => {
    const key = `${repId}_${monthKey}`
    setFixingAll(p => ({ ...p, [key]: true }))
    try {
      const res  = await fetch('/api/admin/fix-vig-rate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixAll: true, invoiceIds: mismatches.map(m => m.id), repId, monthKey, newVigRate: vigRate })
      })
      const data = await res.json()
      if (data.success) {
        setFixMessage(`✅ Fixed ${data.updatedCount} invoices`)
        setTimeout(() => setFixMessage(null), 5000)
        fetchHistoricalRates(monthsToLoad)
      }
    } catch (e: any) { alert(e.message) }
    finally { setFixingAll(p => ({ ...p, [key]: false })) }
  }

  const handleRepChange = (id: string, field: keyof RepConfig, value: any) =>
    setRepConfigs(p => p.map(r => r.id === id ? { ...r, [field]: value } : r))

  const handleRecalculateDocuments = async (repId?: string) => {
    try {
      if (repId) setRecalculatingId(repId); else setRecalculatingAll(true)
      const res  = await fetch('/api/admin/recalculate-vig-documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId, monthKey: selectedMonth || undefined, applyToAll: !repId })
      })
      const data = await res.json()
      if (data.success) { setRecalcMessage(data.message || 'Done!'); setTimeout(() => setRecalcMessage(null), 5000) }
      else alert('Error: ' + data.error)
    } catch (e: any) { alert(e.message) }
    finally { setRecalculatingId(null); setRecalculatingAll(false) }
  }

  const handleSyncAllVigToZoho = async () => {
    try {
      setSyncingZoho(true); setSyncZohoMessage("Pushing to Zoho Books...")
      const res  = await fetch('/api/sync-vig-to-zoho', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId: "all", monthKey: selectedMonth || "2026-08", newVigRate: 1.3 })
      })
      const data = await res.json()
      if (data.success || res.ok) { setSyncZohoMessage("✅ Synced!"); setTimeout(() => setSyncZohoMessage(null), 5000) }
      else alert("Error: " + (data.error || data.message))
    } catch (e: any) { alert(e.message) }
    finally { setSyncingZoho(false) }
  }

  const handleSaveAll = async () => {
    try {
      setSaving(true); setSaveSuccess(false)
      const [res, sRes] = await Promise.all([
        fetch('/api/admin/users/vig', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultVigRate: parseFloat(String(defaultVigRate)) || 1.3, repConfigs })
        }),
        fetch('/api/admin/settings', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_vig_rate: parseFloat(String(targetVigRate)) || 1.5,
            baseline_vig_rate: parseFloat(String(baselineVigRate)) || 1.3,
            tariff_surcharge_rate: (parseFloat(String(tariffRate)) || 12.5) / 100
          })
        })
      ])
      const data = await res.json()
      const sData = await sRes.json()
      if (data.success && sData.success) {
        setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000)
        // Also update current month goals from rep daily rates
        const now = new Date()
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        for (const rep of repConfigs) {
          const dp = parseFloat(String(rep.dailyProfitGoal)) || 0
          const ds = parseFloat(String(rep.dailySubtotalGoal)) || 0
          const currentMonthData = historicalMonths.find(h => h.monthKey === currentMonthKey)?.reps?.[rep.id]
          const wd = currentMonthData?.workingDays || 22
          if (dp > 0 || ds > 0) {
            saveMonthGoal(rep.id, currentMonthKey, {
              profitGoal: Math.round(dp * wd),
              subtotalGoal: Math.round(ds * wd)
            })
          }
        }
      }
      else alert('Error saving: ' + (data.error || sData.error))
    } catch { alert('Save failed.') }
    finally { setSaving(false) }
  }

  // ── Build next-month key from a given monthKey ──────────────
  const nextMonthKey = (mk: string) => {
    const [yyyy, mm] = mk.split('-').map(Number)
    const d = new Date(yyyy, mm, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // ── Check if next month already has escalated rate ──────────
  const getNextMonthData = (repId: string, mk: string) => {
    const nmk  = nextMonthKey(mk)
    const nmh  = historicalMonths.find(h => h.monthKey === nmk)
    return nmh?.reps?.[repId] ?? null
  }

  const activeConfigs    = showAll ? repConfigs : repConfigs.filter(r => r.isVisible)
  const globalMismatches = historicalMonths.reduce((s, h) =>
    s + activeConfigs.reduce((ss, r) => ss + (h.reps?.[r.id]?.mismatches?.length || 0), 0), 0)

  // ── Loading / Error states ───────────────────────────────────
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

      {/* ── Top Banner ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-gradient-to-r from-neutral-900 via-neutral-900 to-emerald-950/30 p-6 rounded-2xl border border-white/10 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-black text-xs tracking-widest uppercase mb-1">
            <FiLayers /> VIG Multipliers &amp; Goals Engine
          </div>
          <h2 className="text-2xl font-black text-white">Sales Rep VIG &amp; Dead Profit Management</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Goals track <strong className="text-white">Dead Profit</strong> (Subtotal − Base Cost − Fees) or <strong className="text-white">Subtotal</strong> — selectable per month.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {globalMismatches > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] text-rose-300 font-bold">
                <FiAlertTriangle size={12} /> {globalMismatches} invoice{globalMismatches !== 1 ? 's' : ''} with incorrect VIG rates
              </span>
            )}
            <a href="/admin/holidays" target="_blank"
              className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-bold transition-colors">
              <FiCalendar size={11} /> {holidayCount} holiday{holidayCount !== 1 ? 's' : ''} loaded
              <FiExternalLink size={10} className="ml-0.5" />
            </a>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5">
            <span className="text-[11px] font-bold text-neutral-400 uppercase">Month:</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white text-xs font-mono font-bold focus:outline-none cursor-pointer">
              <option value="" className="bg-neutral-900">All</option>
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
            ⚡ Recalc VIG
          </button>
          <button onClick={handleSyncAllVigToZoho} disabled={syncingZoho}
            className="px-4 py-3 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95">
            {syncingZoho ? <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" /> : <FiZap size={14} />}
            🚀 Push to Zoho
          </button>
          <button onClick={handleSaveAll} disabled={saving}
            className={`px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all shadow-xl cursor-pointer ${saveSuccess ? 'bg-emerald-500 text-black' : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02] active:scale-95'}`}>
            {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : saveSuccess ? <><FiCheck size={18} /> Saved!</> : <><FiSave size={18} /> Save All</>}
          </button>
        </div>
      </div>

      {/* Status messages */}
      {recalcMessage  && <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2"><FiCheck size={16}/> {recalcMessage}</div>}
      {syncZohoMessage && <div className="p-4 bg-indigo-950/40 border border-indigo-500/40 rounded-xl text-indigo-300 text-xs font-bold flex items-center gap-2"><FiZap size={16}/> {syncZohoMessage}</div>}
      {fixMessage     && <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2"><FiCheck size={16}/> {fixMessage}</div>}

      {/* ── Global Presets & System Multipliers ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-neutral-400 block">Baseline VIG Rate</label>
          <div className="flex items-center gap-3">
            <input type="number" step="0.05" value={baselineVigRate} onChange={e => setBaselineVigRate(e.target.value)}
              className="w-28 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-white font-mono text-base font-bold focus:outline-none focus:border-emerald-500"/>
            <span className="text-[11px] text-neutral-400">1.30× Baseline</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-amber-500/20 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 block">Target VIG Rate</label>
          <div className="flex items-center gap-3">
            <input type="number" step="0.05" value={targetVigRate} onChange={e => setTargetVigRate(e.target.value)}
              className="w-28 bg-black/40 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-300 font-mono text-base font-bold focus:outline-none focus:border-amber-500"/>
            <span className="text-[11px] text-neutral-400">1.50× Target</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-rose-500/20 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-rose-400 block">Tariff Surcharge Rate</label>
          <div className="flex items-center gap-2">
            <input type="number" step="0.5" value={tariffRate} onChange={e => setTariffRate(e.target.value)}
              className="w-28 bg-black/40 border border-rose-500/30 rounded-xl px-3 py-2 text-rose-300 font-mono text-base font-bold focus:outline-none focus:border-rose-500"/>
            <span className="text-xs text-neutral-400">%</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5"><FiZap /> Daily Presets</label>
          <div className="flex gap-2">
            {[1000,1500,2000].map(a => (
              <button key={a} onClick={() => setRepConfigs(p => p.map(r => ({...r, dailyProfitGoal: a})))}
                className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors">${a.toLocaleString()}/d</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Rep Config Table ─────────────────────────────────────── */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-neutral-300">
            Sales Rep Configurations ({activeConfigs.length}{!showAll ? ' Active' : ''} Reps)
          </span>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAll(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showAll ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-black/40 text-neutral-400 border-white/10 hover:text-white'}`}>
              {showAll ? <FiEye size={12}/> : <FiEyeOff size={12}/>} {showAll ? 'Active Only' : 'Show All'}
            </button>
            <button onClick={fetchVigData} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors">
              <FiRefreshCw size={12}/> Reload
            </button>
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
                const dp = parseFloat(String(rep.dailyProfitGoal)) || 0
                const ds = parseFloat(String(rep.dailySubtotalGoal)) || 0
                return (
                  <tr key={rep.id} className={`hover:bg-white/[0.02] transition-colors ${!rep.isVisible ? 'opacity-55' : ''}`}>
                    <td className="py-4 px-6">
                      <div className="text-white text-sm font-extrabold">{rep.name}</div>
                      <div className="text-[11px] text-neutral-400 font-mono">{rep.email}</div>
                      {!rep.isVisible && <span className="text-[9px] text-neutral-500 font-bold uppercase">Hidden</span>}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button onClick={() => handleRepChange(rep.id, 'isVisible', !rep.isVisible)}
                        className={`p-2 rounded-xl transition-all ${rep.isVisible ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-500'}`}>
                        {rep.isVisible ? <FiEye size={16}/> : <FiEyeOff size={16}/>}
                      </button>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={rep.constantVigEnabled} onChange={e => handleRepChange(rep.id, 'constantVigEnabled', e.target.checked)}
                            className="rounded border-neutral-700 bg-neutral-900 text-emerald-500"/>
                          <span className="text-[11px] font-semibold text-neutral-300">Override VIG</span>
                        </label>
                        {rep.constantVigEnabled
                          ? <div className="flex items-center gap-2">
                              <input type="number" step="0.05" value={rep.constantVigValue} onChange={e => handleRepChange(rep.id, 'constantVigValue', e.target.value)}
                                className="w-24 bg-emerald-950/30 border border-emerald-500/40 rounded-lg px-3 py-1.5 text-emerald-300 font-mono text-xs font-bold focus:outline-none"/>
                              <span className="text-[10px] text-emerald-400 font-bold">Override Rate</span>
                            </div>
                          : <span className="text-[11px] text-neutral-400 font-mono">Default ({defaultVigRate}x)</span>
                        }
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-3 top-2.5 text-neutral-400 text-xs">$</span>
                        <input type="number" step="100" value={rep.dailyProfitGoal} onChange={e => handleRepChange(rep.id, 'dailyProfitGoal', e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-2 text-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-amber-400"/>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-3 top-2.5 text-neutral-400 text-xs">$</span>
                        <input type="number" step="100" value={rep.dailySubtotalGoal} onChange={e => handleRepChange(rep.id, 'dailySubtotalGoal', e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-2 text-cyan-300 font-mono font-bold text-xs focus:outline-none focus:border-cyan-400"/>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button onClick={() => handleRecalculateDocuments(rep.id)} disabled={recalculatingId === rep.id}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 mx-auto active:scale-95">
                        {recalculatingId === rep.id ? <div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin"/> : <FiRefreshCw size={12}/>}
                        Re-run
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

      {/* ── Historical VIG Rate Cards ─────────────────────────── */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2">
              👤 Historical VIG Rate Cards — Monthly Breakdown
            </div>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Click any goal or working-day value to edit it. Metric (Profit / Subtotal) toggleable per month.
              Holidays auto-excluded — <a href="/admin/holidays" className="text-amber-400 hover:underline" target="_blank">manage holidays ↗</a>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={monthsToLoad} onChange={e => setMonthsToLoad(parseInt(e.target.value))}
              className="bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs font-bold focus:outline-none cursor-pointer">
              {[12,24,36,60,72].map(n => <option key={n} value={n} className="bg-neutral-900">{n} months</option>)}
            </select>
            <button onClick={() => setShowAll(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showAll ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-black/40 text-neutral-400 border-white/10 hover:text-white'}`}>
              {showAll ? <FiEye size={12}/> : <FiEyeOff size={12}/>} {showAll ? 'Active Only' : 'Show All'}
            </button>
            <button onClick={() => fetchHistoricalRates(monthsToLoad)}
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors">
              <FiRefreshCw size={12}/> Reload
            </button>
          </div>
        </div>

        {historicalLoading ? (
          <div className="flex items-center justify-center p-12 text-neutral-500 text-xs font-bold gap-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"/>
            Loading {monthsToLoad} months...
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {activeConfigs.map(rep => {
              const isExpanded      = !!expandedReps[rep.id]
              const latestVig       = historicalMonths[0]?.reps?.[rep.id]?.vigRate ?? 1.3
              const totalMismatches = historicalMonths.reduce((s, h) => s + (h.reps?.[rep.id]?.mismatches?.length || 0), 0)

              return (
                <div key={rep.id}>
                  {/* ── Rep header row ── */}
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
                          <FiAlertTriangle size={10}/> {totalMismatches} rate mismatch{totalMismatches !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-neutral-500">Current VIG</div>
                        <div className={`text-base font-black ${latestVig >= 1.5 ? 'text-rose-400' : latestVig === 1.3 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                          {latestVig.toFixed(2)}x
                        </div>
                      </div>
                      <button onClick={() => setExpandedReps(p => ({ ...p, [rep.id]: !p[rep.id] }))}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs border border-emerald-500/40 transition-all">
                        {isExpanded ? 'Hide' : '📅 View Rates'}
                        {isExpanded ? <FiChevronUp size={14}/> : <FiChevronDown size={14}/>}
                      </button>
                    </div>
                  </div>

                  {/* ── Expanded months ── */}
                  {isExpanded && (
                    <div className="px-4 pb-6 bg-black/30">
                      <div className="space-y-3 max-h-[900px] overflow-y-auto pr-2 pt-3">
                        {historicalMonths.map(h => {
                          const md = h.reps?.[rep.id]
                          if (!md) return null

                          const isManual      = md.manualVigRate !== null
                          const isSynced      = md.lastSyncedVigRate !== null
                          const fixKey        = `${rep.id}_${h.monthKey}`
                          const mismatchCount = md.mismatches?.length || 0
                          const isProfit      = md.metric !== 'SUBTOTAL'
                          const goalValue     = isProfit ? md.profitGoal   : md.subtotalGoal
                          const actualValue   = isProfit ? md.deadProfit   : md.subtotal
                          const pct           = goalValue > 0 ? Math.min((actualValue / goalValue) * 100, 100) : 0
                          const overPct       = goalValue > 0 ? Math.max(((actualValue - goalValue) / goalValue) * 100, 0) : 0
                          const isNoData      = md.invoiceCount === 0
                          const isStoredDays  = md.storedWorkingDays !== null
                          const { cls: vigCls, icon: vigIcon } = vigRateBadge(md.vigRate, isManual, isSynced)

                          // ── VIG Escalation logic ────────────────────────────
                          // If goal was MISSED and current rate is base (1.3), next month SHOULD be 1.5
                          const ESCALATED_RATE = 1.5
                          const DEFAULT_RATE   = 1.3
                          const goalMissed     = !isNoData && !md.metGoal && md.vigRate <= DEFAULT_RATE
                          const nmk            = nextMonthKey(h.monthKey)
                          const nmData         = getNextMonthData(rep.id, h.monthKey)
                          // Only show escalation alert if next month hasn't already been escalated
                          const needsEscalation = goalMissed && nmData && nmData.vigRate < ESCALATED_RATE
                          const escalApplied    = goalMissed && nmData && nmData.vigRate >= ESCALATED_RATE
                          const escalKey        = `${rep.id}_${nmk}`

                          return (
                            <div key={h.monthKey} className={`rounded-xl border transition-all ${
                              mismatchCount > 0 ? 'border-rose-500/30 bg-rose-950/10'
                              : needsEscalation ? 'border-amber-500/30 bg-amber-950/10'
                              : 'border-white/10 bg-black/20'
                            }`}>
                              <div className="p-3 space-y-2.5">

                                {/* ── Row 1: Header ── */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-white text-sm">{h.monthName}</span>
                                    <span className="text-neutral-600 text-[10px] font-mono">{h.monthKey}</span>

                                    {/* VIG badge + tooltip */}
                                    <div className="group relative">
                                      <div className={`px-2 py-0.5 rounded-lg border text-[11px] font-black cursor-help flex items-center gap-1 ${vigCls}`}>
                                        {md.vigRate.toFixed(2)}x {vigIcon}
                                      </div>
                                      <div className="absolute left-0 top-7 z-30 hidden group-hover:block w-60 bg-neutral-900 border border-white/20 rounded-xl p-3 shadow-2xl text-[10px] text-neutral-300 leading-relaxed pointer-events-none">
                                        <div className="font-bold text-white mb-1 text-[11px]">Why {md.vigRate.toFixed(2)}x?</div>
                                        <div>{md.vigReason}</div>
                                        {md.manualVigRate && <div className="mt-1 text-amber-300">Manual override: {md.manualVigRate.toFixed(2)}x</div>}
                                        {md.lastSyncedVigRate && <div className="mt-0.5 text-sky-300">Zoho synced: {md.lastSyncedVigRate.toFixed(2)}x</div>}
                                      </div>
                                    </div>

                                    {/* View All Docs Button */}
                                    <button
                                      onClick={() => setActiveDocModal({ monthKey: h.monthKey, monthName: h.monthName, repId: rep.id, repName: rep.name })}
                                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer"
                                      title="View all invoices, sales orders, and estimates for this month"
                                    >
                                      <FiFileText size={12} />
                                      <span>View Docs &amp; Loss</span>
                                    </button>

                                    {/* Goal met/missed */}
                                    {!isNoData && (md.metGoal
                                      ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">✓ Goal Met</span>
                                      : <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">↗ {Math.round(Math.min((isProfit ? (md.deadProfit / md.profitGoal) * 100 : (md.subtotal / md.subtotalGoal) * 100), 100))}% of goal</span>
                                    )}

                                    {mismatchCount > 0 && (
                                      <span className="text-[10px] text-rose-300 font-bold flex items-center gap-1">
                                        <FiAlertTriangle size={10}/> {mismatchCount} wrong rate
                                      </span>
                                    )}
                                  </div>

                                  {mismatchCount > 0 && (
                                    <button onClick={() => fixAllForMonth(rep.id, h.monthKey, md.vigRate, md.mismatches)} disabled={fixingAll[fixKey]}
                                      className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900 text-white text-xs font-bold rounded-lg transition-all active:scale-95">
                                      {fixingAll[fixKey] ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <FiTool size={11}/>}
                                      Fix All {mismatchCount}
                                    </button>
                                  )}
                                </div>

                                {/* ── VIG Escalation Alert ── */}
                                {needsEscalation && (
                                  <div className="flex items-center justify-between gap-3 bg-amber-900/30 border border-amber-500/40 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <FiArrowUp size={12} className="text-amber-300 shrink-0"/>
                                      <div className="text-[11px]">
                                        <span className="text-amber-300 font-bold">Goal missed at {md.vigRate.toFixed(2)}x</span>
                                        <span className="text-neutral-400"> — next month ({nmk}) should be </span>
                                        <span className="text-rose-300 font-black">{ESCALATED_RATE.toFixed(2)}x</span>
                                      </div>
                                    </div>
                                    <button onClick={() => applyEscalation(rep.id, nmk, ESCALATED_RATE)} disabled={applyingEscalation[escalKey]}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-800 text-black text-xs font-black rounded-lg transition-all active:scale-95 shrink-0">
                                      {applyingEscalation[escalKey] ? <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"/> : <FiArrowUp size={11}/>}
                                      Apply {ESCALATED_RATE.toFixed(2)}x to {nmk}
                                    </button>
                                  </div>
                                )}
                                {escalApplied && (
                                  <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-[10px] text-emerald-400 font-bold">
                                    <FiCheck size={10}/> Next month ({nmk}) already escalated to {nmData?.vigRate.toFixed(2)}x
                                  </div>
                                )}

                                 {/* ── Row 2: Metric Toggle ── */}
                                 <div className="flex items-center gap-2 px-1">
                                   <span className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider">Goal Metric:</span>
                                   <button
                                     onClick={() => saveMonthGoal(rep.id, h.monthKey, { metric: 'PROFIT' })}
                                     className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${isProfit ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-black/30 text-neutral-500 border border-white/5 hover:text-neutral-300'}`}
                                   >Dead Profit</button>
                                   <button
                                     onClick={() => saveMonthGoal(rep.id, h.monthKey, { metric: 'SUBTOTAL' })}
                                     className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${!isProfit ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-black/30 text-neutral-500 border border-white/5 hover:text-neutral-300'}`}
                                   >Subtotal</button>
                                 </div>

                                 {/* ── Row 3: Stats Grid (6 cards) ── */}
                                 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">

                                   {/* Working Days (editable — recalculates goals) */}
                                   <div className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                                     <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1 flex items-center gap-1">
                                       <FiCalendar size={8}/> Working Days
                                     </div>
                                     <EditCell value={md.workingDays} step={1} min={1} prefix="" suffix=" days"
                                       textClass={isStoredDays ? 'text-amber-300' : 'text-white'}
                                       onSave={v => saveWorkingDaysRecalc(rep.id, h.monthKey, v, md)}/>
                                     <div className="text-[9px] text-neutral-600 mt-0.5">
                                       {isStoredDays ? `Override (auto: ${md.computedWorkingDays}d)` : `Auto (excl. ${holidayCount} holiday${holidayCount !== 1 ? 's' : ''})`}
                                     </div>
                                   </div>

                                   {/* Daily Profit Rate (editable — recalculates profit goal) */}
                                   <div className={`bg-black/40 rounded-lg px-3 py-2 border ${isProfit ? 'border-amber-500/30 ring-1 ring-amber-500/10' : 'border-white/5'}`}>
                                     <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1 flex items-center gap-1">
                                       {isProfit && <span className="text-amber-400">●</span>} Daily Profit
                                     </div>
                                     <EditCell value={md.workingDays > 0 ? Math.round(md.profitGoal / md.workingDays) : 0} step={50}
                                       textClass="text-amber-300"
                                       onSave={v => saveDailyRate(rep.id, h.monthKey, v, 'profit', md.workingDays)}/>
                                     <div className="text-[9px] text-neutral-600 mt-0.5">
                                       ×{md.workingDays}d = ${md.profitGoal.toLocaleString()}
                                     </div>
                                   </div>

                                   {/* Monthly Profit Goal (editable) */}
                                   <div className={`bg-black/40 rounded-lg px-3 py-2 border ${isProfit ? 'border-amber-500/20' : 'border-white/5'}`}>
                                     <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1 flex items-center gap-1">
                                       {isProfit && <span className="text-amber-400">●</span>} Profit Goal
                                     </div>
                                     <EditCell value={md.profitGoal} step={500} textClass="text-amber-300"
                                       onSave={v => saveMonthGoal(rep.id, h.monthKey, { profitGoal: v })}/>
                                     <div className="text-[9px] text-neutral-600 mt-0.5">
                                       ${md.workingDays > 0 ? Math.round(md.profitGoal / md.workingDays).toLocaleString() : '—'}/day
                                     </div>
                                   </div>

                                   {/* Subtotal Goal (editable) */}
                                   <div className={`bg-black/40 rounded-lg px-3 py-2 border ${!isProfit ? 'border-sky-500/20' : 'border-white/5'}`}>
                                     <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1 flex items-center gap-1">
                                       {!isProfit && <span className="text-sky-400">●</span>} Subtotal Goal
                                     </div>
                                     <EditCell value={md.subtotalGoal} step={1000} textClass="text-sky-300"
                                       onSave={v => saveMonthGoal(rep.id, h.monthKey, { subtotalGoal: v })}/>
                                     <div className="text-[9px] text-neutral-600 mt-0.5">
                                       ${md.workingDays > 0 ? Math.round(md.subtotalGoal / md.workingDays).toLocaleString() : '—'}/day
                                     </div>
                                   </div>

                                   {/* Dead Profit Actual */}
                                   <div className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                                     <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider mb-1">Dead Profit Actual</div>
                                     <div className={`font-mono font-bold text-xs ${isNoData ? 'text-neutral-600' : md.metGoal && isProfit ? 'text-emerald-400' : 'text-amber-400'}`}>
                                       ${(md.deadProfit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                     </div>
                                     <div className="text-[9px] text-neutral-600 mt-0.5">
                                       {md.invoiceCount} inv · ${md.invoiceCount > 0 ? Math.round(md.subtotal / md.invoiceCount).toLocaleString() : 0} avg sub
                                     </div>
                                   </div>

                                   {/* 1.3x vs 1.5x VIG Loss Comparison */}
                                   {(() => {
                                     const target1_5 = md.subtotal * (1.5 / 1.3) - (md.subtotal - md.deadProfit)
                                     const lossVal = Math.max(0, target1_5 - md.deadProfit)
                                     const isLoss = lossVal > 10
                                     return (
                                       <div className={`rounded-lg px-3 py-2 border ${isLoss ? 'bg-rose-950/20 border-rose-500/40' : 'bg-emerald-950/20 border-emerald-500/40'}`}>
                                         <div className="text-[9px] uppercase font-bold tracking-wider mb-1 flex items-center justify-between">
                                           <span className={isLoss ? 'text-rose-400' : 'text-emerald-400'}>1.3x vs 1.5x VIG</span>
                                           <span className="text-[8px] font-mono font-bold">{isLoss ? 'LOSS' : 'OK'}</span>
                                         </div>
                                         <div className={`font-mono font-bold text-xs ${isLoss ? 'text-rose-400' : 'text-emerald-400'}`}>
                                           {isLoss ? `-$${Math.round(lossVal).toLocaleString()}` : '✓ Target Met'}
                                         </div>
                                         <div className="text-[9px] text-neutral-400 mt-0.5 truncate">
                                           {isLoss ? 'Potential loss to 1.5x target' : 'Full 1.5x margin captured'}
                                         </div>
                                       </div>
                                     )
                                   })()}
                                 </div>

                                {/* ── Row 3: Subtotal actual (secondary stat) ── */}
                                {!isNoData && (
                                  <div className="flex items-center gap-4 px-1 text-[10px] text-neutral-400">
                                    <span>Subtotal actual: <strong className="text-sky-300 font-mono">${(md.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                                    {!isProfit && md.metGoal && <span className="text-emerald-400 font-bold">✓ Subtotal goal met</span>}
                                    {!isProfit && !md.metGoal && <span className="text-amber-400 font-bold">↗ {Math.round(pct)}% of subtotal goal</span>}
                                  </div>
                                )}

                                {/* ── Row 4: Progress bar ── */}
                                {!isNoData && (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[9px] text-neutral-500">
                                      <span className="font-bold uppercase tracking-wider">{isProfit ? 'Dead Profit' : 'Subtotal'} vs Goal</span>
                                      <span className="font-mono">${actualValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${goalValue.toLocaleString()}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all duration-500 ${md.metGoal ? 'bg-emerald-500' : pct > 66 ? 'bg-amber-500' : pct > 33 ? 'bg-orange-500' : 'bg-rose-500'}`}
                                        style={{ width: `${Math.max(pct, 2)}%` }}/>
                                    </div>
                                    {overPct > 0 && <div className="text-[9px] text-emerald-400 font-bold">+{Math.round(overPct)}% over goal 🎯</div>}
                                  </div>
                                )}

                                {/* ── Row 5: Mismatch invoices ── */}
                                {mismatchCount > 0 && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-rose-500/20">
                                    <div className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">
                                      Invoices at Wrong VIG Rate (expected {md.vigRate.toFixed(2)}x)
                                    </div>
                                    {md.mismatches.map(inv => (
                                      <div key={inv.id} className="flex items-center justify-between gap-2 bg-black/40 border border-rose-500/20 rounded-lg px-3 py-1.5 text-xs">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-white font-bold font-mono">{inv.number}</span>
                                          <span className="text-neutral-400">{inv.date}</span>
                                          <span className="text-sky-300 font-mono">${inv.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                          <span className="text-neutral-300 truncate max-w-[140px]">{inv.customer}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="text-[10px]">
                                            <span className="text-rose-400 font-bold">{inv.actualVig.toFixed(2)}x</span>
                                            <span className="text-neutral-500 mx-1">→</span>
                                            <span className="text-emerald-400 font-bold">{inv.expectedVig.toFixed(2)}x</span>
                                          </span>
                                          <button onClick={() => fixOneInvoice(inv, rep.id, h.monthKey)} disabled={fixingOne[inv.id]}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white font-bold rounded-lg text-[11px] active:scale-95">
                                            {fixingOne[inv.id] ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <FiTool size={11}/>} Fix
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

      {/* Month Documents Modal */}
      {activeDocModal && (
        <MonthDocumentsModal
          monthKey={activeDocModal.monthKey}
          monthName={activeDocModal.monthName}
          repId={activeDocModal.repId}
          repName={activeDocModal.repName}
          onClose={() => setActiveDocModal(null)}
        />
      )}
    </div>
  )
}
