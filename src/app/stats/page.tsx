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
  const [apiError, setApiError] = useState<string | null>(null)
  const [reps, setReps] = useState<Rep[]>([])
  const [companyTotals, setCompanyTotals] = useState<CompanyData | null>(null)
  const [companyAverages, setCompanyAverages] = useState<CompanyData | null>(null)
  const [historicalVigRates, setHistoricalVigRates] = useState<any[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<"daily" | "weekly" | "monthly">("monthly")
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null)
  const [sortField, setSortField] = useState<SortField>("revenue")
  const [sortAsc, setSortAsc] = useState(false)
  const [trackerPeriod, setTrackerPeriod] = useState<"week" | "month">("month")
  const [selectedDataDate, setSelectedDataDate] = useState<string>("")

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }

    const fetchStats = async () => {
      try {
        setLoading(true)
        const hiddenParam = preferences.showHiddenReps ? "?includeHidden=true" : ""
        const dateParam = selectedDataDate ? (selectedDataDate.length === 7 ? `month=${selectedDataDate}` : `date=${selectedDataDate}`) : ""
        const prefix = hiddenParam ? "&" : "?"
        const urlParams = dateParam ? `${prefix}${dateParam}` : ""
        const res = await fetch(`/api/get-rep-stats${hiddenParam}${urlParams}`)
        const data = await res.json()
        if (data.success) {
          setReps(data.reps || [])
          setCompanyTotals(data.companyTotals || null)
          setCompanyAverages(data.companyAverages || null)
          setHistoricalVigRates(data.historicalVigRates || [])
        } else {
          setApiError(data.error || "Failed to load stats")
        }
      } catch (err: any) {
        setApiError(err.message || "Network error")
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [isInitialized, currentUser, router, selectedDataDate])

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
      let av = 0
      let bv = 0
      if (sortField === "revenue" || sortField === "profit") {
        av = a[selectedPeriod][sortField] ?? 0
        bv = b[selectedPeriod][sortField] ?? 0
      } else if (sortField === "totalDeals") {
        av = a[selectedPeriod].dealsWon ?? 0
        bv = b[selectedPeriod].dealsWon ?? 0
      } else {
        av = (a as any)[sortField] ?? 0
        bv = (b as any)[sortField] ?? 0
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
      const stats = r[selectedPeriod] || { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
      revenue += stats.revenue || 0
      profit += stats.profit || 0
      dealsWon += stats.dealsWon || 0
      target += stats.target || 0
    })
    return { revenue, profit, dealsWon, target }
  }, [reps, selectedPeriod])

  if (!isInitialized || loading) {
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
    <div className="flex flex-col text-neutral-100 font-sans overflow-y-auto" style={{ height: "100%" }}>
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-5 overflow-y-auto safe-bottom">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-500/30">
              <FiBarChart2 size={20} className="text-sky-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Rep Stats Dashboard</h1>
              <p className="text-xs text-neutral-500">Performance metrics &amp; leaderboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select 
               className="bg-black/20 border border-neutral-850 text-neutral-400 text-xs font-bold rounded-lg p-2 uppercase tracking-wider focus:outline-none"
               value={selectedDataDate}
               onChange={(e) => setSelectedDataDate(e.target.value)}
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
            </select>
            {/* Timeframe Filter Selector */}
            <div className="flex bg-black/20 border border-neutral-850 p-0.5 rounded-xl gap-0.5 shrink-0 self-start sm:self-auto w-full sm:w-auto sm:min-w-[240px]">
              {(["daily", "weekly", "monthly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setSelectedPeriod(p)
                    setSelectedDataDate("")
                    setSelectedRep(null) // Reset detail panel on timeframe switch
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all ${
                    selectedPeriod === p
                      ? "bg-sky-600 text-white shadow-md shadow-sky-650/20"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {apiError && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
            <span><strong>Error:</strong> {apiError}</span>
          </div>
        )}

        {/* Company Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: `${selectedPeriod} Revenue`, value: formatPreciseCurrency(periodTotals.revenue), icon: <FiDollarSign />, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-950/20" },
            { label: `${selectedPeriod} Profit`, value: formatPreciseCurrency(periodTotals.profit), icon: <FiTrendingUp />, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-950/20" },
            { label: `${selectedPeriod} Deals Won`, value: formatNumber(periodTotals.dealsWon), icon: <FiAward />, color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-950/20" },
            { 
              label: `${selectedPeriod} Target Progress`, 
              value: periodTotals.target > 0 ? `${((periodTotals.profit / periodTotals.target) * 100).toFixed(1)}%` : "N/A", 
              icon: <FiTarget />, 
              color: "text-sky-400", 
              border: "border-sky-500/20", 
              bg: "bg-sky-950/20",
              subtext: `Target: ${formatCurrency(periodTotals.target)}`
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`${card.bg} border ${card.border} rounded-2xl p-4 hover:scale-[1.02] transition-all duration-200 backdrop-blur-sm flex flex-col justify-between`}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">{card.label}</span>
                  <span className={`${card.color}`}>{card.icon}</span>
                </div>
                <p className={`text-base sm:text-lg font-bold ${card.color}`}>{card.value}</p>
              </div>
              {card.subtext && <p className="text-[10px] text-neutral-500 mt-1 font-mono">{card.subtext}</p>}
            </div>
          ))}
        </div>

        {/* Leaderboard Table */}
        <div className="glass-panel border border-white/10 rounded-2xl shadow-lg overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center gap-2">
            <FiAward size={16} className="text-sky-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Leaderboard ({selectedPeriod})</h2>
            <span className="ml-auto text-[10px] text-neutral-500 font-medium">{reps.length} reps</span>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-neutral-500">
                  <th className="text-left px-4 py-2.5 font-semibold">#</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Representative</th>
                  <th
                    className="text-right px-4 py-2.5 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("revenue")}
                  >
                    <span className="inline-flex items-center gap-1">Revenue <SortIcon field="revenue" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("profit")}
                  >
                    <span className="inline-flex items-center gap-1">Profit <SortIcon field="profit" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("totalDeals")}
                  >
                    <span className="inline-flex items-center gap-1">Deals Won <SortIcon field="totalDeals" /></span>
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold text-neutral-500">Target</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-neutral-500">Progress</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-neutral-500">Vig Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {pagination.paginatedItems.map((rep, idx) => {
                  const rank = pagination.pageSize === "All" ? idx + 1 : (pagination.currentPage - 1) * (pagination.pageSize as number) + idx + 1
                  const isSelected = selectedRep?.repId === rep.repId
                  const periodStats = rep[selectedPeriod] || { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
                  const progressPct = periodStats.target > 0 ? (periodStats.profit / periodStats.target) * 100 : 0
                  
                  // Monthly vig rate computation
                  const metGoal = periodStats.profit >= periodStats.target
                  const vigRate = periodStats.vigRate ?? (metGoal ? 1.3 : 1.5)

                  return (
                    <tr
                      key={rep.repId}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-sky-950/20 border-l-2 border-l-sky-500"
                          : "hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50"
                      }`}
                      onClick={() => setSelectedRep(isSelected ? null : rep)}
                    >
                      <td className="px-4 py-3 font-bold text-neutral-500">
                        {rank <= 3 ? (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${
                            rank === 1
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : rank === 2
                              ? "bg-neutral-400/20 text-neutral-300 border border-neutral-400/30"
                              : "bg-amber-900/20 text-amber-600 border border-amber-900/30"
                          }`}>
                            {rank}
                          </span>
                        ) : (
                          <span className="text-neutral-600 pl-1.5">{rank}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatPreciseCurrency(periodStats.revenue)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-500">{formatPreciseCurrency(periodStats.profit)}</td>
                      <td className="px-4 py-3 text-right font-medium text-amber-400">{periodStats.dealsWon}</td>
                      <td className="px-4 py-3 text-right font-medium text-neutral-400">{formatCurrency(periodStats.target)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold font-mono ${progressPct >= 100 ? "text-emerald-400" : "text-sky-400"}`}>
                          {progressPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            vigRate <= 1.3
                              ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                              : "bg-red-950/40 text-red-400 border-red-500/30"
                          }`}
                        >
                          {vigRate.toFixed(1)} vig
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {pagination.pageSize !== "All" && sortedReps.length > (pagination.pageSize as number) && (
              <div className="border-t border-white/10 glass-panel">
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
          <div className="md:hidden divide-y divide-neutral-800">
            {pagination.paginatedItems.map((rep, idx) => {
              const rank = pagination.pageSize === "All" ? idx + 1 : (pagination.currentPage - 1) * (pagination.pageSize as number) + idx + 1
              const isSelected = selectedRep?.repId === rep.repId
              const periodStats = rep[selectedPeriod] || { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
              const progressPct = periodStats.target > 0 ? (periodStats.profit / periodStats.target) * 100 : 0
              const metGoal = rep.monthly.profit >= rep.monthly.target
              const vigRate = metGoal ? 1.3 : 1.5

              return (
                <div
                  key={rep.repId}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected ? "bg-sky-950/20" : "hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50"
                  }`}
                  onClick={() => setSelectedRep(isSelected ? null : rep)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {rank <= 3 ? (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black shrink-0 ${
                          rank === 1
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : rank === 2
                            ? "bg-neutral-400/20 text-neutral-300 border border-neutral-400/30"
                            : "bg-amber-900/20 text-amber-600 border border-amber-900/30"
                        }`}>
                          {rank}
                        </span>
                      ) : (
                        <span className="text-neutral-600 text-xs font-bold w-6 text-center shrink-0">{rank}</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{rep.repName}</p>
                        <p className="text-[10px] text-neutral-500 truncate">{rep.email}</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                        vigRate === 1.3
                          ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                          : "bg-red-950/40 text-red-400 border-red-500/30"
                      }`}
                    >
                      {vigRate.toFixed(1)} vig
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Profit</p>
                      <p className="text-xs font-bold text-emerald-405">{formatCurrency(periodStats.profit)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Progress</p>
                      <p className={`text-xs font-bold ${progressPct >= 100 ? "text-emerald-400" : "text-sky-400"}`}>{progressPct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Target</p>
                      <p className="text-xs font-bold text-neutral-450">{formatCurrency(periodStats.target)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
            {pagination.pageSize !== "All" && sortedReps.length > (pagination.pageSize as number) && (
              <div className="border-t border-white/10 glass-panel">
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
          <div className="glass-panel border border-sky-500/20 rounded-2xl shadow-lg overflow-hidden animate-in slide-in-from-bottom-2">
            <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-sky-950/40 border border-sky-500/30 flex items-center justify-center text-sm font-bold text-sky-400">
                  {selectedRep.repName?.charAt(0) || "?"}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedRep.repName}</h3>
                  <p className="text-[10px] text-neutral-500">{selectedRep.email} - Margin: {formatPercent(selectedRep.margin / 100)}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRep(null)}
                className="text-neutral-500 hover:text-white p-1.5 rounded-full bg-neutral-800 transition-colors"
              >
                <FiX size={14} />
              </button>
            </div>

            {/* Target Tracker Section */}
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-sky-950/60 border border-sky-500/20">
                  <FiTarget className="text-sky-400" size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">{selectedPeriod} Sales Goal Tracker</h4>
                  <p className="text-[9px] text-neutral-500">Progress against computed workday targets</p>
                </div>
              </div>

              {(() => {
                const periodStats = selectedRep[selectedPeriod] || { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
                const progressPct = periodStats.target > 0 ? (periodStats.profit / periodStats.target) * 100 : 0
                const diff = periodStats.target - periodStats.profit
                let statusMsg = ""
                if (periodStats.target === 0) {
                  statusMsg = "No target configured for this period."
                } else if (periodStats.profit >= periodStats.target) {
                  statusMsg = `🏢† Goal Hit! ${formatPreciseCurrency(periodStats.profit - periodStats.target)} over target.`
                } else {
                  statusMsg = `Needs ${formatPreciseCurrency(diff)} more to hit the period profit target.`
                }

                return (
                  <div className="p-3.5 rounded-xl border border-sky-500/10 glass-panel/60 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider">Profit Goal</span>
                      <div className="text-right">
                        <span className="text-xs font-black text-white">
                          {formatPreciseCurrency(periodStats.profit)}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-medium">
                          {" "}/ {formatPreciseCurrency(periodStats.target)}
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-2 w-full glass-panel rounded-full overflow-hidden border border-white/10">
                      <div
                        className={`h-full bg-sky-500 shadow-sm shadow-sky-500/30 rounded-full transition-all duration-500 ease-out`}
                        style={{ width: `${Math.min(progressPct, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-neutral-500">{statusMsg}</span>
                      <span className={`font-bold ${progressPct >= 100 ? "text-emerald-400" : "text-sky-400"}`}>
                        {progressPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Historical Vig Rates Table */}
        {historicalVigRates.length > 0 && (
          <div className="glass-panel border border-white/10 rounded-2xl shadow-lg overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center gap-2">
              <FiCalendar size={16} className="text-sky-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Historical Vig Rates</h2>
              <span className="ml-auto text-[10px] text-neutral-500 font-medium">Last 6 Months</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-500">
                    <th className="text-left px-4 py-2.5 font-semibold">Representative</th>
                    {historicalVigRates.map((h) => (
                      <th key={h.monthKey} className="text-center px-4 py-2.5 font-semibold">
                        {h.monthName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {reps.map((rep) => (
                    <tr key={rep.repId} className="hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/30">
                      <td className="px-4 py-3 font-semibold text-white">{rep.repName}</td>
                      {historicalVigRates.map((h) => {
                        const repData = h.reps[rep.repId]
                        const vig = repData ? repData.vigRate : 1.5
                        return (
                          <td key={h.monthKey} className="px-4 py-3 text-center">
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

      </main>
    </div>
  )
}

