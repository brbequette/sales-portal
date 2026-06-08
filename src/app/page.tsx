"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { StatusPicker } from "@/components/StatusPicker"
import { Pagination, usePagination } from "@/components/Pagination"
import { FiSearch, FiClock, FiDollarSign, FiUsers, FiTrendingUp, FiUser, FiChevronRight, FiCheckCircle, FiFileText, FiPhoneCall, FiMail, FiMessageSquare, FiMenu, FiX, FiRefreshCw, FiFilter } from "react-icons/fi"

export default function Dashboard() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [accounts, setAccounts] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [industryFilter, setIndustryFilter] = useState("All")
  const [mobileTab, setMobileTab] = useState<"accounts" | "tasks">("accounts")
  const [menuOpen, setMenuOpen] = useState(false)
  const [drillTitle, setDrillTitle] = useState("")
  const [drillItems, setDrillItems] = useState<any[] | null>(null)
  const [drillType, setDrillType] = useState<"invoices" | "deals" | "accounts" | null>(null)
  const [effort, setEffort] = useState<"sales" | "reactivation">("sales")
  const [ownerFilter, setOwnerFilter] = useState("All")
  const [onlyWithSales, setOnlyWithSales] = useState(false)
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }

    const fetchData = async () => {
      try {
        const query = currentUser.id && !currentUser.id.includes("@")
          ? `zohoId=${currentUser.id}`
          : `email=${currentUser.email}`

        const [resAccounts, resTasks] = await Promise.all([
          fetch(`/api/get-accounts?${query}`),
          fetch(`/api/get-tasks?${query}`),
        ])
        const dataAccounts = await resAccounts.json()
        const dataTasks = await resTasks.json()

        if (dataAccounts.success) setAccounts(dataAccounts.accounts)
        else setApiError(dataAccounts.error || dataAccounts.message)
        if (dataTasks.success) setTasks(dataTasks.tasks)
      } catch (err: any) {
        setApiError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [isInitialized, currentUser, router])

  const handleEffortChange = (val: "sales" | "reactivation") => {
    setEffort(val)
    setStatusFilter("All")
    setSearchQuery("")
    setOwnerFilter("All")
    setOnlyWithSales(false)
  }

  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      const query = currentUser.id && !currentUser.id.includes("@")
        ? `zohoId=${currentUser.id}`
        : `email=${currentUser.email}`
      
      const [resAccounts, resTasks] = await Promise.all([
        fetch(`/api/get-accounts?${query}&refresh=true`),
        fetch(`/api/get-tasks?${query}`),
      ])
      const dataAccounts = await resAccounts.json()
      const dataTasks = await resTasks.json()

      if (dataAccounts.success) setAccounts(dataAccounts.accounts)
      else setApiError(dataAccounts.error || dataAccounts.message)
      if (dataTasks.success) setTasks(dataTasks.tasks)
    } catch (err: any) {
      setApiError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleCompleteTask = async (task: any) => {
    try {
      const res = await fetch("/api/update-task", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, zohoId: task.zohoId, status: "Completed" })
      })
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== task.id))
      } else {
        const data = await res.json()
        setApiError(data.error || data.message || "Failed to complete task")
      }
    } catch (err: any) {
      setApiError(err.message)
    }
  }

  // ── Separation Logic ──
  const isAdminUser = currentUser?.role?.toLowerCase().includes("admin") || currentUser?.role === "Administrator"

  const owners = Array.from(
    new Map(
      accounts
        .map(a => a.owner)
        .filter(Boolean)
        .map((o: any) => [o.id, o])
    ).values()
  ) as any[]

  const activeAccounts = accounts.filter(a => a.status !== "Update Status")
  const reactivationAccounts = accounts.filter(a => a.status === "Update Status")

  const filteredByOwnerActive = activeAccounts.filter(a => ownerFilter === "All" || a.ownerId === ownerFilter)
  const filteredByOwnerReactivation = reactivationAccounts.filter(a => ownerFilter === "All" || a.ownerId === ownerFilter)

  const effortAccounts = effort === "sales" ? filteredByOwnerActive : filteredByOwnerReactivation
  const effortTasks = tasks
    .filter(t => t.type === (effort === "sales" ? "DEAL_FOLLOWUP" : "ACCOUNT_UPDATE"))
    .filter(t => ownerFilter === "All" || t.ownerId === ownerFilter)

  // Compute LTV for Sales Pipeline (filtered by owner)
  const activeLtv = filteredByOwnerActive.reduce((sum, a) => {
    return sum + (a.invoices || []).reduce((s: number, i: any) => s + (parseFloat(i.amount) || 0), 0)
  }, 0)

  // Compute Profit for Sales Pipeline (filtered by owner)
  const activeProfit = filteredByOwnerActive.reduce((sum, a) => {
    return sum + (a.invoices || []).reduce((s: number, i: any) => s + (parseFloat(i.items?.profit || 0)), 0)
  }, 0)

  // Compute Overdue Balance for Reactivation Desk (filtered by owner)
  const totalOverdueBalance = filteredByOwnerReactivation.reduce((sum, a) => {
    return sum + (a.invoices || []).reduce((s: number, i: any) => {
      if (i.status === "Overdue") {
        const balance = typeof i.items === "object" && i.items !== null && "balance" in i.items
          ? parseFloat((i.items as any).balance)
          : parseFloat(i.amount || 0);
        return s + (isNaN(balance) ? 0 : balance);
      }
      return s;
    }, 0);
  }, 0)

  const allStatuses = Array.from(new Set(effortAccounts.map(a => a.status).filter(Boolean))) as string[]
  const allIndustries = Array.from(new Set(effortAccounts.map(a => a.industry).filter(Boolean))) as string[]

  const filteredAccounts = effortAccounts.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (a.zohoId && a.zohoId.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesStatus = statusFilter === "All" || a.status === statusFilter
    const matchesIndustry = industryFilter === "All" || a.industry === industryFilter
    
    const ltv = (a.invoices || []).reduce((sum: number, inv: any) => sum + (parseFloat(inv.amount) || 0), 0)
    const matchesSalesFilter = !onlyWithSales || ltv > 0

    return matchesSearch && matchesStatus && matchesIndustry && matchesSalesFilter
  })

  const accountsPagination = usePagination(filteredAccounts, 25)
  const tasksPagination = usePagination(effortTasks, 25)
  const drillPagination = usePagination(drillItems || [], 25)

  // Effort Metrics Config
  const metrics = effort === "sales" ? [
    { id: "revenue", label: "Pipeline Revenue", value: activeLtv >= 1000000 ? `$${(activeLtv / 1000000).toFixed(1)}M` : `$${(activeLtv / 1000).toFixed(1)}k`, sub: "Active accounts LTV", icon: <FiTrendingUp />, color: "text-emerald-400" },
    { id: "profit", label: "Pipeline Profit", value: activeProfit >= 1000000 ? `$${(activeProfit / 1000000).toFixed(1)}M` : `$${(activeProfit / 1000).toFixed(1)}k`, sub: "Pipeline margin", icon: <FiTrendingUp />, color: "text-sky-400" },
    { id: "deals", label: "Open Deals", value: effortTasks.length, sub: "Needs follow-up", icon: <FiDollarSign />, color: "text-blue-400" },
    { id: "accounts", label: "Active Accounts", value: filteredByOwnerActive.length, sub: "In pipeline", icon: <FiUsers />, color: "text-teal-400" },
  ] : [
    { id: "revenue", label: "Overdue Balance", value: totalOverdueBalance >= 1000000 ? `$${(totalOverdueBalance / 1000000).toFixed(1)}M` : `$${(totalOverdueBalance / 1000).toFixed(1)}k`, sub: "Unpaid collections", icon: <FiDollarSign />, color: "text-rose-400" },
    { id: "deals", label: "Target Accounts", value: filteredByOwnerReactivation.length, sub: "Inactive >12 months", icon: <FiUsers />, color: "text-amber-400" },
    { id: "followups", label: "Reactivation Tasks", value: effortTasks.length, sub: "Updates needed", icon: <FiClock />, color: "text-orange-400" },
  ]

  const accentColor = effort === "sales" ? "emerald" : "amber"
  const activeFilterCount = (ownerFilter !== "All" ? 1 : 0) + (statusFilter !== "All" ? 1 : 0) + (industryFilter !== "All" ? 1 : 0) + (onlyWithSales ? 1 : 0)

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Sales Hub...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans overflow-y-auto" style={{ height: "100%" }}>

      {/* ── Main scrollable content ── */}
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4 overflow-y-auto safe-bottom">

        {apiError && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
            <strong>Error:</strong> {apiError}
          </div>
        )}

        {/* ── Workspace / Effort Selector Switcher ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => handleEffortChange("sales")}
            className={`relative overflow-hidden rounded-2xl p-4 text-left border transition-all duration-300 ${
              effort === "sales"
                ? "bg-gradient-to-br from-emerald-950/40 to-neutral-900/20 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)] text-white"
                : "bg-neutral-950/20 border-neutral-800/80 hover:border-neutral-700 text-neutral-400"
            }`}
          >
            {effort === "sales" && (
              <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
            )}
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border transition-colors ${
                effort === "sales"
                  ? "bg-emerald-950 border-emerald-500/30 text-emerald-400"
                  : "bg-neutral-800 border-neutral-700 text-neutral-500"
              }`}>
                <FiTrendingUp size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Active Sales Pipeline</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Manage active pipeline and deals</p>
              </div>
              <div className="ml-auto shrink-0 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {filteredByOwnerActive.length}
              </div>
            </div>
          </button>

          <button
            onClick={() => handleEffortChange("reactivation")}
            className={`relative overflow-hidden rounded-2xl p-4 text-left border transition-all duration-300 ${
              effort === "reactivation"
                ? "bg-gradient-to-br from-amber-950/30 to-neutral-900/20 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.08)] text-white"
                : "bg-neutral-950/20 border-neutral-800/80 hover:border-neutral-700 text-neutral-400"
            }`}
          >
            {effort === "reactivation" && (
              <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-amber-400 animate-ping"></div>
            )}
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border transition-colors ${
                effort === "reactivation"
                  ? "bg-amber-950 border-amber-500/30 text-amber-400"
                  : "bg-neutral-800 border-neutral-700 text-neutral-500"
              }`}>
                <FiClock size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Status Reactivation Desk</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Dormant accounts & collections</p>
              </div>
              <div className="ml-auto shrink-0 flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-xs font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {filteredByOwnerReactivation.length}
              </div>
            </div>
          </button>
        </div>

        {/* Metrics row */}
        <div className={`grid gap-2 sm:gap-3 ${effort === "sales" ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
          {metrics.map(m => (
            <div key={m.label} className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-800 cursor-pointer hover:bg-neutral-800 transition-all duration-200 hover:scale-[1.01]" onClick={() => {
              if (effort === "sales") {
                if (m.id === "revenue") {
                  const allInvoices = filteredByOwnerActive.flatMap(a => (a.invoices || []).map((i: any) => ({ ...i, accountName: a.name })))
                  setDrillType("invoices")
                  setDrillTitle("Active Pipeline Invoices")
                  setDrillItems(allInvoices)
                } else if (m.id === "profit") {
                  const allInvoices = filteredByOwnerActive.flatMap(a => (a.invoices || []).map((i: any) => ({ ...i, accountName: a.name })))
                  setDrillType("invoices")
                  setDrillTitle("Active Pipeline Invoices (Profit)")
                  setDrillItems(allInvoices)
                } else if (m.id === "deals") {
                  setDrillType("deals")
                  setDrillTitle("Active Open Deals")
                  setDrillItems(effortTasks)
                } else if (m.id === "accounts") {
                  setDrillType("accounts")
                  setDrillTitle("Active Sales Accounts")
                  setDrillItems(filteredByOwnerActive)
                }
              } else {
                if (m.id === "revenue") {
                  const allOverdueInvoices = filteredByOwnerReactivation.flatMap(a => (a.invoices || []).filter((i: any) => i.status === "Overdue").map((i: any) => ({ ...i, accountName: a.name })))
                  setDrillType("invoices")
                  setDrillTitle("Overdue Reactivation Invoices")
                  setDrillItems(allOverdueInvoices)
                } else if (m.id === "deals") {
                  setDrillType("accounts")
                  setDrillTitle("Reactivation Target Accounts")
                  setDrillItems(filteredByOwnerReactivation)
                } else if (m.id === "followups") {
                  setDrillType("deals")
                  setDrillTitle("Reactivation Tasks")
                  setDrillItems(effortTasks)
                }
              }
            }}>
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">{m.label}</span>
                <span className={`text-xs ${m.color}`}>{m.icon}</span>
              </div>
              <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Mobile tab switcher */}
        <div className="flex sm:hidden bg-neutral-800 rounded-lg p-0.5 gap-0.5">
          <button onClick={() => setMobileTab("accounts")} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mobileTab === "accounts" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}>
            Accounts ({filteredAccounts.length})
          </button>
          <button onClick={() => setMobileTab("tasks")} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mobileTab === "tasks" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}>
            Tasks ({effortTasks.length})
          </button>
        </div>

        {/* ── Main 2-col grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Accounts list — full width on mobile, hidden when tasks tab active */}
          <div className={`lg:col-span-2 space-y-3 ${mobileTab === "tasks" ? "hidden sm:block" : ""}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white whitespace-nowrap flex items-center gap-2">
                {effort === "sales" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>{currentUser?.role?.toLowerCase().includes("admin") || currentUser?.role === "Administrator" ? "All Active Accounts" : "My Active Accounts"}</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>{currentUser?.role?.toLowerCase().includes("admin") || currentUser?.role === "Administrator" ? "All Inactive Accounts" : "My Inactive Accounts"}</span>
                  </>
                )}
              </h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-48">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                  <input
                    type="text"
                    placeholder="Search accounts..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className={`w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none ${effort === "sales" ? "focus:border-emerald-500" : "focus:border-amber-500"} text-white placeholder-neutral-600`}
                  />
                </div>
                <button
                  onClick={() => setShowFiltersDrawer(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors cursor-pointer relative"
                >
                  <FiFilter size={12} className={activeFilterCount > 0 ? (effort === "sales" ? "text-emerald-400" : "text-amber-400") : ""} />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black ${
                      effort === "sales" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}>
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all duration-200 ${
                    effort === "sales"
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40"
                      : "text-amber-400 border-amber-500/30 bg-amber-950/20 hover:bg-amber-950/40"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <FiRefreshCw size={12} className={syncing ? "animate-spin" : ""} />
                  <span>{syncing ? "Syncing..." : "Sync CRM"}</span>
                </button>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Active Filters:</span>
                {ownerFilter !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-neutral-300">
                    Rep: {owners.find(o => o.id === ownerFilter)?.name || ownerFilter}
                    <button onClick={() => setOwnerFilter("All")} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                {statusFilter !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-neutral-300">
                    Status: {statusFilter}
                    <button onClick={() => setStatusFilter("All")} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                {industryFilter !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-neutral-300">
                    Industry: {industryFilter}
                    <button onClick={() => setIndustryFilter("All")} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                {onlyWithSales && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-neutral-300">
                    Has Purchases
                    <button onClick={() => setOnlyWithSales(false)} className="text-neutral-500 hover:text-white"><FiX size={12} /></button>
                  </span>
                )}
                <button 
                  onClick={() => {
                    setOwnerFilter("All")
                    setStatusFilter("All")
                    setIndustryFilter("All")
                    setOnlyWithSales(false)
                  }}
                  className="text-[10px] uppercase font-bold text-neutral-500 hover:text-neutral-300 ml-1 transition-colors"
                >
                  Clear All
                </button>
              </div>
            )}

            <div className={`bg-neutral-800/30 rounded-xl border overflow-hidden transition-all duration-300 ${
              effort === "sales" ? "border-neutral-800" : "border-amber-900/20"
            }`}>
              {filteredAccounts.length === 0 ? (
                <div className="p-8 text-center">
                  <FiUsers className="mx-auto text-3xl text-neutral-700 mb-2" />
                  <p className="text-neutral-400 text-sm">No accounts found.</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  <ul className="divide-y divide-neutral-800">
                    {accountsPagination.paginatedItems.map(account => {
                    const invoices = account.invoices || []
                    const ltv = invoices.reduce((sum: number, inv: any) => sum + (parseFloat(inv.amount) || 0), 0)
                    const overdueCount = invoices.filter((inv: any) => inv.status === "Overdue").length
                    
                    const overdueBalance = invoices.reduce((sum: number, inv: any) => {
                      if (inv.status === "Overdue") {
                        const balance = typeof inv.items === "object" && inv.items !== null && "balance" in inv.items
                          ? parseFloat((inv.items as any).balance)
                          : parseFloat(inv.amount || 0);
                        return sum + (isNaN(balance) ? 0 : balance);
                      }
                      return sum;
                    }, 0);

                    const primaryContact = account.contacts?.find((c: any) => c.isPrimary) || account.contacts?.[0]
                    const cleanPhone = primaryContact?.phone ? primaryContact.phone.replace(/[^0-9+]/g, '') : ''

                    const daysSinceLastPurchase = account.lastPurchaseAt
                      ? Math.floor((Date.now() - new Date(account.lastPurchaseAt).getTime()) / 86400000)
                      : null

                    let activityLabel = "No purchases"
                    let activityColor = "text-neutral-500"
                    if (daysSinceLastPurchase !== null) {
                      if (daysSinceLastPurchase > 365) {
                        activityLabel = `${(daysSinceLastPurchase / 365).toFixed(1)}y inactive`
                        activityColor = "text-amber-500"
                      } else {
                        activityLabel = `${daysSinceLastPurchase}d since purchase`
                        activityColor = "text-emerald-500"
                      }
                    }

                    return (
                      <li key={account.id} className="hover:bg-neutral-800/50 transition-colors">
                        <div className="flex items-center justify-between px-4 py-3.5 gap-4">
                          {/* Left Side: Avatar & Basic Info */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Link href={`/account?id=${account.zohoId}`} className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300 font-bold text-sm border border-neutral-700 shrink-0 hover:border-emerald-500 transition-colors">
                              {account.name.charAt(0)}
                            </Link>
                            <div className="min-w-0">
                              <Link href={`/account?id=${account.zohoId}`} className="text-sm font-bold text-white truncate block hover:text-emerald-400 transition-colors">{account.name}</Link>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">{account.tags || "General"}</span>
                                {account.status === "Update Status" && (
                                  <span className="text-[10px] text-orange-400 bg-orange-950/30 px-1.5 py-0.5 rounded border border-orange-500/20 font-bold uppercase tracking-wider">
                                    Update Account
                                  </span>
                                )}
                                <StatusPicker
                                  zohoId={account.zohoId}
                                  accountId={account.id}
                                  currentStatus={account.status || "Open"}
                                  compact
                                  onUpdated={(newStatus) => {
                                    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: newStatus } : a))
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Middle Side: Sales Metrics & Invoice Counts */}
                          <div className="hidden sm:flex flex-col text-right shrink-0 min-w-[140px]">
                            {effort === "sales" ? (
                              <>
                                <p className="text-sm font-bold text-emerald-400">
                                  ${ltv >= 1000000 ? `${(ltv / 1000000).toFixed(1)}M` : ltv >= 1000 ? `${(ltv / 1000).toFixed(1)}k` : ltv.toFixed(0)} LTV
                                </p>
                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                  <span className="text-[10px] text-neutral-400">{invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}</span>
                                  {overdueCount > 0 && (
                                    <span className="text-[9px] bg-red-950/80 text-red-400 border border-red-900/50 px-1 rounded font-bold uppercase">
                                      {overdueCount} Overdue
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-bold text-rose-400">
                                  ${overdueBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} Overdue
                                </p>
                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                  <span className="text-[10px] text-neutral-400">{overdueCount} overdue invoice{overdueCount === 1 ? '' : 's'}</span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Right Side: Actions */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right hidden md:block">
                              <p className={`text-xs font-semibold ${activityColor}`}>{activityLabel}</p>
                              <p className="text-[10px] text-neutral-500 mt-0.5">{account.industry || "Unknown Industry"}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {cleanPhone ? (
                                <a href={`tel:${cleanPhone}`} className="p-1.5 bg-neutral-800 hover:bg-blue-600 rounded-full text-neutral-400 hover:text-white transition-colors" title="Call">
                                  <FiPhoneCall size={12} />
                                </a>
                              ) : (
                                <button className="p-1.5 bg-neutral-800 rounded-full text-neutral-400 opacity-40 cursor-not-allowed" disabled>
                                  <FiPhoneCall size={12} />
                                </button>
                              )}
                              <button onClick={() => { window.location.href = `/account?id=${account.zohoId}#comms` }} className="p-1.5 bg-neutral-800 hover:bg-emerald-600 rounded-full text-neutral-400 hover:text-white transition-colors hidden sm:flex" title="Message">
                                <FiMessageSquare size={12} />
                              </button>
                              <Link href={`/account?id=${account.zohoId}`} className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-full text-neutral-500 hover:text-white transition-colors">
                                <FiChevronRight size={14} />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                  </ul>
                  <Pagination 
                    currentPage={accountsPagination.currentPage}
                    pageSize={accountsPagination.pageSize}
                    totalItems={filteredAccounts.length}
                    onPageChange={accountsPagination.setCurrentPage}
                    onPageSizeChange={accountsPagination.setPageSize}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tasks — stacks below on mobile, column on desktop */}
          <div className={`space-y-3 ${mobileTab === "accounts" ? "hidden sm:block" : ""}`}>
            <div className="flex items-center gap-2">
              <FiCheckCircle className={effort === "sales" ? "text-emerald-500" : "text-amber-500"} size={16} />
              <h2 className="text-base font-bold text-white">
                {effort === "sales" ? "Pipeline Tasks" : "Reactivation Tasks"}
              </h2>
              {effortTasks.length > 0 && (
                <span className={`ml-auto text-[10px] border px-2 py-0.5 rounded-full font-bold transition-all duration-300 ${
                  effort === "sales"
                    ? "bg-emerald-900/40 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-900/40 text-amber-400 border-amber-500/20"
                }`}>
                  {effortTasks.length} pending
                </span>
              )}
            </div>

            <div className="bg-neutral-800/30 rounded-xl border border-neutral-800 p-3">
              {effortTasks.length === 0 ? (
                <div className="text-center py-6">
                  <FiCheckCircle className={`mx-auto text-2xl ${effort === "sales" ? "text-emerald-500" : "text-amber-500"} mb-2`} />
                  <p className="text-neutral-300 font-bold text-sm">All caught up!</p>
                  <p className="text-xs text-neutral-500">No pending follow-ups.</p>
                </div>
              ) : (
                <div className="flex flex-col space-y-0">
                  <div className="space-y-2 p-3">
                    {tasksPagination.paginatedItems.map(task => (
                    <div key={task.id} className="bg-neutral-900/50 border border-neutral-700 rounded-lg p-3 hover:border-emerald-500/40 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          task.type === "DEAL_FOLLOWUP" ? "bg-blue-900/40 text-blue-400" : "bg-amber-900/40 text-amber-400"
                        }`}>
                          {task.type.replace("_", " ")}
                        </span>
                        <button 
                           onClick={() => handleCompleteTask(task)} 
                           className="text-[10px] font-bold bg-neutral-800 hover:bg-emerald-900/40 text-neutral-400 hover:text-emerald-400 border border-neutral-700 hover:border-emerald-500/50 rounded px-2 py-0.5 transition-colors"
                        >
                           Complete
                        </button>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1 leading-tight">{task.title}</h4>
                      <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">{task.description}</p>
                      <Link
                        href={`/account?id=${task.accountId}`}
                        className={`inline-flex items-center text-xs font-bold transition-colors mt-2 ${
                          effort === "sales" ? "text-emerald-500 hover:text-emerald-400" : "text-amber-500 hover:text-amber-400"
                        }`}
                      >
                        Open Account <FiChevronRight className="ml-0.5" size={12} />
                      </Link>
                    </div>
                  ))}
                  </div>
                  <Pagination 
                    currentPage={tasksPagination.currentPage}
                    pageSize={tasksPagination.pageSize}
                    totalItems={effortTasks.length}
                    onPageChange={tasksPagination.setCurrentPage}
                    onPageSizeChange={tasksPagination.setPageSize}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {drillItems && drillType && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setDrillItems(null)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-neutral-800">
              <h3 className="text-white font-bold text-lg">{drillTitle}</h3>
              <button onClick={() => setDrillItems(null)} className="text-neutral-500 hover:text-white transition-colors bg-neutral-800 p-1.5 rounded-full">
                <FiX size={18} />
              </button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              {drillItems.length === 0 ? (
                <p className="text-neutral-500 text-sm text-center py-4">No data available.</p>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="space-y-3 flex-1">
                    {drillPagination.paginatedItems.map((item, idx) => (
                <div key={idx} className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-800">
                  {drillType === "invoices" && (
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-white text-sm font-bold">{item.accountName}</p>
                        <p className="text-neutral-400 text-xs mt-0.5">#{((item.items as any)?.invoiceNumber) || item.zohoId?.slice(-6) || item.id?.slice(-6) || "—"} • {new Date(item.issueDate).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-bold text-sm">${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {item.items?.profit !== undefined && (
                          <p className="text-[10px] text-sky-400 font-semibold mt-0.5">Profit: ${parseFloat(item.items.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        )}
                        <p className={`text-[10px] mt-0.5 ${item.status === 'Paid' ? 'text-blue-400' : 'text-amber-400'}`}>{item.status}</p>
                      </div>
                    </div>
                  )}
                  {drillType === "deals" && (
                    <div>
                      <p className="text-white text-sm font-bold">{item.title}</p>
                      <p className="text-neutral-400 text-xs mt-0.5">{item.description}</p>
                    </div>
                  )}
                  {drillType === "accounts" && (
                    <div className="flex justify-between items-center">
                      <p className="text-white text-sm font-bold">{item.name}</p>
                      <Link href={`/account?id=${item.zohoId}`} onClick={() => setDrillItems(null)} className="text-emerald-400 text-xs hover:underline flex items-center gap-1">
                        View <FiChevronRight />
                      </Link>
                    </div>
                  )}
                </div>
              ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Filters Popup Modal (portaled to body) ── */}
      {showFiltersDrawer && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
          <div className="relative w-full max-w-md max-h-[85vh] bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col shadow-2xl text-white z-[9999] overflow-hidden">
            <div className="p-6 flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-neutral-300">
                  <FiFilter className={effort === "sales" ? "text-emerald-400" : "text-amber-400"} /> Filters
                </h2>
                <button onClick={() => setShowFiltersDrawer(false)} className="text-neutral-400 hover:text-white p-1.5 rounded-full bg-neutral-800 transition-colors">
                  <FiX size={15} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin">
                {/* Search query inside drawer */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Customer Name / ID</label>
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                    <input 
                      value={searchQuery} 
                      onChange={e => setSearchQuery(e.target.value)} 
                      placeholder="Search accounts..."
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500" 
                    />
                  </div>
                </div>

                {/* Sales rep selector (Admin user only) */}
                {isAdminUser && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Sales Representative</label>
                    <select 
                      value={ownerFilter} 
                      onChange={e => setOwnerFilter(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="All">All Representatives</option>
                      {owners.map(o => <option key={o.id} value={o.id}>{o.name || o.email}</option>)}
                    </select>
                  </div>
                )}

                {/* Status selector (only active for sales pipeline effort) */}
                {effort === "sales" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Pipeline Status</label>
                    <select 
                      value={statusFilter} 
                      onChange={e => setStatusFilter(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {/* Industry selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Industry</label>
                  <select 
                    value={industryFilter} 
                    onChange={e => setIndustryFilter(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="All">All Industries</option>
                    {allIndustries.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>

                {/* Checkbox filters */}
                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 text-xs font-semibold text-neutral-300 cursor-pointer select-none bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 hover:border-neutral-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={onlyWithSales}
                      onChange={e => setOnlyWithSales(e.target.checked)}
                      className={`rounded bg-neutral-900 border-neutral-700 ${effort === "sales" ? "text-emerald-500" : "text-amber-500"} focus:ring-0 focus:ring-offset-0 w-4 h-4`}
                    />
                    <span>Only show accounts with purchase history</span>
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-neutral-800 flex gap-3">
                <button 
                  onClick={() => {
                    setSearchQuery("")
                    setOwnerFilter("All")
                    setStatusFilter("All")
                    setIndustryFilter("All")
                    setOnlyWithSales(false)
                    setShowFiltersDrawer(false)
                  }}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors"
                >
                  Clear All
                </button>
                <button 
                  onClick={() => setShowFiltersDrawer(false)}
                  className={`flex-1 ${
                    effort === "sales" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500"
                  } text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors`}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

