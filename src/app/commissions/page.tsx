"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useZoho } from "@/components/ZohoProvider"
import { usePagination, Pagination } from "@/components/Pagination"
import { FiDollarSign, FiRefreshCw, FiChevronDown, FiChevronUp, FiTrendingUp, FiUsers, FiBarChart2, FiAward, FiFilter, FiX, FiSearch, FiFileText } from "react-icons/fi"

// ── Types ──────────────────────────────────────────────────────────────
type Deal = {
  id: string
  name: string
  stage: string
  amount: number
  profit?: number
  deadCost?: number
  closeDate: string | null
  repId: string
  repName: string
  accountName: string
  accountZohoId?: string | null
  commission: { total: number; upfront: number; final: number }
  status: "pending" | "fulfilled" | "lost"
  invoiceZohoId?: string | null
}

type RepSummary = {
  repId: string
  repName: string
  deals: Deal[]
  totalEarned: number
  totalPaid: number
  totalProfit?: number
  balance: number
}

type CommData = {
  deals: Deal[]
  byRep: Record<string, RepSummary>
  users: any[]
  years: number[]
  stats: { totalDeals: number; totalRevenue: number; totalCommissions: number; totalProfit?: number }
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0)
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
function RepCard({ rep, isAdmin, onViewInvoice }: { rep: RepSummary; isAdmin: boolean; onViewInvoice: (zohoId: string) => void }) {
  const [open, setOpen] = useState(false)
  const balance = rep.totalEarned - rep.totalPaid
  const pendingDeals = rep.deals.filter(d => d.status === "pending")
  const fulfilledDeals = rep.deals.filter(d => d.status === "fulfilled")
  const pagination = usePagination(rep.deals)

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
            <div className="text-[10px] text-neutral-500">{rep.deals.length} deals · {pendingDeals.length} pending</div>
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

      {/* Deals list */}
      {open && (
        <div className="border-t border-neutral-800">
          {/* Mini stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-neutral-800 border-b border-neutral-800">
            {[
              { label: "Total Profit", value: fmt(rep.totalProfit || 0), color: "text-sky-400" },
              { label: "Total Earned", value: fmt(rep.totalEarned), color: "text-emerald-400" },
              { label: "Paid Out", value: fmt(rep.totalPaid), color: "text-blue-400" },
              { label: "Balance", value: fmt(balance), color: balance > 0 ? "text-amber-400" : "text-neutral-400" },
            ].map(s => (
              <div key={s.label} className="px-4 py-3 text-center">
                <div className="text-[10px] text-neutral-500 uppercase font-semibold">{s.label}</div>
                <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Deal rows */}
          <div className="divide-y divide-neutral-800/60">
            {pagination.paginatedItems.map(deal => {
              const hasInvoice = !!deal.invoiceZohoId
              return (
                <div 
                  key={deal.id}
                  onClick={() => hasInvoice && onViewInvoice && onViewInvoice(deal.invoiceZohoId!)}
                  className={`flex items-center justify-between px-5 py-3 transition-colors ${
                    hasInvoice ? "hover:bg-neutral-800 cursor-pointer" : ""
                  } ${deal.status === "lost" ? "opacity-40" : ""}`}
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2.5">
                    {hasInvoice && (
                      <FiFileText className="text-amber-500 shrink-0 text-sm" title="Attached Zoho Invoice available" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{deal.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                        {deal.accountZohoId ? (
                          <Link 
                            href={`/account?id=${deal.accountZohoId}`}
                            className="text-[10px] text-emerald-400 hover:underline font-bold"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-3">
                    <div className="text-right hidden sm:block">
                      <div className="text-[10px] text-neutral-500">Deal</div>
                      <div className="text-xs font-semibold text-white">{fmt(deal.amount)}</div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="text-[10px] text-neutral-500">Profit</div>
                      <div className={`text-xs font-semibold ${deal.status === "lost" ? "text-neutral-500" : "text-sky-400"}`}>
                        {fmt(deal.profit || 0)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-neutral-500">Commission</div>
                      <div className={`text-xs font-bold ${deal.status === "lost" ? "text-neutral-500" : "text-emerald-400"}`}>
                        {fmt(deal.commission.total)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-neutral-500">Status</div>
                      <div className={`text-[10px] font-bold uppercase ${
                        deal.status === "fulfilled" ? "text-blue-400" :
                        deal.status === "lost" ? "text-red-400" : "text-amber-400"
                      }`}>{deal.status}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {pagination.pageSize !== "All" && rep.deals.length > (pagination.pageSize as number) && (
            <Pagination
              currentPage={pagination.currentPage}
              pageSize={pagination.pageSize}
              totalItems={rep.deals.length}
              onPageChange={pagination.setCurrentPage}
              onPageSizeChange={pagination.setPageSize}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Performance Stats ──────────────────────────────────────────────────
function StatsTab({ data }: { data: CommData }) {
  // Top reps by revenue
  const topReps = Object.values(data.byRep)
    .sort((a, b) => b.totalEarned - a.totalEarned)
    .slice(0, 10)

  // Top accounts by deal amount
  const accountTotals: Record<string, number> = {}
  data.deals.forEach(d => {
    if (!accountTotals[d.accountName]) accountTotals[d.accountName] = 0
    accountTotals[d.accountName] += d.amount
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
  const [selectedYear, setSelectedYear] = useState<string>("")
  const [selectedRep, setSelectedRep] = useState<string>("")
  const [search, setSearch] = useState("")
  const [hideFulfilled, setHideFulfilled] = useState(false)
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
  const [viewingInvoiceZohoId, setViewingInvoiceZohoId] = useState<string | null>(null)

  const isAdmin = user?.role?.toLowerCase().includes("admin") || user?.role === "Administrator"

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
                {/* Search Rep */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Search Rep Name</label>
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                    <input 
                      value={search} 
                      onChange={e => setSearch(e.target.value)} 
                      placeholder="Search sales representative..."
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500" 
                    />
                  </div>
                </div>

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
                  />
                ))
            )}
          </div>
        ) : (
          <StatsTab data={data} />
        )}
      </div>

      {/* ── Invoice PDF Modal ── */}
      {viewingInvoiceZohoId && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setViewingInvoiceZohoId(null)} />
          <div className="relative bg-neutral-900 border border-neutral-850 w-full max-w-5xl h-[85vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl z-[10001]">
            {/* Header */}
            <div className="bg-neutral-850 px-6 py-4 border-b border-neutral-800 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <FiFileText className="text-amber-500" /> Invoice PDF Preview
                </h2>
                <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">Zoho ID: {viewingInvoiceZohoId}</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/get-invoice-pdf?id=${viewingInvoiceZohoId}&download=true`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-neutral-700 flex items-center gap-1.5 cursor-pointer"
                >
                  Download PDF
                </a>
                <button 
                  onClick={() => setViewingInvoiceZohoId(null)} 
                  className="text-neutral-400 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-750 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Iframe container */}
            <div className="flex-1 bg-neutral-950 p-2 relative">
              <iframe
                src={`/api/get-invoice-pdf?id=${viewingInvoiceZohoId}`}
                className="w-full h-full border-0 rounded-lg bg-neutral-900"
                title="Invoice PDF Preview"
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
