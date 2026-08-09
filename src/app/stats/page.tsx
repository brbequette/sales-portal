"use client"


import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useMemo } from "react"
import { usePreferences } from "@/components/PreferencesProvider"
import { usePagination, Pagination } from "@/components/Pagination"
import {
  FiBarChart2, FiTrendingUp, FiDollarSign, FiUsers, FiAward,
  FiChevronDown, FiChevronUp, FiX, FiTarget, FiCalendar
} from "react-icons/fi"
import { sessionGet, sessionSet, TTL } from "@/lib/dataCache"
import { UpdateBanner } from '@/lib/useStaleCheck'

interface RepPeriodStats {
  revenue: number
  profit: number
  dealsWon: number
  target: number
  vigRate?: number
}

interface Rep {
  repId: string
  repName: string
  email: string
  role: string
  revenue: number
  profit: number
  margin: number
  activeAccounts: number
  updateAccounts: number
  totalDeals: number
  closedWonDeals: number
  dealRevenue: number
  commissions: number
  overdueCollections: number
  daily: RepPeriodStats
  weekly: RepPeriodStats
  monthly: RepPeriodStats
  annually?: RepPeriodStats  // alias: API returns YTD totals in the monthly bucket
}

interface CompanyData {
  revenue: number
  profit: number
  margin: number
  activeAccounts: number
  updateAccounts: number
  totalDeals: number
  closedWonDeals: number
  dealRevenue: number
  commissions: number
  overdueCollections: number
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

function formatPreciseCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return value.toFixed(0)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

type SortField = "revenue" | "profit" | "totalDeals" | "commissions" | "activeAccounts" | "overdueCollections"

export default function StatsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const { preferences } = usePreferences()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [reps, setReps] = useState<Rep[]>([])
  const [companyTotals, setCompanyTotals] = useState<CompanyData | null>(null)
  const [companyAverages, setCompanyAverages] = useState<CompanyData | null>(null)
  const [historicalVigRates, setHistoricalVigRates] = useState<any[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<"daily" | "weekly" | "monthly" | "annually">("monthly")
  // Map 'annually' → 'monthly' since the API returns YTD totals in the monthly slot
  const repPeriodKey = (selectedPeriod === 'annually' ? 'monthly' : selectedPeriod) as 'daily' | 'weekly' | 'monthly'
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null)
  const [sortField, setSortField] = useState<SortField>("revenue")
  const [sortAsc, setSortAsc] = useState(false)
  const [trackerPeriod, setTrackerPeriod] = useState<"week" | "month">("month")
  const [selectedDataDate, setSelectedDataDate] = useState<string>("")
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const checkForUpdates = async (sig: string, url: string) => {
    try {
      const separator = url.includes('?') ? '&' : '?'
      const res = await fetch(`${url}${separator}checkOnly=true`)
      const data = await res.json()
      if (!data.checkOnly) return
      const remoteSig = `${data.count}|${data.latestUpdatedAt ?? ''}`
      if (remoteSig !== sig) setUpdateAvailable(true)
    } catch {}
  }

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }

    const fetchStats = async (force = false) => {
      const cacheKey = `rep-stats-${selectedDataDate}-${preferences.showHiddenReps ? '1' : '0'}`
      if (!force) {
        const cached = sessionGet<any>(cacheKey, TTL.TEN_MIN)
        if (cached) { setReps(cached.reps); setCompanyTotals(cached.totals); setCompanyAverages(cached.averages); setHistoricalVigRates(cached.vigRates); return }
      }
      // First load with no data: show full spinner. Otherwise: subtle refresh indicator
      if (reps.length === 0) setLoading(true)
      else setRefreshing(true)
      try {
        const hiddenParam = preferences.showHiddenReps ? "?includeHidden=true" : ""
        let dateParam = ""
        if (selectedPeriod === "annually") {
          const currentYear = new Date().getFullYear().toString()
          dateParam = (!selectedDataDate || selectedDataDate === currentYear) ? `period=this_year` : `period=last_year`
        } else if (selectedDataDate) {
          dateParam = selectedDataDate.length === 7 ? `month=${selectedDataDate}` : `date=${selectedDataDate}`
        }
        const prefix = hiddenParam ? "&" : "?"
        const urlParams = dateParam ? `${prefix}${dateParam}` : ""
        const res = await fetch(`/api/get-rep-stats${hiddenParam}${urlParams}`)
        const data = await res.json()
        if (data.success) {
          // Normalize: get-rep-stats returns flat revenue/profit/commissions fields.
          // The page expects sub-period objects (rep.monthly, rep.weekly, etc.).
          // Synthesize them here so all downstream rep[repPeriodKey] reads work.
          const normalizedReps = (data.reps || []).map((r: any) => ({
            ...r,
            // The API filters by the requested period, so flat values ARE the period values.
            daily:    { revenue: r.revenue || 0, profit: r.profit || 0, dealsWon: r.invoiceCount || 0, target: 0, vigRate: undefined },
            weekly:   { revenue: r.revenue || 0, profit: r.profit || 0, dealsWon: r.invoiceCount || 0, target: 0, vigRate: undefined },
            monthly:  { revenue: r.revenue || 0, profit: r.profit || 0, dealsWon: r.invoiceCount || 0, target: 0, vigRate: undefined },
            annually: { revenue: r.revenue || 0, profit: r.profit || 0, dealsWon: r.invoiceCount || 0, target: 0, vigRate: undefined },
          }))
          setReps(normalizedReps)
          const totals = data.totals || {}
          setCompanyTotals(totals)
          setCompanyAverages(data.companyAverages || totals)
          setHistoricalVigRates(data.historicalVigRates || [])
          sessionSet(cacheKey, { reps: normalizedReps, totals, averages: data.companyAverages || totals, vigRates: data.historicalVigRates || [] })
          const sig = `${normalizedReps.length}|${normalizedReps[0]?.repId ?? ''}`
          setUpdateAvailable(false)
          setTimeout(() => checkForUpdates(sig, '/api/get-rep-stats'), 2000)
        } else {
          setApiError(data.error || "Failed to load stats")
        }
      } catch (err: any) {
        setApiError(err.message || "Network error")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }
    fetchStats()
  }, [isInitialized, currentUser, router, selectedDataDate, selectedPeriod, refreshTrigger])

  const pastWeeks = useMemo(() => {
    const weeks = []
    const now = new Date()
    for (let i = 1; i < 12; i++) {
      const d = new Date(now.getTime())
      d.setDate(d.getDate() - (i * 7))
      const monday = new Date(d)
      const day = monday.getDay()
      const diff = monday.getDate() - day + (day === 0 ? -6 : 1)
      monday.setDate(diff)
      const label = i === 1 ? "Last Week" : `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      const val = monday.toISOString().split('T')[0]
      weeks.push({ value: val, label })
    }
    return weeks
  }, [])

  const pastDays = useMemo(() => {
    const days = []
    const now = new Date()
    for (let i = 1; i < 14; i++) {
      const d = new Date(now.getTime())
      d.setDate(d.getDate() - i)
      const label = i === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      const val = d.toISOString().split('T')[0]
      days.push({ value: val, label })
    }
    return days
  }, [])

  const sortedReps = useMemo(() => {
    return [...reps].sort((a, b) => {
      const ra = a as any
      const rb = b as any
      let av = 0
      let bv = 0
      if (sortField === "revenue" || sortField === "profit") {
        av = (ra[repPeriodKey] || {})[sortField] ?? ra[sortField] ?? 0
        bv = (rb[repPeriodKey] || {})[sortField] ?? rb[sortField] ?? 0
      } else if (sortField === "totalDeals") {
        av = (ra[repPeriodKey] || {}).dealsWon ?? ra.invoiceCount ?? 0
        bv = (rb[repPeriodKey] || {}).dealsWon ?? rb.invoiceCount ?? 0
      } else {
        av = ra[sortField] ?? 0
        bv = rb[sortField] ?? 0
      }
      return sortAsc ? av - bv : bv - av
    })
  }, [reps, sortField, sortAsc, selectedPeriod])

  const pagination = usePagination(sortedReps)

  const maxValues = useMemo(() => {
    if (reps.length === 0) return {} as Record<string, number>
    return {
      revenue: Math.max(...reps.map((r) => r.revenue), 1),
      profit: Math.max(...reps.map((r) => r.profit), 1),
      totalDeals: Math.max(...reps.map((r) => r.totalDeals), 1),
      closedWonDeals: Math.max(...reps.map((r) => r.closedWonDeals), 1),
      dealRevenue: Math.max(...reps.map((r) => r.dealRevenue), 1),
      commissions: Math.max(...reps.map((r) => r.commissions), 1),
      activeAccounts: Math.max(...reps.map((r) => r.activeAccounts), 1),
      updateAccounts: Math.max(...reps.map((r) => r.updateAccounts), 1),
      overdueCollections: Math.max(...reps.map((r) => r.overdueCollections), 1),
    }
  }, [reps])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <FiChevronDown size={10} className="text-neutral-600" />
    return sortAsc ? (
      <FiChevronUp size={10} className="text-sky-400" />
    ) : (
      <FiChevronDown size={10} className="text-sky-400" />
    )
  }



  const metricConfigs = [
    { key: "revenue", label: "Revenue", format: formatCurrency, barColor: "bg-emerald-500", avgColor: "border-emerald-300" },
    { key: "profit", label: "Profit", format: formatCurrency, barColor: "bg-emerald-600", avgColor: "border-emerald-300" },
    { key: "commissions", label: "Commissions", format: formatCurrency, barColor: "bg-sky-500", avgColor: "border-sky-300" },
    { key: "dealRevenue", label: "Deal Revenue", format: formatCurrency, barColor: "bg-blue-500", avgColor: "border-blue-300" },
    { key: "totalDeals", label: "Total Deals", format: formatNumber, barColor: "bg-amber-500", avgColor: "border-amber-300" },
    { key: "closedWonDeals", label: "Closed Won", format: formatNumber, barColor: "bg-amber-600", avgColor: "border-amber-300" },
    { key: "activeAccounts", label: "Active Accounts", format: formatNumber, barColor: "bg-purple-500", avgColor: "border-purple-300" },
    { key: "updateAccounts", label: "Update Accounts", format: formatNumber, barColor: "bg-neutral-500", avgColor: "border-neutral-300" },
    { key: "overdueCollections", label: "Overdue Collections", format: formatCurrency, barColor: "bg-red-500", avgColor: "border-red-300" },
  ]

  const periodTotals = useMemo(() => {
    let revenue = 0
    let profit = 0
    let dealsWon = 0
    let target = 0
    reps.forEach(r => {
      const stats = r[repPeriodKey] || { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
      revenue += stats.revenue || 0
      profit += stats.profit || 0
      dealsWon += stats.dealsWon || 0
      target += stats.target || 0
    })
    return { revenue, profit, dealsWon, target }
  }, [reps, selectedPeriod])

  if (!isInitialized || (loading && reps.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] glass-panel text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Rep Stats...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      <UpdateBanner show={updateAvailable} onUpdate={() => { setUpdateAvailable(false); setRefreshTrigger(n => n + 1) }} accentColor="sky" label="Stats updated" />

      {/* ─── Header ─────────────────────────────────── */}
      {refreshing && <div className="h-0.5 bg-sky-500/60 animate-pulse w-full absolute top-0 left-0 rounded" />}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center">
            <FiBarChart2 className="text-sky-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Rep Stats Dashboard</h1>
            <p className="page-subtitle">Performance metrics, leaderboard & vig rate history</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Picker */}
          <select
            className="td-select"
            value={selectedDataDate}
            onChange={e => setSelectedDataDate(e.target.value)}
          >
            {selectedPeriod === "monthly" && (
              <>
                <option value="">Current Month</option>
                {historicalVigRates.map(h => (
                  <option key={h.monthKey} value={h.monthKey}>{h.monthName}</option>
                ))}
              </>
            )}
            {selectedPeriod === "weekly" && (
              <>
                <option value="">Current Week</option>
                {pastWeeks.map(w => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </>
            )}
            {selectedPeriod === "daily" && (
              <>
                <option value="">Today</option>
                {pastDays.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </>
            )}
            {selectedPeriod === "annually" && (
              <>
                <option value="">This Year</option>
                <option value={`${new Date().getFullYear() - 1}`}>{new Date().getFullYear() - 1}</option>
                <option value={`${new Date().getFullYear() - 2}`}>{new Date().getFullYear() - 2}</option>
                <option value={`${new Date().getFullYear() - 3}`}>{new Date().getFullYear() - 3}</option>
              </>
            )}
          </select>

          {/* Period Toggle */}
          <div className="glass-panel rounded-xl p-0.5 flex border border-white/10 text-xs font-bold">
            {(["daily", "weekly", "monthly", "annually"] as const).map(p => (
              <button
                key={p}
                onClick={() => { setSelectedPeriod(p); setSelectedDataDate(""); setSelectedRep(null) }}
                className={`px-3 py-1.5 rounded-lg uppercase tracking-wider transition-all ${
                  selectedPeriod === p
                    ? "bg-sky-600 text-white shadow-md shadow-sky-500/20"
                    : "text-neutral-500 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-4">

        {apiError && (
          <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
            <span><strong>Error:</strong> {apiError}</span>
          </div>
        )}

        {/* Company Summary Cards */}
        {(() => {
          const periodLabel = selectedPeriod === 'annually' ? 'Annual' : selectedPeriod === 'monthly' ? 'Monthly' : selectedPeriod === 'weekly' ? 'Weekly' : 'Daily';
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: `${periodLabel} Revenue`, value: formatPreciseCurrency(periodTotals.revenue), icon: <FiDollarSign />, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-950/20" },
                { label: `${periodLabel} Profit`, value: formatPreciseCurrency(periodTotals.profit), icon: <FiTrendingUp />, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-950/20" },
                { label: `${periodLabel} Deals Won`, value: formatNumber(periodTotals.dealsWon), icon: <FiAward />, color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-950/20" },
                {
                  label: `${periodLabel} Target Progress`,
                  value: periodTotals.target > 0 ? `${((periodTotals.profit / periodTotals.target) * 100).toFixed(1)}%` : "N/A",
                  icon: <FiTarget />,
                  color: "text-sky-400",
                  border: "border-sky-500/20",
                  bg: "bg-sky-950/20",
                  subtext: `Target: ${formatCurrency(periodTotals.target)}`
                },
              ].map(card => (
                <div key={card.label} className={`${card.bg} border ${card.border} rounded-2xl p-4 hover:scale-[1.01] transition-all duration-200 flex flex-col justify-between`}>
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">{card.label}</span>
                      <span className={card.color}>{card.icon}</span>
                    </div>
                    <p className={`text-base sm:text-lg font-bold ${card.color}`}>{card.value}</p>
                  </div>
                  {(card as any).subtext && <p className="text-[10px] text-neutral-500 mt-1 font-mono">{(card as any).subtext}</p>}
                </div>
              ))}
            </div>
          )
        })()}

        {/* Leaderboard Table */}
        <div className="modern-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
            <FiAward size={15} className="text-sky-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Leaderboard ({selectedPeriod})</h2>
            <span className="ml-auto text-[10px] text-neutral-500">{reps.length} reps</span>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="td-table">
              <thead>
                <tr>
                  <th className="td-th">#</th>
                  <th className="td-th">Representative</th>
                  <th className="td-th text-right cursor-pointer hover:text-white select-none" onClick={() => handleSort("revenue")}>
                    <span className="inline-flex items-center gap-1">Revenue <SortIcon field="revenue" /></span>
                  </th>
                  <th className="td-th text-right cursor-pointer hover:text-white select-none" onClick={() => handleSort("profit")}>
                    <span className="inline-flex items-center gap-1">Profit <SortIcon field="profit" /></span>
                  </th>
                  <th className="td-th text-right cursor-pointer hover:text-white select-none" onClick={() => handleSort("totalDeals")}>
                    <span className="inline-flex items-center gap-1">Deals Won <SortIcon field="totalDeals" /></span>
                  </th>
                  <th className="td-th text-right">Target</th>
                  <th className="td-th text-right">Progress</th>
                  <th className="td-th text-center">Vig Rate</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((rep, idx) => {
                  const rank = pagination.pageSize === "All" ? idx + 1 : (pagination.currentPage - 1) * (pagination.pageSize as number) + idx + 1
                  const isSelected = selectedRep?.repId === rep.repId
                  const periodStats = rep[repPeriodKey] || { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
                  const progressPct = periodStats.target > 0 ? (periodStats.profit / periodStats.target) * 100 : 0
                  const metGoal = periodStats.profit >= periodStats.target
                  const vigRate = periodStats.vigRate ?? (metGoal ? 1.3 : 1.5)

                  return (
                    <tr
                      key={rep.repId}
                      className={`cursor-pointer transition-colors ${isSelected ? "bg-sky-950/20 border-l-2 border-l-sky-500" : "hover:bg-white/[0.03]"}`}
                      onClick={() => setSelectedRep(isSelected ? null : rep)}
                    >
                      <td className="td-td font-bold text-neutral-500">
                        {rank <= 3 ? (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${
                            rank === 1 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : rank === 2 ? "bg-neutral-400/20 text-neutral-300 border border-neutral-400/30"
                            : "bg-amber-900/20 text-amber-600 border border-amber-900/30"
                          }`}>{rank}</span>
                        ) : (
                          <span className="text-neutral-600 pl-1.5">{rank}</span>
                        )}
                      </td>
                      <td className="td-td">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-300 shrink-0">
                            {rep.repName?.charAt(0) || "?"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{rep.repName}</p>
                            <p className="text-[10px] text-neutral-500 truncate">{rep.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="td-td text-right font-bold text-emerald-400">{formatPreciseCurrency(periodStats.revenue)}</td>
                      <td className="td-td text-right font-medium text-emerald-500">{formatPreciseCurrency(periodStats.profit)}</td>
                      <td className="td-td text-right font-medium text-amber-400">{periodStats.dealsWon}</td>
                      <td className="td-td text-right font-medium text-neutral-400">{formatCurrency(periodStats.target)}</td>
                      <td className="td-td text-right">
                        <span className={`font-bold font-mono ${progressPct >= 100 ? "text-emerald-400" : "text-sky-400"}`}>
                          {progressPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="td-td text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                          vigRate <= 1.3
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                            : "bg-red-950/40 text-red-400 border-red-500/30"
                        }`}>
                          {vigRate.toFixed(1)} vig
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {pagination.pageSize !== "All" && sortedReps.length > (pagination.pageSize as number) && (
              <div className="border-t border-white/8">
                <Pagination
                  currentPage={pagination.currentPage}
                  pageSize={pagination.pageSize}
                  totalItems={sortedReps.length}
                  onPageChange={pagination.setCurrentPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            )}
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-white/[0.06]">
            {pagination.paginatedItems.map((rep, idx) => {
              const rank = pagination.pageSize === "All" ? idx + 1 : (pagination.currentPage - 1) * (pagination.pageSize as number) + idx + 1
              const isSelected = selectedRep?.repId === rep.repId
              const periodStats = rep[repPeriodKey] || { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
              const progressPct = periodStats.target > 0 ? (periodStats.profit / periodStats.target) * 100 : 0
              const metGoal = (rep.monthly?.profit ?? 0) >= (rep.monthly?.target ?? 1)
              const vigRate = metGoal ? 1.3 : 1.5

              return (
                <div
                  key={rep.repId}
                  className={`p-4 cursor-pointer transition-colors ${isSelected ? "bg-sky-950/20" : "hover:bg-white/[0.03]"}`}
                  onClick={() => setSelectedRep(isSelected ? null : rep)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {rank <= 3 ? (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black shrink-0 ${
                          rank === 1 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : rank === 2 ? "bg-neutral-400/20 text-neutral-300 border border-neutral-400/30"
                          : "bg-amber-900/20 text-amber-600 border border-amber-900/30"
                        }`}>{rank}</span>
                      ) : (
                        <span className="text-neutral-600 text-xs font-bold w-6 text-center shrink-0">{rank}</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{rep.repName}</p>
                        <p className="text-[10px] text-neutral-500 truncate">{rep.email}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                      vigRate === 1.3
                        ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                        : "bg-red-950/40 text-red-400 border-red-500/30"
                    }`}>
                      {vigRate.toFixed(1)} vig
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Profit</p>
                      <p className="text-xs font-bold text-emerald-400">{formatCurrency(periodStats.profit)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Progress</p>
                      <p className={`text-xs font-bold ${progressPct >= 100 ? "text-emerald-400" : "text-sky-400"}`}>{progressPct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Target</p>
                      <p className="text-xs font-bold text-neutral-400">{formatCurrency(periodStats.target)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
            {pagination.pageSize !== "All" && sortedReps.length > (pagination.pageSize as number) && (
              <div className="border-t border-white/8">
                <Pagination
                  currentPage={pagination.currentPage}
                  pageSize={pagination.pageSize}
                  totalItems={sortedReps.length}
                  onPageChange={pagination.setCurrentPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            )}
          </div>
        </div>

        {/* Selected Rep Detail Panel */}
        {selectedRep && companyAverages && (
          <div className="modern-card overflow-hidden border-sky-500/20 animate-fade-in">
            <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-sky-950/40 border border-sky-500/30 flex items-center justify-center text-sm font-bold text-sky-400">
                  {selectedRep.repName?.charAt(0) || "?"}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedRep.repName}</h3>
                  <p className="text-[10px] text-neutral-500">{selectedRep.email} · Margin: {formatPercent(selectedRep.margin / 100)}</p>
                </div>
              </div>
              <button onClick={() => setSelectedRep(null)} className="text-neutral-500 hover:text-white p-1.5 rounded-full bg-neutral-800 transition-colors">
                <FiX size={14} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-sky-950/60 border border-sky-500/20">
                  <FiTarget className="text-sky-400" size={15} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">{selectedPeriod} Sales Goal Tracker</h4>
                  <p className="text-[9px] text-neutral-500">Progress against computed workday targets</p>
                </div>
              </div>

              {(() => {
                const periodStats = selectedRep[repPeriodKey] || { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
                const progressPct = periodStats.target > 0 ? (periodStats.profit / periodStats.target) * 100 : 0
                const diff = periodStats.target - periodStats.profit
                let statusMsg = ""
                if (periodStats.target === 0) {
                  statusMsg = "No target configured for this period."
                } else if (periodStats.profit >= periodStats.target) {
                  statusMsg = `🏆 Goal Hit! ${formatPreciseCurrency(periodStats.profit - periodStats.target)} over target.`
                } else {
                  statusMsg = `Needs ${formatPreciseCurrency(diff)} more to hit target.`
                }

                return (
                  <div className="p-3.5 rounded-xl border border-sky-500/10 bg-black/20 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Profit Goal</span>
                      <div className="text-right">
                        <span className="text-xs font-black text-white">{formatPreciseCurrency(periodStats.profit)}</span>
                        <span className="text-[10px] text-neutral-500 font-medium"> / {formatPreciseCurrency(periodStats.target)}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden border border-white/8">
                      <div className="h-full bg-sky-500 shadow-sm shadow-sky-500/30 rounded-full transition-all duration-500" style={{ width: `${Math.min(progressPct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-neutral-500">{statusMsg}</span>
                      <span className={`font-bold ${progressPct >= 100 ? "text-emerald-400" : "text-sky-400"}`}>{progressPct.toFixed(1)}%</span>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Historical Vig Rates Table */}
        {historicalVigRates.length > 0 && (
          <div className="modern-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
              <FiCalendar size={15} className="text-sky-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Historical Vig Rates</h2>
              <span className="ml-auto text-[10px] text-neutral-500">Last 6 Months</span>
            </div>
            <div className="overflow-x-auto">
              <table className="td-table">
                <thead>
                  <tr>
                    <th className="td-th">Representative</th>
                    {historicalVigRates.map(h => (
                      <th key={h.monthKey} className="td-th text-center">{h.monthName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reps.map(rep => (
                    <tr key={rep.repId} className="hover:bg-white/[0.03] transition-colors">
                      <td className="td-td font-semibold text-white">{rep.repName}</td>
                      {historicalVigRates.map(h => {
                        const repData = h.reps[rep.repId]
                        const vig = repData ? repData.vigRate : 1.5
                        return (
                          <td key={h.monthKey} className="td-td text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                                vig <= 1.3
                                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                                  : "bg-red-950/40 text-red-400 border-red-500/30"
                              }`}
                              title={repData ? `Sales: ${formatPreciseCurrency(repData.sales)} / Target: ${formatPreciseCurrency(repData.target)}` : ""}
                            >
                              {vig.toFixed(1)} vig
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
