"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useZoho } from "@/components/ZohoProvider"
import { usePagination, Pagination } from "@/components/Pagination"
import { FiDollarSign, FiRefreshCw, FiChevronDown, FiChevronUp, FiTrendingUp, FiUsers, FiBarChart2, FiAward, FiFilter, FiX, FiSearch, FiFileText } from "react-icons/fi"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0)
}

// ── Types ──────────────────────────────────────────────────────────────
type InvoiceRecord = {
  id: string
  zohoId: string
  invoiceNumber: string | null
  name: string
  amount: number
  profit: number
  deadCost: number
  status: string
  issueDate: string | null
  paymentDate: string | null
  repId: string
  repName: string
  accountName: string
  accountZohoId?: string | null
  commission: { total: number; upfront: number; final: number }
  type: "invoice"
}

type DealRecord = {
  id: string
  zohoId: string
  name: string
  stage: string
  amount: number
  closeDate: string | null
  repId: string
  repName: string
  accountName: string
  accountZohoId?: string | null
  status: "pending" | "fulfilled" | "lost"
  type: "deal"
}

type Payout = {
  id: string
  amount: number
  date: string
  notes?: string
}

type RepSummary = {
  repId: string
  repName: string
  invoices: InvoiceRecord[]
  deals: DealRecord[]
  payouts: Payout[]
  totalEarned: number
  totalPaid: number
  totalProfit: number
  totalSales: number
  balance: number
}

type CommData = {
  invoices: InvoiceRecord[]
  deals: DealRecord[]
  byRep: Record<string, RepSummary>
  users: any[]
  years: number[]
  stats: {
    totalInvoices: number
    totalRevenue: number
    totalProfit: number
    totalCommissions: number
    totalDealsInPipeline: number
    totalPipelineValue: number
  }
}


