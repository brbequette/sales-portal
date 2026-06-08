"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useMemo } from "react"
import { usePagination, Pagination } from "@/components/Pagination"
import {
  FiBarChart2, FiTrendingUp, FiDollarSign, FiUsers, FiAward,
  FiChevronDown, FiChevronUp, FiX
} from "react-icons/fi"

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
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [reps, setReps] = useState<Rep[]>([])
  const [companyTotals, setCompanyTotals] = useState<CompanyData | null>(null)
  const [companyAverages, setCompanyAverages] = useState<CompanyData | null>(null)
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null)
  const [sortField, setSortField] = useState<SortField>("revenue")
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }

    const fetchStats = async () => {
      try {
        const res = await fetch("/api/get-rep-stats")
        const data = await res.json()
        if (data.success) {
          setReps(data.reps || [])
          setCompanyTotals(data.companyTotals || null)
          setCompanyAverages(data.companyAverages || null)
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
  }, [isInitialized, currentUser, router])

  const sortedReps = useMemo(() => {
    return [...reps].sort((a, b) => {
      const av = a[sortField] ?? 0
      const bv = b[sortField] ?? 0
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [reps, sortField, sortAsc])

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

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Rep Stats...</p>
        </div>
      </div>
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

  return (
    <div className="flex flex-col text-neutral-100 font-sans overflow-y-auto" style={{ height: "100%" }}>
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-5 overflow-y-auto safe-bottom">

        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-500/30">
            <FiBarChart2 size={20} className="text-sky-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Rep Stats Dashboard</h1>
            <p className="text-xs text-neutral-500">Performance metrics &amp; leaderboard</p>
          </div>
        </div>

        {apiError && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
            <span><strong>Error:</strong> {apiError}</span>
          </div>
        )}

        {/* Company Summary Cards */}
        {companyTotals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Revenue", value: formatCurrency(companyTotals.revenue), icon: <FiDollarSign />, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-950/20" },
              { label: "Total Profit", value: formatCurrency(companyTotals.profit), icon: <FiTrendingUp />, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-950/20" },
              { label: "Total Deals", value: formatNumber(companyTotals.totalDeals), icon: <FiAward />, color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-950/20" },
              { label: "Total Commissions", value: formatCurrency(companyTotals.commissions), icon: <FiDollarSign />, color: "text-sky-400", border: "border-sky-500/20", bg: "bg-sky-950/20" },
            ].map((card) => (
              <div
                key={card.label}
                className={`${card.bg} border ${card.border} rounded-2xl p-4 hover:scale-[1.02] transition-all duration-200 backdrop-blur-sm`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">{card.label}</span>
                  <span className={`${card.color}`}>{card.icon}</span>
                </div>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-neutral-800 flex items-center gap-2">
            <FiAward size={16} className="text-sky-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Leaderboard</h2>
            <span className="ml-auto text-[10px] text-neutral-500 font-medium">{reps.length} reps</span>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500">
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
                    <span className="inline-flex items-center gap-1">Deals <SortIcon field="totalDeals" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("commissions")}
                  >
                    <span className="inline-flex items-center gap-1">Commissions <SortIcon field="commissions" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("activeAccounts")}
                  >
                    <span className="inline-flex items-center gap-1">Accounts <SortIcon field="activeAccounts" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("overdueCollections")}
                  >
                    <span className="inline-flex items-center gap-1">Overdue <SortIcon field="overdueCollections" /></span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {pagination.paginatedItems.map((rep, idx) => {
                  const rank = pagination.pageSize === "All" ? idx + 1 : (pagination.currentPage - 1) * (pagination.pageSize as number) + idx + 1
                  const isSelected = selectedRep?.repId === rep.repId
                  return (
                    <tr
                      key={rep.repId}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-sky-950/20 border-l-2 border-l-sky-500"
                          : "hover:bg-neutral-800/50"
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
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatCurrency(rep.revenue)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-500">{formatCurrency(rep.profit)}</td>
                      <td className="px-4 py-3 text-right font-medium text-amber-400">{rep.totalDeals}</td>
                      <td className="px-4 py-3 text-right font-medium text-sky-400">{formatCurrency(rep.commissions)}</td>
                      <td className="px-4 py-3 text-right font-medium text-neutral-300">{rep.activeAccounts}</td>
                      <td className="px-4 py-3 text-right font-medium text-red-400">{formatCurrency(rep.overdueCollections)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {pagination.pageSize !== "All" && sortedReps.length > (pagination.pageSize as number) && (
              <div className="border-t border-neutral-800 bg-neutral-900">
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
              return (
                <div
                  key={rep.repId}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected ? "bg-sky-950/20" : "hover:bg-neutral-800/50"
                  }`}
                  onClick={() => setSelectedRep(isSelected ? null : rep)}
                >
                  <div className="flex items-center gap-3 mb-2">
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
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Revenue</p>
                      <p className="text-xs font-bold text-emerald-400">{formatCurrency(rep.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Deals</p>
                      <p className="text-xs font-bold text-amber-400">{rep.totalDeals}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-neutral-500 uppercase">Commissions</p>
                      <p className="text-xs font-bold text-sky-400">{formatCurrency(rep.commissions)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
            {pagination.pageSize !== "All" && sortedReps.length > (pagination.pageSize as number) && (
              <div className="border-t border-neutral-800 bg-neutral-900">
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
          <div className="bg-neutral-900 border border-sky-500/20 rounded-2xl shadow-lg overflow-hidden animate-in slide-in-from-bottom-2">
            <div className="px-4 sm:px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-sky-950/40 border border-sky-500/30 flex items-center justify-center text-sm font-bold text-sky-400">
                  {selectedRep.repName?.charAt(0) || "?"}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedRep.repName}</h3>
                  <p className="text-[10px] text-neutral-500">{selectedRep.email} • Margin: {formatPercent(selectedRep.margin)}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRep(null)}
                className="text-neutral-500 hover:text-white p-1.5 rounded-full bg-neutral-800 transition-colors"
              >
                <FiX size={14} />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              {metricConfigs.map((mc) => {
                const repValue = (selectedRep as any)[mc.key] as number
                const avgValue = (companyAverages as any)[mc.key] as number
                const maxVal = (maxValues as any)[mc.key] as number
                const barWidth = maxVal > 0 ? (repValue / maxVal) * 100 : 0
                const avgPosition = maxVal > 0 ? (avgValue / maxVal) * 100 : 0

                return (
                  <div key={mc.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">{mc.label}</span>
                      <span className="text-xs font-bold text-white">{mc.format(repValue)}</span>
                    </div>
                    <div className="relative h-5 bg-neutral-800 rounded-full overflow-hidden">
                      {/* Rep bar */}
                      <div
                        className={`absolute inset-y-0 left-0 ${mc.barColor} rounded-full transition-all duration-700 ease-out`}
                        style={{ width: `${Math.min(barWidth, 100)}%` }}
                      />
                      {/* Average indicator */}
                      {avgPosition > 0 && avgPosition <= 100 && (
                        <div
                          className={`absolute inset-y-0 w-0.5 ${mc.avgColor} border-l border-dashed opacity-80 transition-all duration-700`}
                          style={{ left: `${Math.min(avgPosition, 100)}%` }}
                        />
                      )}
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[9px] text-neutral-600">0</span>
                      <span className="text-[9px] text-neutral-500">Avg: {mc.format(avgValue)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
