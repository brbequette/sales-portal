"use client"

import { useState, useEffect, useCallback, useMemo } from "react"

export interface RepConfig {
  id: string; name: string; email: string; role: string
  isVisible: boolean; constantVigEnabled: boolean
  constantVigValue: number | string
  dailyProfitGoal: number | string; dailySubtotalGoal: number | string
}

export interface MismatchInvoice {
  id: string; zohoId: string; number: string; date: string
  amount: number; actualVig: number; expectedVig: number; customer: string
}

export interface MonthRepData {
  vigRate: number; manualVigRate: number | null; lastSyncedVigRate: number | null
  vigReason: string; metric: string
  profitGoal: number; subtotalGoal: number
  workingDays: number; computedWorkingDays: number; storedWorkingDays: number | null; dailyGoal: number
  subtotal: number; deadCost: number; deadProfit: number; invoiceCount: number
  metGoal: boolean; mismatches: MismatchInvoice[]
}

export interface HistoricalMonth { monthKey: string; monthName: string; reps: Record<string, MonthRepData> }

export function useVigManagementData() {
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

  const fetchVigData = useCallback(async () => {
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
  }, [])

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

  useEffect(() => { fetchVigData() }, [fetchVigData])
  useEffect(() => { fetchHistoricalRates(monthsToLoad) }, [fetchHistoricalRates, monthsToLoad])

  const saveMonthGoal = useCallback(async (repId: string, monthKey: string, patch: Record<string, any>) => {
    try {
      const res  = await fetch('/api/admin/save-vig-month-goal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId, monthKey, ...patch })
      })
      const data = await res.json()
      if (data.success) fetchHistoricalRates(monthsToLoad)
      else console.error('save-vig-month-goal:', data.error)
    } catch (e) { console.error(e) }
  }, [fetchHistoricalRates, monthsToLoad])

  const saveWorkingDaysRecalc = useCallback((repId: string, monthKey: string, newDays: number, md: MonthRepData) => {
    const oldDays = md.workingDays || 1
    const dailyProfit = oldDays > 0 ? md.profitGoal / oldDays : 0
    const dailySub = oldDays > 0 ? md.subtotalGoal / oldDays : 0
    saveMonthGoal(repId, monthKey, {
      workingDays: newDays,
      profitGoal: Math.round(dailyProfit * newDays),
      subtotalGoal: Math.round(dailySub * newDays)
    })
  }, [saveMonthGoal])

  const saveDailyRate = useCallback((repId: string, monthKey: string, newDailyRate: number, field: 'profit' | 'subtotal', workingDays: number) => {
    const monthlyGoal = Math.round(newDailyRate * workingDays)
    if (field === 'profit') {
      saveMonthGoal(repId, monthKey, { profitGoal: monthlyGoal })
    } else {
      saveMonthGoal(repId, monthKey, { subtotalGoal: monthlyGoal })
    }
  }, [saveMonthGoal])

  const applyEscalation = useCallback(async (repId: string, nextMonthKey: string, newRate: number) => {
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
  }, [fetchHistoricalRates, monthsToLoad])

  const fixOneInvoice = useCallback(async (inv: MismatchInvoice, repId: string, monthKey: string) => {
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
  }, [fetchHistoricalRates, monthsToLoad])

  const fixAllForMonth = useCallback(async (repId: string, monthKey: string, vigRate: number, mismatches: MismatchInvoice[]) => {
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
  }, [fetchHistoricalRates, monthsToLoad])

  const handleRepChange = useCallback((id: string, field: keyof RepConfig, value: any) =>
    setRepConfigs(p => p.map(r => r.id === id ? { ...r, [field]: value } : r)), [])

  const handleRecalculateDocuments = useCallback(async (repId?: string) => {
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
  }, [selectedMonth])

  const handleSyncAllVigToZoho = useCallback(async () => {
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
  }, [selectedMonth])

  const handleSaveAll = useCallback(async () => {
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
  }, [defaultVigRate, repConfigs, targetVigRate, baselineVigRate, tariffRate, historicalMonths, saveMonthGoal])

  const nextMonthKey = useCallback((mk: string) => {
    const [yyyy, mm] = mk.split('-').map(Number)
    const d = new Date(yyyy, mm, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const getNextMonthData = useCallback((repId: string, mk: string) => {
    const nmk  = nextMonthKey(mk)
    const nmh  = historicalMonths.find(h => h.monthKey === nmk)
    return nmh?.reps?.[repId] ?? null
  }, [nextMonthKey, historicalMonths])

  const activeConfigs = useMemo(() => showAll ? repConfigs : repConfigs.filter(r => r.isVisible), [showAll, repConfigs])
  const globalMismatches = useMemo(() => historicalMonths.reduce((s, h) =>
    s + activeConfigs.reduce((ss, r) => ss + (h.reps?.[r.id]?.mismatches?.length || 0), 0), 0), [historicalMonths, activeConfigs])

  return {
    defaultVigRate, setDefaultVigRate,
    targetVigRate, setTargetVigRate,
    baselineVigRate, setBaselineVigRate,
    tariffRate, setTariffRate,
    repConfigs, setRepConfigs,
    loading, setLoading,
    saving, setSaving,
    saveSuccess, setSaveSuccess,
    errorMsg, setErrorMsg,
    showAll, setShowAll,
    historicalMonths, setHistoricalMonths,
    holidayCount, setHolidayCount,
    historicalLoading, setHistoricalLoading,
    expandedReps, setExpandedReps,
    monthsToLoad, setMonthsToLoad,
    fixingAll, setFixingAll,
    fixingOne, setFixingOne,
    applyingEscalation, setApplyingEscalation,
    fixMessage, setFixMessage,
    recalculatingId, setRecalculatingId,
    recalculatingAll, setRecalculatingAll,
    selectedMonth, setSelectedMonth,
    recalcMessage, setRecalcMessage,
    syncingZoho, setSyncingZoho,
    syncZohoMessage, setSyncZohoMessage,
    activeDocModal, setActiveDocModal,
    fetchVigData, fetchHistoricalRates,
    saveMonthGoal, saveWorkingDaysRecalc, saveDailyRate, applyEscalation,
    fixOneInvoice, fixAllForMonth, handleRepChange, handleRecalculateDocuments,
    handleSyncAllVigToZoho, handleSaveAll, nextMonthKey, getNextMonthData,
    activeConfigs, globalMismatches
  }
}
