"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { PayPeriodStatementModal } from "@/components/PayPeriodStatementModal"
import { 
  FiDollarSign, FiPercent, FiTrendingUp, FiAward, FiUser, 
  FiCheckCircle, FiClock, FiFileText, FiRefreshCw, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiCalendar, FiFilter
} from "react-icons/fi"

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0)
}

function fmtDate(s: string | null) {
  if (!s) return "--"
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// Snap any date to its Monday (week start)
function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

interface WeeklyGroup {
  weekKey: string
  weekLabel: string
  startDate: Date
  endDate: Date
  invoices: any[]
  totalSales: number
  totalProfit: number
  totalCommission: number
  paidCount: number
  unpaidCount: number
}

export default function CommissionsPage() {
  const { zohoContext: user } = useZoho()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [byRep, setByRep] = useState<Record<string, any>>({})
  const [selectedRepId, setSelectedRepId] = useState<string>("")
  const [selectedYear, setSelectedYear] = useState<string>(() => new Date().getFullYear().toString())
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [showStatement, setShowStatement] = useState(false)
  const [activeTab, setActiveTab] = useState<"invoices" | "payouts">("invoices")
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = useState<"weekly" | "flat">("weekly")

  const normalizedRole = (user?.role || "").toLowerCase()
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager")

  const fetchCommissions = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/get-commissions?includeHidden=true&year=${selectedYear}`)
      const data = await res.json()
      if (data.success) {
        setByRep(data.byRep || {})
        if (data.years && data.years.length > 0) setAvailableYears(data.years)
        
        const repsList = Object.keys(data.byRep || {})
        if (repsList.length > 0) {
          const userEmail = (user?.email || "").toLowerCase()
          const matchedRep = repsList.find(r => r.toLowerCase().includes(userEmail.split('@')[0])) || repsList[0]
          if (!selectedRepId) setSelectedRepId(matchedRep)
        }
      } else {
        setError(data.error || "Failed to load commission data")
      }
    } catch (err: any) {
      setError(err.message || "Network error loading commissions")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCommissions()
  }, [selectedYear])

  const repOptions = useMemo(() => {
    return Object.values(byRep).map((r: any) => ({ id: r.repId, name: r.repName }))
  }, [byRep])

  const currentRepData = useMemo(() => {
    if (!selectedRepId || !byRep[selectedRepId]) {
      const first = Object.values(byRep)[0] as any
      return first || null
    }
    return byRep[selectedRepId]
  }, [byRep, selectedRepId])

  // Group current rep's invoices into Pay Period Weeks
  const weeklyGroups = useMemo<WeeklyGroup[]>(() => {
    if (!currentRepData || !Array.isArray(currentRepData.invoices)) return []

    const groupsMap: Record<string, WeeklyGroup> = {}

    currentRepData.invoices.forEach((inv: any) => {
      const dateStr = inv.issueDate || inv.paymentDate || new Date().toISOString()
      const d = new Date(dateStr)
      const monday = getMonday(isNaN(d.getTime()) ? new Date() : d)
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)

      const weekKey = monday.toISOString().split('T')[0]
      const weekLabel = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`

      if (!groupsMap[weekKey]) {
        groupsMap[weekKey] = {
          weekKey,
          weekLabel,
          startDate: monday,
          endDate: sunday,
          invoices: [],
          totalSales: 0,
          totalProfit: 0,
          totalCommission: 0,
          paidCount: 0,
          unpaidCount: 0
        }
      }

      const commissionVal = inv.commission?.total || (inv.profit * 0.5) || 0
      groupsMap[weekKey].invoices.push(inv)
      groupsMap[weekKey].totalSales += (inv.amount || 0)
      groupsMap[weekKey].totalProfit += (inv.profit || 0)
      groupsMap[weekKey].totalCommission += commissionVal
      if (inv.isPaid || inv.status === 'paid') {
        groupsMap[weekKey].paidCount += 1
      } else {
        groupsMap[weekKey].unpaidCount += 1
      }
    })

    // Auto-expand top 2 weeks by default
    const sorted = Object.values(groupsMap).sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    return sorted
  }, [currentRepData])

  // Auto-expand first week on change
  useEffect(() => {
    if (weeklyGroups.length > 0 && Object.keys(expandedWeeks).length === 0) {
      setExpandedWeeks({ [weeklyGroups[0].weekKey]: true })
    }
  }, [weeklyGroups])

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks(prev => ({ ...prev, [weekKey]: !prev[weekKey] }))
  }

  const expandAllWeeks = () => {
    const all: Record<string, boolean> = {}
    weeklyGroups.forEach(w => all[w.weekKey] = true)
    setExpandedWeeks(all)
  }

  const collapseAllWeeks = () => {
    setExpandedWeeks({})
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2">
            <FiDollarSign className="text-emerald-500" /> Sales Commissions & Weekly Statements
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Review weekly profit splits, VIG deductions, draw balances, and pay period statements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && repOptions.length > 0 && (
            <div className="flex items-center gap-2 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-1.5 shadow-sm">
              <FiUser className="text-neutral-400 text-xs" />
              <select
                value={selectedRepId}
                onChange={(e) => setSelectedRepId(e.target.value)}
                className="bg-transparent text-sm font-semibold text-[var(--foreground)] focus:outline-none cursor-pointer"
              >
                {repOptions.map((r) => (
                  <option key={r.id} value={r.id} className="bg-[var(--card)] text-[var(--foreground)]">
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-[var(--card)] border border-[var(--border)] text-sm font-medium text-[var(--foreground)] rounded-lg px-3 py-1.5 shadow-sm focus:outline-none cursor-pointer"
          >
            <option value={new Date().getFullYear().toString()}>{new Date().getFullYear()} Year</option>
            {availableYears.filter(y => y !== new Date().getFullYear()).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
            <option value="all">All Time (Summary)</option>
          </select>

          <button
            onClick={() => fetchCommissions()}
            className="p-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-neutral-800 transition"
            title="Refresh Data"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {currentRepData && (
            <button
              onClick={() => setShowStatement(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 flex items-center gap-2 shadow-sm"
            >
              <FiAward className="h-4 w-4" />
              View Pay Statement
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-sm text-[var(--muted-foreground)]">Loading commission records...</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3">
          <FiAlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && currentRepData && (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Total Earned</span>
                <FiDollarSign className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-emerald-400">{fmt(currentRepData.totalEarned)}</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Net 50% split after VIG markup</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Total Paid Out</span>
                <FiCheckCircle className="h-5 w-5 text-indigo-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">{fmt(currentRepData.totalPaid)}</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Disbursed checks & draws</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Unpaid Balance</span>
                <FiClock className="h-5 w-5 text-amber-400" />
              </div>
              <div className={`mt-3 text-2xl font-bold ${currentRepData.balance >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                {fmt(currentRepData.balance)}
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {currentRepData.balance >= 0 ? 'Pending payout' : 'Draw balance advance'}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Total Net Profit</span>
                <FiTrendingUp className="h-5 w-5 text-sky-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">{fmt(currentRepData.totalProfit)}</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Generated across {currentRepData.invoices?.length || 0} deals</p>
            </div>
          </div>

          {/* Breakdown Tabs & Grouping Controls */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4">
              <div className="flex">
                <button
                  onClick={() => setActiveTab("invoices")}
                  className={`py-3 px-4 font-semibold text-sm border-b-2 transition ${
                    activeTab === "invoices"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Weekly Statements & Invoices ({currentRepData.invoices?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab("payouts")}
                  className={`py-3 px-4 font-semibold text-sm border-b-2 transition ${
                    activeTab === "payouts"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Payout History ({currentRepData.payouts?.length || 0})
                </button>
              </div>

              {activeTab === "invoices" && (
                <div className="flex items-center gap-2 py-2 sm:py-0">
                  <div className="flex items-center bg-neutral-900 border border-[var(--border)] rounded-lg p-0.5 text-xs font-medium">
                    <button
                      onClick={() => setViewMode("weekly")}
                      className={`px-3 py-1 rounded-md transition ${viewMode === 'weekly' ? 'bg-indigo-600 text-white font-semibold' : 'text-neutral-400 hover:text-white'}`}
                    >
                      Grouped by Week
                    </button>
                    <button
                      onClick={() => setViewMode("flat")}
                      className={`px-3 py-1 rounded-md transition ${viewMode === 'flat' ? 'bg-indigo-600 text-white font-semibold' : 'text-neutral-400 hover:text-white'}`}
                    >
                      Flat List
                    </button>
                  </div>

                  {viewMode === "weekly" && (
                    <div className="flex items-center gap-1 text-xs">
                      <button onClick={expandAllWeeks} className="px-2 py-1 text-neutral-400 hover:text-indigo-400">Expand All</button>
                      <span className="text-neutral-600">•</span>
                      <button onClick={collapseAllWeeks} className="px-2 py-1 text-neutral-400 hover:text-indigo-400">Collapse All</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Weekly Grouped View */}
            {activeTab === "invoices" && viewMode === "weekly" && (
              <div className="divide-y divide-[var(--border)]">
                {weeklyGroups.map((group) => {
                  const isExpanded = !!expandedWeeks[group.weekKey]
                  return (
                    <div key={group.weekKey} className="transition">
                      {/* Week Header */}
                      <div
                        onClick={() => toggleWeek(group.weekKey)}
                        className="flex flex-wrap items-center justify-between p-4 bg-neutral-900/40 hover:bg-neutral-800/50 cursor-pointer select-none transition gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <button className="text-neutral-400 hover:text-white">
                            {isExpanded ? <FiChevronDown className="h-5 w-5" /> : <FiChevronRight className="h-5 w-5" />}
                          </button>
                          <div>
                            <div className="font-semibold text-sm text-[var(--foreground)] flex items-center gap-2">
                              <FiCalendar className="text-indigo-400 h-4 w-4" />
                              <span>Week of {group.weekLabel}</span>
                              <span className="text-xs font-normal text-[var(--muted-foreground)]">({group.invoices.length} invoices)</span>
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)] mt-0.5 flex items-center gap-2">
                              <span className="text-emerald-400 font-medium">{group.paidCount} Paid</span>
                              <span>•</span>
                              <span className="text-amber-400 font-medium">{group.unpaidCount} Pending</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider">Weekly Sales</div>
                            <div className="text-sm font-semibold text-[var(--foreground)]">{fmt(group.totalSales)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider">Net Profit</div>
                            <div className="text-sm font-semibold text-sky-400">{fmt(group.totalProfit)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider">Est. Commission</div>
                            <div className="text-sm font-bold text-emerald-400">{fmt(group.totalCommission)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Invoices Table */}
                      {isExpanded && (
                        <div className="overflow-x-auto bg-[var(--card)] border-t border-[var(--border)]">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-neutral-900/80 text-xs uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
                              <tr>
                                <th className="py-2.5 px-4 pl-12">Date</th>
                                <th className="py-2.5 px-4">Invoice #</th>
                                <th className="py-2.5 px-4">Account / Customer</th>
                                <th className="py-2.5 px-4 text-right">Amount</th>
                                <th className="py-2.5 px-4 text-right">Profit</th>
                                <th className="py-2.5 px-4 text-right">Est. Commission</th>
                                <th className="py-2.5 px-4 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {group.invoices.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-neutral-800/30 transition">
                                  <td className="py-2.5 px-4 pl-12 whitespace-nowrap text-[var(--muted-foreground)]">
                                    {fmtDate(inv.issueDate)}
                                  </td>
                                  <td className="py-2.5 px-4 font-mono font-medium text-indigo-400">
                                    {inv.invoiceNumber || inv.zohoId || "--"}
                                  </td>
                                  <td className="py-2.5 px-4 font-medium text-[var(--foreground)]">
                                    {inv.accountName || inv.name || "Customer"}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-medium text-[var(--foreground)]">
                                    {fmt(inv.amount)}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-medium text-sky-400">
                                    {fmt(inv.profit)}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                                    {fmt(inv.commission?.total || (inv.profit * 0.5))}
                                  </td>
                                  <td className="py-2.5 px-4 text-center">
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                      inv.isPaid || inv.status === 'paid'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    }`}>
                                      {inv.isPaid || inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}

                {weeklyGroups.length === 0 && (
                  <div className="py-12 text-center text-[var(--muted-foreground)]">
                    No weekly invoice records found for this period.
                  </div>
                )}
              </div>
            )}

            {/* Flat Invoices Table */}
            {activeTab === "invoices" && viewMode === "flat" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900/50 text-xs uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Account / Customer</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Profit</th>
                      <th className="py-3 px-4 text-right">Est. Commission</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(currentRepData.invoices || []).map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-neutral-800/40 transition">
                        <td className="py-3 px-4 whitespace-nowrap text-[var(--muted-foreground)]">
                          {fmtDate(inv.issueDate)}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-indigo-400">
                          {inv.invoiceNumber || inv.zohoId || "--"}
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--foreground)]">
                          {inv.accountName || inv.name || "Customer"}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-[var(--foreground)]">
                          {fmt(inv.amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-sky-400">
                          {fmt(inv.profit)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">
                          {fmt(inv.commission?.total || (inv.profit * 0.5))}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            inv.isPaid || inv.status === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {inv.isPaid || inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payouts Table */}
            {activeTab === "payouts" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900/50 text-xs uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Method / Check #</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(currentRepData.payouts || []).map((p: any) => (
                      <tr key={p.id} className="hover:bg-neutral-800/40 transition">
                        <td className="py-3 px-4 whitespace-nowrap text-[var(--muted-foreground)]">
                          {fmtDate(p.date || p.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--foreground)]">
                          {p.method || 'Check'}
                        </td>
                        <td className="py-3 px-4 text-[var(--muted-foreground)]">
                          {p.notes || '--'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-indigo-400">
                          {fmt(p.amount)}
                        </td>
                      </tr>
                    ))}
                    {(!currentRepData.payouts || currentRepData.payouts.length === 0) && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-[var(--muted-foreground)]">
                          No payout transactions logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Pay Period Statement Modal */}
      {showStatement && currentRepData && (
        <PayPeriodStatementModal
          rep={currentRepData}
          onClose={() => setShowStatement(false)}
        />
      )}
    </div>
  )
}