function fmtDate(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const STAGE_COLORS: Record<string, string> = {
  "closed won": "text-emerald-400 bg-emerald-900/20",
  "closed lost": "text-red-400 bg-red-900/20",
  "fulfilled": "text-blue-400 bg-blue-900/20",
  "estimate created": "text-amber-400 bg-amber-900/20",
  "est. approval process": "text-orange-400 bg-orange-900/20",
  "pending": "text-neutral-400 bg-neutral-800",
}

function stageColor(stage: string) {
  const k = (stage || "").toLowerCase()
  for (const [key, cls] of Object.entries(STAGE_COLORS)) {
    if (k.includes(key)) return cls
  }
  return "text-neutral-400 bg-neutral-800"
}

// ── Rep Card ───────────────────────────────────────────────────────────
function RepCard({ rep, isAdmin, onViewInvoice, onManagePayouts }: {
  rep: RepSummary,
  isAdmin: boolean,
  onViewInvoice?: (id: string) => void,
  onManagePayouts: (rep: RepSummary) => void
}) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"invoices" | "pipeline">("invoices")
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({})

  // Group invoices by year → week
  const groupedInvoices = useCallback(() => {
    const groups: Record<number, Record<string, { invoices: InvoiceRecord[], totalCommission: number, startOfWeek: string }>> = {}
    rep.invoices.forEach(inv => {
      const d = inv.paymentDate ? new Date(inv.paymentDate) : inv.issueDate ? new Date(inv.issueDate) : new Date()
      const year = d.getFullYear()
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const startOfWeekDate = new Date(d)
      startOfWeekDate.setDate(diff)
      startOfWeekDate.setHours(0, 0, 0, 0)
      const startStr = startOfWeekDate.toISOString().split('T')[0]
      if (!groups[year]) groups[year] = {}
      if (!groups[year][startStr]) groups[year][startStr] = { invoices: [], totalCommission: 0, startOfWeek: startStr }
      groups[year][startStr].invoices.push(inv)
      groups[year][startStr].totalCommission += inv.commission.total
    })
    const sortedYears = Object.keys(groups).map(Number).sort((a, b) => b - a)
    return sortedYears.map(year => ({
      year,
      weeks: Object.values(groups[year]).sort((a, b) => new Date(b.startOfWeek).getTime() - new Date(a.startOfWeek).getTime())
    }))
  }, [rep.invoices])()

  const balance = rep.totalEarned - rep.totalPaid

  return (
    <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-800/60 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-blue-900/40 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm shrink-0">
            {rep.repName?.charAt(0) || "?"}
          </div>
          <div className="min-w-0 text-left">
            <div className="text-sm font-bold text-white truncate">{rep.repName}</div>
            <div className="text-[10px] text-neutral-500">{rep.invoices.length} paid invoices · {rep.deals.length} pipeline deals</div>
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0 ml-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Profit</div>
            <div className="text-sm font-bold text-sky-400">{fmt(rep.totalProfit || 0)}</div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Earned</div>
            <div className="text-sm font-bold text-emerald-400">{fmt(rep.totalEarned)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Balance</div>
            <div className={`text-sm font-bold ${balance > 0 ? "text-amber-400" : "text-neutral-400"}`}>{fmt(balance)}</div>
          </div>
          <div className="text-neutral-500">
            {open ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-neutral-800">
          {/* Mini stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-neutral-800 border-b border-neutral-800">
            {[
              { label: "Total Sales", value: fmt(rep.totalSales || 0), color: "text-white" },
              { label: "Total Profit", value: fmt(rep.totalProfit || 0), color: "text-sky-400" },
              { label: "Commission Earned", value: fmt(rep.totalEarned), color: "text-emerald-400" },
              { label: "Balance Owed", value: fmt(balance), color: balance > 0 ? "text-amber-400" : "text-neutral-400" },
            ].map(s => (
              <div key={s.label} className="px-4 py-3 text-center">
                <div className="text-[10px] text-neutral-500 uppercase font-semibold">{s.label}</div>
                <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {isAdmin && (
            <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-900/50 flex justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onManagePayouts(rep); }}
                className="text-xs font-bold text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded transition-colors"
              >
                Manage Payouts
              </button>
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex border-b border-neutral-800">
            <button
              onClick={() => setActiveTab("invoices")}
              className={`px-5 py-2.5 text-xs font-bold transition-colors ${
                activeTab === "invoices" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Paid Invoices ({rep.invoices.length})
            </button>
            <button
              onClick={() => setActiveTab("pipeline")}
              className={`px-5 py-2.5 text-xs font-bold transition-colors ${
                activeTab === "pipeline" ? "text-blue-400 border-b-2 border-blue-400" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Pipeline Activity ({rep.deals.length})
            </button>
          </div>

          {/* Invoice ledger - commission source */}
          {activeTab === "invoices" && (
            <div className="divide-y divide-neutral-800/60 pb-2">
              {groupedInvoices.length === 0 && (
                <div className="px-5 py-8 text-center text-neutral-500 text-sm">No paid invoices this period</div>
              )}
              {groupedInvoices.map(({ year, weeks }) => (
                <div key={year} className="mb-4">
                  <div className="px-5 py-2 bg-neutral-900 text-sm font-bold text-neutral-300 border-y border-neutral-800">{year}</div>
                  {weeks.map((week) => {
                    const isExpanded = expandedWeeks[`${year}-${week.startOfWeek}`]
                    return (
                      <div key={week.startOfWeek} className="border-b border-neutral-800/40">
                        <div
                          className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-800/50 transition-colors"
                          onClick={() => setExpandedWeeks(prev => ({ ...prev, [`${year}-${week.startOfWeek}`]: !prev[`${year}-${week.startOfWeek}`] }))}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-500">{isExpanded ? <FiChevronDown /> : <FiChevronUp />}</span>
                            <span className="text-sm font-semibold text-white">Week of {fmtDate(week.startOfWeek)}</span>
                            <span className="text-xs text-neutral-500">({week.invoices.length} invoices)</span>
                          </div>
                          <div className="text-sm font-bold text-emerald-400">{fmt(week.totalCommission)}</div>
                        </div>
                        {isExpanded && (
                          <div className="bg-neutral-900/20 pl-4 border-t border-neutral-800/30">
                            {week.invoices.map(inv => (
                              <div
                                key={inv.id}
                                onClick={() => onViewInvoice && onViewInvoice(inv.zohoId)}
                                className="flex items-center justify-between px-5 py-3 transition-colors border-b border-neutral-800/30 last:border-0 hover:bg-neutral-800 cursor-pointer"
                              >
                                <div className="min-w-0 flex-1 flex items-center gap-2.5">
                                  <FiFileText className="text-emerald-500 shrink-0 text-sm" />
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-white truncate">
                                      {inv.invoiceNumber ? `INV-${inv.invoiceNumber}` : inv.zohoId}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                                      {inv.accountZohoId ? (
                                        <Link href={`/account?id=${inv.accountZohoId}`} className="text-[10px] text-emerald-400 hover:underline font-bold" onClick={(e) => e.stopPropagation()}>
                                          🏢 {inv.accountName}
                                        </Link>
                                      ) : (
                                        <span className="text-[10px] text-neutral-400">🏢 {inv.accountName}</span>
                                      )}
                                      <span className="text-[10px] text-neutral-600">•</span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 font-bold">{inv.status}</span>
                                      <span className="text-[10px] text-neutral-600">•</span>
                                      <span className="text-[10px] text-neutral-500">{fmtDate(inv.paymentDate || inv.issueDate)}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0 ml-3">
                                  <div className="text-right hidden sm:block">
                                    <div className="text-[10px] text-neutral-500">Invoice</div>
                                    <div className="text-xs font-semibold text-white">{fmt(inv.amount)}</div>
                                  </div>
                                  <div className="text-right hidden sm:block">
                                    <div className="text-[10px] text-neutral-500">Profit</div>
                                    <div className="text-xs font-semibold text-sky-400">{fmt(inv.profit)}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] text-neutral-500">Commission</div>
                                    <div className="text-xs font-bold text-emerald-400">{fmt(inv.commission.total)}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Pipeline deals - activity only, no commission */}
          {activeTab === "pipeline" && (
            <div className="divide-y divide-neutral-800/60 pb-2">
              {rep.deals.length === 0 && (
                <div className="px-5 py-8 text-center text-neutral-500 text-sm">No pipeline activity this period</div>
              )}
              {rep.deals.map(deal => (
                <div key={deal.id} className={`flex items-center justify-between px-5 py-3 hover:bg-neutral-800/50 transition-colors ${
                  deal.status === "lost" ? "opacity-40" : ""
                }`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">{deal.name}</div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                      {deal.accountZohoId ? (
                        <Link href={`/account?id=${deal.accountZohoId}`} className="text-[10px] text-blue-400 hover:underline font-bold">
                          🏢 {deal.accountName}
                        </Link>
                      ) : (
                        <span className="text-[10px] text-neutral-400">🏢 {deal.accountName}</span>
                      )}
                      <span className="text-[10px] text-neutral-600">•</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stageColor(deal.stage)}`}>{deal.stage}</span>
                      <span className="text-[10px] text-neutral-600">•</span>
                      <span className="text-[10px] text-neutral-500">{fmtDate(deal.closeDate)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 ml-3 text-right">
                    <div className="text-[10px] text-neutral-500">Est. Value</div>
                    <div className="text-xs font-semibold text-blue-400">{fmt(deal.amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Performance Stats ──────────────────────────────────────────────────
function StatsTab({ data }: { data: CommData }) {
  // Top reps by commission earned
  const topReps = Object.values(data.byRep)
    .sort((a, b) => b.totalEarned - a.totalEarned)
    .slice(0, 10)

  // Top accounts by invoice amount
  const accountTotals: Record<string, number> = {}
  data.invoices.forEach(inv => {
    if (!accountTotals[inv.accountName]) accountTotals[inv.accountName] = 0
    accountTotals[inv.accountName] += inv.amount
  })
  const topAccounts = Object.entries(accountTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Reps */}
        <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
            <FiAward className="text-amber-400" size={15} />
            <h3 className="text-sm font-bold text-white">Top Reps by Commission</h3>
          </div>
          <div className="divide-y divide-neutral-800/60">
            {topReps.map((rep, i) => (
              <div key={rep.repId} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-neutral-500 w-4">{i + 1}</span>
                  <span className="text-xs font-semibold text-white">{rep.repName}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-emerald-400">{fmt(rep.totalEarned)}</div>
                  <div className="text-[10px] text-sky-400">Profit: {fmt(rep.totalProfit || 0)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Accounts */}
        <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
            <FiTrendingUp className="text-blue-400" size={15} />
            <h3 className="text-sm font-bold text-white">Top Accounts by Revenue</h3>
          </div>
          <div className="divide-y divide-neutral-800/60">
            {topAccounts.map(([name, total], i) => (
              <div key={name} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-neutral-500 w-4">{i + 1}</span>
                  <span className="text-xs font-semibold text-white truncate max-w-[140px]">{name}</span>
                </div>
                <span className="text-xs font-bold text-blue-400">{fmt(total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Commissions Page ──────────────────────────────────────────────
export default function CommissionsPage() {
  const { zohoContext: user } = useZoho()
  const [data, setData] = useState<CommData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"ledger" | "stats">("ledger")
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()))
  const [selectedRep, setSelectedRep] = useState<string>("")
  const [search, setSearch] = useState("")
  const [hideFulfilled, setHideFulfilled] = useState(false)
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
  const [viewingInvoiceZohoId, setViewingInvoiceZohoId] = useState<string | null>(null)
  const [managingPayoutsFor, setManagingPayoutsFor] = useState<RepSummary | null>(null)
  const [payoutAmount, setPayoutAmount] = useState("")
  const [payoutNotes, setPayoutNotes] = useState("")
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false)

  const isAdmin = user?.role?.toLowerCase().includes("admin") || user?.role === "Administrator"

  const handleAddPayout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!managingPayoutsFor || !payoutAmount || isNaN(Number(payoutAmount))) return
    
    setIsSubmittingPayout(true)
    try {
      const res = await fetch('/api/add-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repId: managingPayoutsFor.repId,
          amount: Number(payoutAmount),
          notes: payoutNotes
        })
      })
      const json = await res.json()
      if (json.success) {
        setPayoutAmount("")
        setPayoutNotes("")
        await fetchData() // refresh
        // Update local state for immediate feedback
        setManagingPayoutsFor(prev => {
          if (!prev) return prev
          return {
            ...prev,
            payouts: [json.payout, ...prev.payouts],
            totalPaid: prev.totalPaid + Number(payoutAmount),
            balance: prev.balance - Number(payoutAmount)
          }
        })
      } else {
        alert("Failed to add payout: " + json.error)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmittingPayout(false)
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedYear) params.set("year", selectedYear)
      if (selectedRep) params.set("repId", selectedRep)
      const res = await fetch(`/api/get-commissions?${params}`)
      const json = await res.json()
      if (json.success) {
        setData(json)
        if (!selectedYear && json.years?.[0]) setSelectedYear(String(json.years[0]))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedRep])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredByRep: Record<string, RepSummary> = {}
  if (data) {
    Object.entries(data.byRep).forEach(([id, rep]) => {
      // If not admin, only show current user's data
      if (!isAdmin && user?.id && id !== user.id && rep.repName !== user.name) return
      if (search && !rep.repName.toLowerCase().includes(search.toLowerCase())) return

      const filteredDeals = hideFulfilled
        ? rep.deals.filter(d => d.status !== "fulfilled")
        : rep.deals

      filteredByRep[id] = { ...rep, deals: filteredDeals }
    })
  }

  const totalOwed = Object.values(filteredByRep).reduce((s, r) => s + Math.max(0, r.totalEarned - r.totalPaid), 0)
  const totalEarned = Object.values(filteredByRep).reduce((s, r) => s + r.totalEarned, 0)
  const totalPaid = Object.values(filteredByRep).reduce((s, r) => s + r.totalPaid, 0)
  const totalProfit = Object.values(filteredByRep).reduce((s, r) => s + (r.totalProfit || 0), 0)

  const activeFiltersCount = (selectedRep ? 1 : 0) + (search ? 1 : 0) + (hideFulfilled ? 1 : 0)

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100%" }}>

      {/* Header */}
      <div className="flex-none px-5 py-3 border-b border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <FiDollarSign className="text-amber-400" /> Commission Hub
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">Commission ledger, payout tracking, performance stats</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white px-3 py-1.5 bg-neutral-800 rounded-lg transition-colors border border-neutral-700/60">
              <FiRefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* KPI strip */}
        {data && (
          <div className="flex items-center gap-6 mt-3 overflow-x-auto pb-1.5 scrollbar-none flex-nowrap">
            <div>
              <div className="text-[10px] text-neutral-500 uppercase font-semibold">Total Earned</div>
              <div className="text-lg font-bold text-emerald-400">{fmt(totalEarned)}</div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500 uppercase font-semibold">Total Profit</div>
              <div className="text-lg font-bold text-sky-400">{fmt(totalProfit)}</div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500 uppercase font-semibold">Paid Out</div>
              <div className="text-lg font-bold text-blue-400">{fmt(totalPaid)}</div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500 uppercase font-semibold">Balance Owed</div>
              <div className="text-lg font-bold text-amber-400">{fmt(totalOwed)}</div>
            </div>
            <div className="hidden sm:block">
              <div className="text-[10px] text-neutral-500 uppercase font-semibold">Total Revenue</div>
              <div className="text-lg font-bold text-white">{fmt(data.stats.totalRevenue)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Sub-nav */}
      <div className="flex-none px-5 py-2 border-b border-neutral-800 bg-neutral-900 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex bg-neutral-800 border border-neutral-800 rounded-lg p-0.5 gap-0.5">
          <button onClick={() => setActiveTab("ledger")} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${activeTab === "ledger" ? "bg-amber-600 text-white" : "text-neutral-400 hover:text-white"}`}>
            Ledger
          </button>
          <button onClick={() => setActiveTab("stats")} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${activeTab === "stats" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
            Performance
          </button>
        </div>

        {/* Filters Button */}
        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <button 
              onClick={() => {
                setSearch("")
                setSelectedRep("")
                setHideFulfilled(false)
              }}
              className="text-[10px] text-neutral-400 hover:text-white transition-colors"
            >
              Clear Filters
            </button>
          )}
          <button
            onClick={() => setShowFiltersDrawer(true)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-neutral-800 hover:bg-neutral-800 border rounded-lg transition-colors ${
              activeFiltersCount > 0 ? "text-amber-400 border-amber-500/40 bg-amber-950/10" : "text-neutral-300 border-neutral-700/60"
            }`}
          >
            <FiFilter size={13} />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 flex items-center justify-center bg-amber-600 text-white text-[9px] font-black rounded-full shrink-0">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Filters Popout Drawer ── */}
      {showFiltersDrawer && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-neutral-900 border-l border-neutral-800 p-6 flex flex-col shadow-2xl text-white z-[9999]">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-neutral-300">
                  <FiFilter className="text-amber-400" /> Filters
                </h2>
                <button onClick={() => setShowFiltersDrawer(false)} className="text-neutral-400 hover:text-white p-1.5 rounded-full bg-neutral-800 transition-colors">
                  <FiX size={15} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin">


                {/* Year Selection */}
                {data?.years && data.years.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Year</label>
                    <select 
                      value={selectedYear} 
                      onChange={e => setSelectedYear(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      {data.years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}

                {/* Representative selector (Admin only) */}
                {isAdmin && data?.users && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Representative</label>
                    <select 
                      value={selectedRep} 
                      onChange={e => setSelectedRep(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="">All Reps</option>
                      {data.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Hide Fulfilled */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Status Filter</label>
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer bg-neutral-800/40 border border-neutral-800 p-3 rounded-lg hover:bg-neutral-800/50">
                    <input 
                      type="checkbox" 
                      checked={hideFulfilled} 
                      onChange={e => setHideFulfilled(e.target.checked)}
                      className="rounded border-neutral-700 text-amber-600 focus:ring-amber-500 bg-neutral-800 focus:ring-offset-neutral-900"
                    />
                    <span>Hide Fulfilled / Paid Deals</span>
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-neutral-800 flex gap-3">
                <button 
                  onClick={() => {
                    setSearch("")
                    setSelectedRep("")
                    if (data?.years?.[0]) setSelectedYear(String(data.years[0]))
                    setHideFulfilled(false)
                    setShowFiltersDrawer(false)
                  }}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-800 border border-neutral-700/60 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors"
                >
                  Clear All
                </button>
                <button 
                  onClick={() => setShowFiltersDrawer(false)}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors"
                >
                  Apply
                </button>
              </div>
          </div>
        </div>,
        document.body
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-3">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading commissions...</span>
          </div>
        ) : !data ? (
          <div className="text-center text-neutral-500 mt-20">Failed to load commission data.</div>
        ) : activeTab === "ledger" ? (
          <div className="space-y-3">
            {Object.values(filteredByRep).length === 0 ? (
              <div className="text-center text-neutral-500 mt-20">No commission data found for the selected filters.</div>
            ) : (
              Object.values(filteredByRep)
                .sort((a, b) => b.totalEarned - a.totalEarned)
                .map(rep => (
                  <RepCard 
                    key={rep.repId} 
                    rep={rep} 
                    isAdmin={isAdmin} 
                    onViewInvoice={setViewingInvoiceZohoId} 
                    onManagePayouts={setManagingPayoutsFor}
                  />
                ))
            )}
          </div>
        ) : (
          <StatsTab data={data} />
        )}
      </div>

      {/* Invoice Details Modal */}
      {viewingInvoiceZohoId && (
        <InvoiceDetailsModal 
          invoice={viewingInvoiceZohoId} 
          onClose={() => setViewingInvoiceZohoId(null)} 
        />
      )}

      {/* ── Manage Payouts Modal ── */}
      {managingPayoutsFor && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setManagingPayoutsFor(null)} />
          <div className="relative bg-neutral-900 border border-neutral-850 w-full max-w-2xl h-[85vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl z-[10001]">
            <div className="bg-neutral-850 px-6 py-4 border-b border-neutral-800 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <FiDollarSign className="text-amber-500" /> Manage Payouts
                </h2>
                <p className="text-[10px] text-neutral-400 mt-0.5">For: <span className="font-bold text-white">{managingPayoutsFor.repName}</span></p>
              </div>
              <button onClick={() => setManagingPayoutsFor(null)} className="text-neutral-400 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-750 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg">
                &times;
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Form Side */}
              <div className="w-1/2 p-5 border-r border-neutral-800 bg-neutral-950 flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4">Add New Payout</h3>
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl mb-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-xs text-neutral-400">Total Earned</span>
                    <span className="text-xs font-bold text-emerald-400">{fmt(managingPayoutsFor.totalEarned)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs text-neutral-400">Total Paid</span>
                    <span className="text-xs font-bold text-blue-400">{fmt(managingPayoutsFor.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-800 pt-2 mt-2">
                    <span className="text-xs font-bold text-neutral-300">Balance Owed</span>
                    <span className={`text-xs font-bold ${managingPayoutsFor.balance > 0 ? 'text-amber-400' : 'text-neutral-400'}`}>
                      {fmt(managingPayoutsFor.balance)}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleAddPayout} className="space-y-4 flex-1">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Amount ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={payoutAmount}
                      onChange={e => setPayoutAmount(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                      placeholder="e.g. 5000.00"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Notes / Check # (Optional)</label>
                    <textarea 
                      value={payoutNotes}
                      onChange={e => setPayoutNotes(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 h-24 resize-none"
                      placeholder="Check #1042..."
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isSubmittingPayout || !payoutAmount}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white font-bold py-2 rounded-lg transition-colors"
                  >
                    {isSubmittingPayout ? "Saving..." : "Save Payout"}
                  </button>
                </form>
              </div>

              {/* History Side */}
              <div className="w-1/2 p-0 flex flex-col bg-neutral-900">
                <div className="p-4 border-b border-neutral-800 bg-neutral-850">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Payout History</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
                  {!managingPayoutsFor.payouts || managingPayoutsFor.payouts.length === 0 ? (
                    <div className="text-center text-neutral-500 italic mt-10 text-sm">No payouts recorded yet.</div>
                  ) : (
                    managingPayoutsFor.payouts.map(p => (
                      <div key={p.id} className="bg-neutral-800/60 border border-neutral-800 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-1">
                          <div className="text-sm font-bold text-emerald-400">{fmt(p.amount)}</div>
                          <div className="text-[10px] text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                            {new Date(p.date).toLocaleDateString()}
                          </div>
                        </div>
                        {p.notes && <div className="text-xs text-neutral-400 mt-2 bg-neutral-900/50 p-2 rounded border border-neutral-800/50">{p.notes}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
