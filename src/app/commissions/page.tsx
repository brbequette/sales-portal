"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { PayPeriodStatementModal } from "@/components/PayPeriodStatementModal"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"
import { 
  FiDollarSign, FiPercent, FiTrendingUp, FiAward, FiUser, 
  FiCheckCircle, FiClock, FiFileText, FiRefreshCw, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiCalendar, FiFilter, FiExternalLink
} from "react-icons/fi"
import { sessionGet, sessionSet, TTL } from "@/lib/dataCache"
import { UpdateBanner } from '@/lib/useStaleCheck'

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
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [byRep, setByRep] = useState<Record<string, any>>({})
  const [selectedRepId, setSelectedRepId] = useState<string>("")
  const [selectedYear, setSelectedYear] = useState<string>(() => new Date().getFullYear().toString())
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [showStatement, setShowStatement] = useState(false)
  const [activeInvoiceModal, setActiveInvoiceModal] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<"invoices" | "payouts">("invoices")
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = useState<"weekly" | "flat">("weekly")
  const [commPeriod, setCommPeriod] = useState<"this_month" | "last_month" | "this_quarter" | "this_year" | "all">("this_year")
  const [commCustomStart, setCommCustomStart] = useState("")
  const [commCustomEnd, setCommCustomEnd] = useState("")
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

  const normalizedRole = (user?.role || "").toLowerCase()
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager")

  const fetchCommissions = async (force = false) => {
    const cacheKey = `commissions-${selectedYear}-${user?.id || user?.email}`
    if (!force) {
      const cached = sessionGet<any>(cacheKey, TTL.FIFTEEN_MIN)
      if (cached) { setByRep(cached.byRep); setAvailableYears(cached.years); setSelectedRepId(cached.selectedRepId); return }
    }
    // First load with no data: full spinner. Subsequent refreshes: subtle bar
    if (Object.keys(byRep).length === 0) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const queryParams = new URLSearchParams({
        includeHidden: "true",
        year: selectedYear,
        userId: user?.id || "",
        userEmail: user?.email || "",
      })
      const res = await fetch(`/api/get-commissions?${queryParams.toString()}`)
      const data = await res.json()
      if (data.success) {
        setByRep(data.byRep || {})
        if (data.years && data.years.length > 0) setAvailableYears(data.years)
        
        const repsList = Object.keys(data.byRep || {})
        let matchedRep = repsList[0]
        if (repsList.length > 0) {
          const userEmail = (user?.email || "").toLowerCase()
          const userId = user?.id
          const userName = (user?.name || "").toLowerCase()
          matchedRep = repsList.find(r => r === userId) ||
                       repsList.find(r => (data.byRep[r]?.repName || "").toLowerCase().includes(userName) || userName.includes((data.byRep[r]?.repName || "").toLowerCase())) ||
                       repsList.find(r => r.toLowerCase().includes(userEmail.split('@')[0])) ||
                       repsList[0]
          setSelectedRepId(matchedRep)
        }
        sessionSet(cacheKey, { byRep: data.byRep || {}, years: data.years || [], selectedRepId: matchedRep })
        
        const sig = `${Object.keys(data.byRep || {}).length}|${selectedYear}`
        setUpdateAvailable(false)
        setTimeout(() => checkForUpdates(sig, `/api/get-commissions?year=${selectedYear}`), 2000)
      } else {
        setError(data.error || "Failed to load commission data")
      }
    } catch (err: any) {
      setError(err.message || "Network error loading commissions")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchCommissions()
  }, [selectedYear, user?.id, user?.email, refreshTrigger])

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

      const isPaid = inv.isPaid || inv.status === 'paid' || inv.status === 'Paid'
      const profit = inv.profit || 0
      const upfrontHalf = inv.commission?.upfront ?? (profit * 0.25)
      const secondHalf = inv.commission?.final ?? inv.commission?.future ?? (profit * 0.25)
      const earnedCommissionVal = isPaid ? (upfrontHalf + secondHalf) : upfrontHalf

      groupsMap[weekKey].invoices.push(inv)
      groupsMap[weekKey].totalSales += (inv.amount || 0)
      groupsMap[weekKey].totalProfit += profit
      groupsMap[weekKey].totalCommission += earnedCommissionVal
      if (isPaid) {
        groupsMap[weekKey].paidCount += 1
      } else {
        groupsMap[weekKey].unpaidCount += 1
      }
    })

    // Auto-expand top 2 weeks by default
    const sorted = Object.values(groupsMap).sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    return sorted
  }, [currentRepData])

  // Filter weekly groups by the selected sub-period
  const filteredWeeklyGroups = useMemo(() => {
    if (commPeriod === 'this_year' || commPeriod === 'all' || selectedYear !== new Date().getFullYear().toString()) return weeklyGroups
    const now = new Date()
    let start: Date, end: Date
    if (commPeriod === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    } else if (commPeriod === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (commPeriod === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
      end = new Date(now.getFullYear(), q * 3 + 3, 1)
    } else {
      return weeklyGroups
    }
    return weeklyGroups.filter(g => g.startDate >= start && g.startDate < end)
  }, [weeklyGroups, commPeriod, selectedYear])

  const filteredTotals = useMemo(() => {
    if (filteredWeeklyGroups.length === weeklyGroups.length) {
      return {
        earned: currentRepData?.totalEarned || 0,
        paid: currentRepData?.totalPaid || 0,
        balance: currentRepData?.balance || 0,
        profit: currentRepData?.totalProfit || 0,
        deals: currentRepData?.invoices?.length || 0,
      }
    }
    // Compute from filtered weeks
    let earned = 0, paid = 0, profit = 0, deals = 0
    filteredWeeklyGroups.forEach(w => {
      earned += w.totalCommission || 0
      paid += (w as any).paidAmount || 0
      profit += w.totalProfit || 0
      deals += (w as any).invoiceCount || w.invoices?.length || 0
    })
    return { earned, paid, balance: earned - paid, profit, deals }
  }, [filteredWeeklyGroups, weeklyGroups.length, currentRepData])

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
    <div className="page-content">
      <UpdateBanner show={updateAvailable} onUpdate={() => { setUpdateAvailable(false); setRefreshTrigger(n => n + 1) }} accentColor="indigo" label="Commission data updated" />

      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center">
            <FiDollarSign className="text-indigo-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Sales Commissions</h1>
            <p className="page-subtitle">Weekly profit splits, VIG deductions, draw balances & pay period statements</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && repOptions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <FiUser className="text-neutral-500 shrink-0" size={13} />
              <select
                value={selectedRepId}
                onChange={e => setSelectedRepId(e.target.value)}
                className="td-select"
              >
                {repOptions.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="td-select"
          >
            <option value={new Date().getFullYear().toString()}>{new Date().getFullYear()}</option>
            {availableYears.filter(y => y !== new Date().getFullYear()).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
            <option value="all">All Time</option>
          </select>
          <button onClick={() => fetchCommissions(true)} className="td-btn td-btn-ghost td-btn-sm" title="Refresh">
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={14} />
          </button>
          {currentRepData && (
            <button onClick={() => setShowStatement(true)} className="td-btn td-btn-primary td-btn-sm">
              <FiAward size={13} /> Pay Statement
            </button>
          )}
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-4">

        {/* Loading — only shown on first load with no data */}
        {loading && Object.keys(byRep).length === 0 && (
          <div className="flex items-center justify-center py-20 gap-3">
            <FiRefreshCw className="animate-spin text-indigo-500" size={22} />
            <span className="text-sm text-neutral-400">Loading commission records...</span>
          </div>
        )}
        {/* Subtle progress bar during background refreshes */}
        {refreshing && <div className="h-0.5 bg-indigo-500/60 animate-pulse w-full rounded mb-2" />}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 flex items-center gap-3">
            <FiAlertCircle size={18} className="shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {(!loading || Object.keys(byRep).length > 0) && !error && currentRepData && (
          <>
            {/* Period label for KPI context */}
            {commPeriod !== 'this_year' && commPeriod !== 'all' && (
              <div className="text-xs text-indigo-400 font-bold -mb-1">
                Showing: {commPeriod === 'this_month' ? 'This Month' : commPeriod === 'last_month' ? 'Last Month' : 'This Quarter'}
              </div>
            )}
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="glass-panel p-4 rounded-2xl border border-emerald-500/20 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  <span>Total Earned</span><FiDollarSign className="text-emerald-400" size={15} />
                </div>
                <div className="text-xl font-black text-emerald-400">{fmt(filteredTotals.earned)}</div>
                <div className="text-[11px] text-neutral-600">Net 50% split after VIG</div>
              </div>
              <div className="glass-panel p-4 rounded-2xl border border-indigo-500/20 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  <span>Total Paid Out</span><FiCheckCircle className="text-indigo-400" size={15} />
                </div>
                <div className="text-xl font-black text-white">{fmt(filteredTotals.paid)}</div>
                <div className="text-[11px] text-neutral-600">Disbursed checks & draws</div>
              </div>
              <div className="glass-panel p-4 rounded-2xl border border-amber-500/20 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  <span>Unpaid Balance</span><FiClock className="text-amber-400" size={15} />
                </div>
                <div className={`text-xl font-black ${filteredTotals.balance >= 0 ? "text-amber-400" : "text-red-400"}`}>
                  {fmt(filteredTotals.balance)}
                </div>
                <div className="text-[11px] text-neutral-600">
                  {currentRepData.balance >= 0 ? "Pending payout" : "Draw balance advance"}
                </div>
              </div>
              <div className="glass-panel p-4 rounded-2xl border border-sky-500/20 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  <span>Total Net Profit</span><FiTrendingUp className="text-sky-400" size={15} />
                </div>
                <div className="text-xl font-black text-white">{fmt(filteredTotals.profit)}</div>
                <div className="text-[11px] text-neutral-600">Across {filteredTotals.deals} deals</div>
              </div>
            </div>

            {/* Breakdown Panel */}
            <div className="modern-card overflow-hidden">

              {/* Tabs + View Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/8 bg-neutral-950/40 px-4">
                <div className="flex">
                  {(["invoices", "payouts"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
                        activeTab === tab
                          ? "border-indigo-500 text-indigo-400"
                          : "border-transparent text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {tab === "invoices"
                        ? `Weekly Statements (${currentRepData.invoices?.length || 0})`
                        : `Payout History (${currentRepData.payouts?.length || 0})`}
                    </button>
                  ))}
                </div>

                {activeTab === "invoices" && (
                  <div className="flex items-center gap-2 py-2 sm:py-0">
                    <div className="glass-panel rounded-lg p-0.5 flex border border-white/10 text-xs font-semibold">
                      <button
                        onClick={() => setViewMode("weekly")}
                        className={`px-3 py-1 rounded-md transition ${viewMode === "weekly" ? "bg-indigo-600 text-white" : "text-neutral-400 hover:text-white"}`}
                      >
                        By Week
                      </button>
                      <button
                        onClick={() => setViewMode("flat")}
                        className={`px-3 py-1 rounded-md transition ${viewMode === "flat" ? "bg-indigo-600 text-white" : "text-neutral-400 hover:text-white"}`}
                      >
                        Flat List
                      </button>
                    </div>
                    {viewMode === "weekly" && (
                      <div className="flex items-center gap-1 text-xs">
                        <button onClick={expandAllWeeks} className="text-neutral-500 hover:text-indigo-400 px-2 py-1">Expand All</button>
                        <span className="text-neutral-700">•</span>
                        <button onClick={collapseAllWeeks} className="text-neutral-500 hover:text-indigo-400 px-2 py-1">Collapse All</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Period Sub-Filter */}
              {viewMode === 'weekly' && (
                <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-neutral-950/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mr-1">Period:</span>
                  {([
                    { id: 'this_month', label: 'This Month' },
                    { id: 'last_month', label: 'Last Month' },
                    { id: 'this_quarter', label: 'This Quarter' },
                    { id: 'this_year', label: 'Full Year' },
                    { id: 'all', label: 'All Time' },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setCommPeriod(opt.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        commPeriod === opt.id
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                          : 'bg-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {filteredWeeklyGroups.length !== weeklyGroups.length && (
                    <span className="text-[10px] text-indigo-400 font-bold ml-2">
                      {filteredWeeklyGroups.length} of {weeklyGroups.length} weeks
                    </span>
                  )}
                </div>
              )}

              {/* Weekly Grouped View */}
              {activeTab === "invoices" && viewMode === "weekly" && (
                <div className="divide-y divide-white/[0.06]">
                  {filteredWeeklyGroups.map(group => {
                    const isExpanded = !!expandedWeeks[group.weekKey]
                    return (
                      <div key={group.weekKey}>
                        {/* Week Header Row */}
                        <div
                          onClick={() => toggleWeek(group.weekKey)}
                          className="flex flex-wrap items-center justify-between px-4 py-3 bg-neutral-950/30 hover:bg-neutral-900/40 cursor-pointer select-none transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-neutral-500">
                              {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                            </span>
                            <div>
                              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                <FiCalendar className="text-indigo-400" size={13} />
                                Week of {group.weekLabel}
                                <span className="text-xs font-normal text-neutral-500">({group.invoices.length} invoices)</span>
                              </div>
                              <div className="text-xs text-neutral-600 mt-0.5 flex items-center gap-2">
                                <span className="text-emerald-400 font-medium">{group.paidCount} Paid</span>
                                <span>•</span>
                                <span className="text-amber-400 font-medium">{group.unpaidCount} Pending</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-right">
                            <div>
                              <div className="text-[10px] text-neutral-600 uppercase tracking-wider">Weekly Sales</div>
                              <div className="text-sm font-semibold text-white">{fmt(group.totalSales)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-neutral-600 uppercase tracking-wider">Net Profit</div>
                              <div className="text-sm font-semibold text-sky-400">{fmt(group.totalProfit)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-neutral-600 uppercase tracking-wider">Est. Commission</div>
                              <div className="text-sm font-bold text-emerald-400">{fmt(group.totalCommission)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Invoices */}
                        {isExpanded && (
                          <div className="overflow-x-auto border-t border-white/[0.05]">
                            <table className="td-table">
                              <thead>
                                <tr>
                                  <th className="td-th pl-10">Date</th>
                                  <th className="td-th">Invoice #</th>
                                  <th className="td-th">Account / Customer</th>
                                  <th className="td-th text-right">Amount</th>
                                  <th className="td-th text-right">Profit</th>
                                  <th className="td-th text-right">Est. Commission</th>
                                  <th className="td-th text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.invoices.map((inv: any) => {
                                  const isPaid = inv.isPaid || inv.status === 'paid' || inv.status === 'Paid'
                                  const profit = inv.profit || 0
                                  const upfrontHalf = inv.commission?.upfront ?? (profit * 0.25)
                                  const secondHalf = inv.commission?.final ?? inv.commission?.future ?? (profit * 0.25)
                                  const fullCommission = upfrontHalf + secondHalf
                                  return (
                                    <tr
                                      key={inv.id}
                                      onClick={() => setActiveInvoiceModal(inv)}
                                      className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                                    >
                                      <td className="td-td pl-10 text-neutral-500 whitespace-nowrap">{fmtDate(inv.issueDate)}</td>
                                      <td className="td-td">
                                        <span className="font-mono font-bold text-indigo-400 group-hover:text-indigo-300 flex items-center gap-1.5">
                                          <FiFileText size={12} className="shrink-0" />
                                          #{inv.invoiceNumber || inv.zohoId || "--"}
                                        </span>
                                      </td>
                                      <td className="td-td font-medium text-white">{inv.accountName || inv.name || "Customer"}</td>
                                      <td className="td-td text-right font-medium text-white">{fmt(inv.amount)}</td>
                                      <td className="td-td text-right font-medium text-sky-400">{fmt(inv.profit)}</td>
                                      <td className="td-td text-right whitespace-nowrap">
                                        {!isPaid ? (
                                          <div>
                                            <div className="font-bold text-amber-400 text-xs">{fmt(upfrontHalf)} <span className="text-[10px] font-normal text-amber-300/70">(1st Half)</span></div>
                                            <div className="text-[10px] text-neutral-600 mt-0.5">2nd: {fmt(secondHalf)} <span className="text-neutral-700">(Pending)</span></div>
                                          </div>
                                        ) : (
                                          <div>
                                            <div className="font-bold text-emerald-400 text-xs">{fmt(fullCommission)} <span className="text-[10px] font-normal text-emerald-300/70">(Full)</span></div>
                                            <div className="text-[10px] text-emerald-500/60 mt-0.5">{fmt(upfrontHalf)} + {fmt(secondHalf)}</div>
                                          </div>
                                        )}
                                      </td>
                                      <td className="td-td text-center">
                                        <span className={`status-pill ${isPaid ? "status-pill-green" : "status-pill-amber"}`}>
                                          {isPaid ? "Paid" : "Unpaid"}
                                        </span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {filteredWeeklyGroups.length === 0 && (
                    <div className="py-12 text-center text-sm text-neutral-500">
                      No weekly invoice records found for this period.
                    </div>
                  )}
                </div>
              )}

              {/* Flat Invoices Table */}
              {activeTab === "invoices" && viewMode === "flat" && (
                <div className="overflow-x-auto">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th className="td-th">Date</th>
                        <th className="td-th">Invoice #</th>
                        <th className="td-th">Account / Customer</th>
                        <th className="td-th text-right">Amount</th>
                        <th className="td-th text-right">Profit</th>
                        <th className="td-th text-right">Est. Commission</th>
                        <th className="td-th text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentRepData.invoices || []).map((inv: any) => {
                        const isPaid = inv.isPaid || inv.status === 'paid' || inv.status === 'Paid'
                        const profit = inv.profit || 0
                        const upfrontHalf = inv.commission?.upfront ?? (profit * 0.25)
                        const secondHalf = inv.commission?.final ?? inv.commission?.future ?? (profit * 0.25)
                        const fullCommission = upfrontHalf + secondHalf
                        return (
                          <tr
                            key={inv.id}
                            onClick={() => setActiveInvoiceModal(inv)}
                            className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                          >
                            <td className="td-td text-neutral-500 whitespace-nowrap">{fmtDate(inv.issueDate)}</td>
                            <td className="td-td">
                              <span className="font-mono font-bold text-indigo-400 group-hover:text-indigo-300 flex items-center gap-1.5">
                                <FiFileText size={12} className="shrink-0" />
                                #{inv.invoiceNumber || inv.zohoId || "--"}
                              </span>
                            </td>
                            <td className="td-td font-medium text-white">{inv.accountName || inv.name || "Customer"}</td>
                            <td className="td-td text-right font-medium text-white">{fmt(inv.amount)}</td>
                            <td className="td-td text-right font-medium text-sky-400">{fmt(inv.profit)}</td>
                            <td className="td-td text-right whitespace-nowrap">
                              {!isPaid ? (
                                <div>
                                  <div className="font-bold text-amber-400 text-xs">{fmt(upfrontHalf)} <span className="text-[10px] font-normal text-amber-300/70">(1st Half)</span></div>
                                  <div className="text-[10px] text-neutral-600 mt-0.5">2nd: {fmt(secondHalf)} <span className="text-neutral-700">(Pending)</span></div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-bold text-emerald-400 text-xs">{fmt(fullCommission)} <span className="text-[10px] font-normal text-emerald-300/70">(Full)</span></div>
                                  <div className="text-[10px] text-emerald-500/60 mt-0.5">{fmt(upfrontHalf)} + {fmt(secondHalf)}</div>
                                </div>
                              )}
                            </td>
                            <td className="td-td text-center">
                              <span className={`status-pill ${isPaid ? "status-pill-green" : "status-pill-amber"}`}>
                                {isPaid ? "Paid" : "Unpaid"}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payouts Table */}
              {activeTab === "payouts" && (
                <div className="overflow-x-auto">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th className="td-th">Date</th>
                        <th className="td-th">Method / Check #</th>
                        <th className="td-th">Notes</th>
                        <th className="td-th text-right">Amount Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentRepData.payouts || []).map((p: any) => (
                        <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="td-td text-neutral-500 whitespace-nowrap">{fmtDate(p.date || p.createdAt)}</td>
                          <td className="td-td font-medium text-white">{p.method || "Check"}</td>
                          <td className="td-td text-neutral-400">{p.notes || "--"}</td>
                          <td className="td-td text-right font-bold text-indigo-400">{fmt(p.amount)}</td>
                        </tr>
                      ))}
                      {(!currentRepData.payouts || currentRepData.payouts.length === 0) && (
                        <tr>
                          <td colSpan={4} className="py-10 text-center text-sm text-neutral-500">No payout transactions logged yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Pay Period Statement Modal */}
      {showStatement && currentRepData && (
        <PayPeriodStatementModal rep={currentRepData} onClose={() => setShowStatement(false)} />
      )}

      {/* Invoice Details Modal */}
      {activeInvoiceModal && (
        <InvoiceDetailsModal
          invoice={activeInvoiceModal.zohoId || activeInvoiceModal.id || activeInvoiceModal.invoiceNumber}
          type="Invoice"
          onClose={() => setActiveInvoiceModal(null)}
        />
      )}
    </div>
  )
}
