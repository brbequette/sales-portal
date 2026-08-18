"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { MetricDerivationInfo } from "@/components/MetricDerivationModal"
import { extractProfit, extractCommissionAmount, extractVigRate, extractDeadCostTotal, extractCustomFieldValue } from "@/lib/custom-field-extractor"
import { useDashboardData as useRawDashboardData } from '@/hooks/useDashboardData'

export interface DashboardData {
  companyWeeklyTotal: number
  companyMonthlyTotal: number
  weeklyTotal: number
  weeklyTarget: number
  monthlyTotal: number
  monthlyProfit: number
  monthlyCommission: number
  monthlyDeals: number
  monthlyProfitGoal: number
  monthlySubtotalGoal: number
  currentVigRate: number
  monthlyVigPenaltyLoss: number
  pipelineValue: number
  pipelineCount: number
  overdueCount: number
  overdueBalance: number
  revenueByMonth: { month: string; revenue: number; goal: number }[]
  weeklyTrend: { day: string; sales: number; profit: number }[]
  dealsByStatus: { name: string; value: number; color: string }[]
  commissionByMonth: { month: string; commission: number }[]
  topReps: { name: string; sales: number; profit: number; deals: number; quota: number }[]
  allRepData: { name: string; weeklySales: number; mtdSales: number; mtdProfit: number; mtdCommission: number; deals: number }[]
  dealsWon: number
  dealsLost: number
  avgDealSize: number
  winLossData: { name: string; value: number; color: string }[]
  avgDealSizeTrend: { month: string; avgSize: number }[]
}

export interface DashboardViewProps {
  repName?: string | null    // The current rep's salesperson name (from Zoho/DB)
  isAdmin?: boolean          // Whether the current user is an admin
  repEmail?: string | null   // For matching user to invoices
  triggerCustomize?: number  // Increment from parent to open the customizer modal
}

export function parseLocalDate(dateStr: any): Date | null {
  if (!dateStr) return null
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr
  const s = String(dateStr).trim()
  if (!s) return null
  const clean = s.split('T')[0]
  const parts = clean.split('-')
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10) - 1
    const d = parseInt(parts[2], 10)
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d, 12, 0, 0)
    }
  }
  const dt = new Date(s)
  return isNaN(dt.getTime()) ? null : dt
}

export function matchesRep(invoiceRep: string, filterName?: string | null, repEmail?: string | null): boolean {
  if (!filterName && !repEmail) return true

  const rep = (invoiceRep || "").trim().toLowerCase()
  if (!rep) return false

  const fName = (filterName || "").trim().toLowerCase()
  const fEmail = (repEmail || "").trim().toLowerCase()

  if (fName === "all" || fName === "company aggregate" || fName === "all representatives") return true

  if (fName) {
    if (rep === fName || rep.includes(fName) || fName.includes(rep)) return true

    const repParts = rep.split(/\s+/).filter(Boolean)
    const filterParts = fName.split(/\s+/).filter(Boolean)
    for (const fp of filterParts) {
      if (fp.length >= 3 && repParts.some(rp => rp === fp || rp.startsWith(fp) || fp.startsWith(rp))) {
        return true
      }
    }
  }

  if (fEmail) {
    const emailPrefix = fEmail.split("@")[0].split(".")[0]
    if (emailPrefix.length >= 3 && (rep.includes(emailPrefix) || emailPrefix.includes(rep.split(" ")[0]))) {
      return true
    }
  }

  const aliasGroups = [
    ["richard", "ricky", "rick", "griffin"],
    ["montgomery", "monty", "morgan"],
    ["benjamin", "ben", "bequette"],
    ["robert", "bobby", "salyers"],
    ["ross", "haisler"],
    ["brian", "basiliere"],
    ["justin", "zastrow"],
    ["jeff", "black"],
    ["shane", "criswell"],
    ["paul", "gencuski"]
  ]

  for (const group of aliasGroups) {
    const invoiceInGroup = group.some(g => rep.includes(g))
    const filterInGroup = group.some(g => (fName && fName.includes(g)) || (fEmail && fEmail.includes(g)))
    if (invoiceInGroup && filterInGroup) return true
  }

  return false
}

// â"€â"€â"€ Chart Colors â"€â"€â"€
export const CHART_COLORS = {
  primary: "#f97316",
  accent: "#10b981",
  purple: "#a855f7",
  rose: "#f43f5e",
  amber: "#f59e0b",
  sky: "#38bdf8",
  muted: "rgba(255,255,255,0.1)",
  grid: "rgba(255,255,255,0.04)",
  text: "#a1a1aa",
}

// â"€â"€â"€ Custom Tooltip â"€â"€â"€
export interface RepWidgetConfig {
  id: string
  title: string
  visible: boolean
}

export const DEFAULT_REP_DASHBOARD_LAYOUT: RepWidgetConfig[] = [
  { id: "KPI_CARDS", title: "Top KPI Cards Grid (Goal, Sales, Profit, Timeclock, Pipeline)", visible: true },
  { id: "GOAL_TRACKERS", title: "Monthly Goals & VIG Penalty Tracker Block", visible: true },
  { id: "CHARTS_REVENUE_RATIO", title: "📊 Revenue vs Goal & Win/Loss Charts", visible: true },
  { id: "CHARTS_TRENDS", title: "📈 Weekly Trend, Deal Size & Commission Graphs", visible: true },
  { id: "LEADERBOARD", title: "🏆 Sales Leaderboard & Rep Performance Table", visible: true }
]

export function formatRepCurrency(amount: number): string {
  return `$${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatRepDate(dateStr?: string): string {
  if (!dateStr) return "N/A"
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}

export function getStatusBadgeClass(statusStr?: string): string {
  const s = (statusStr || "paid").toLowerCase().trim()
  if (s === "paid" || s === "completed") {
    return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black shadow-sm"
  }
  if (s === "sent" || s === "open" || s === "unpaid") {
    return "bg-blue-500/20 text-blue-400 border border-blue-500/40 font-black shadow-sm"
  }
  if (s === "overdue") {
    return "bg-red-500/20 text-red-400 border border-red-500/40 font-black shadow-sm"
  }
  if (s === "draft") {
    return "bg-neutral-500/20 text-neutral-300 border border-neutral-500/40 font-black"
  }
  if (s === "void" || s === "voided" || s === "writeoff" || s === "write_off") {
    return "bg-red-950/40 text-red-300 border border-red-800/40 font-black"
  }
  return "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-black"
}

export function useDashboardData({ repName, isAdmin, repEmail, triggerCustomize }: DashboardViewProps) {
  const { zohoContext: currentUser } = useZoho()
  const { data: rawData, isLoading, isError, refetch } = useRawDashboardData(repName)
  const [showCompanyWide, setShowCompanyWide] = useState<boolean>(false)
  const [timeEntry, setTimeEntry] = useState<any | null>(null)
  const [clockLoading, setClockLoading] = useState(false)
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<MetricDerivationInfo | null>(null)
  const [rawInvoicesList, setRawInvoicesList] = useState<any[]>([])

  const [repWidgets, setRepWidgets] = useState<RepWidgetConfig[]>(DEFAULT_REP_DASHBOARD_LAYOUT)
  const [isRepCustomizerOpen, setIsRepCustomizerOpen] = useState(false)

  // Open the customizer when the parent increments triggerCustomize
  useEffect(() => {
    if (triggerCustomize && triggerCustomize > 0) setIsRepCustomizerOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCustomize])

  // --- Rep Stats Board State ---
  const [repStatsReps, setRepStatsReps] = useState<any[]>([])
  
  // Controlled rep selection filter
  const initialScopedRep = repName || (isAdmin ? "all" : currentUser?.name || "all")
  const [repStatsSelectedRepId, setRepStatsSelectedRepId] = useState<string>(initialScopedRep)
  
  useEffect(() => {
    setRepStatsSelectedRepId(repName || (isAdmin ? "all" : currentUser?.name || "all"))
  }, [repName, isAdmin, currentUser?.name])

  const [repStatsPeriod, setRepStatsPeriod] = useState<string>("this_month")
  const [repStatsStartDate, setRepStatsStartDate] = useState<string>("")
  const [repStatsEndDate, setRepStatsEndDate] = useState<string>("")
  const [repStatsTotals, setRepStatsTotals] = useState<any>({
    invoiceCount: 0,
    invoiceSubtotal: 0,
    invoiceDeadProfit: 0,
    invoiceNetProfit: 0,
    invoiceCommission: 0,
    salesOrderCount: 0,
    salesOrderSubtotal: 0,
    salesOrderDeadProfit: 0,
    salesOrderEstCommission: 0
  })
  const [repStatsLoading, setRepStatsLoading] = useState(false)
  const [repStatsModalRep, setRepStatsModalRep] = useState<any | null>(null)
  const [repStatsActiveTab, setRepStatsActiveTab] = useState<"invoices" | "salesOrders">("invoices")
  const [repStatsSearchQuery, setRepStatsSearchQuery] = useState("")
  const [repStatsTileModalInfo, setRepStatsTileModalInfo] = useState<{ title: string; type: "invoices" | "salesOrders"; docs: any[] } | null>(null)
  
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const checkForUpdates = useCallback(async (sig: string, url: string) => {
    try {
      const separator = url.includes('?') ? '&' : '?'
      const res = await fetch(`${url}${separator}checkOnly=true`)
      const data = await res.json()
      if (!data.checkOnly) return
      const remoteSig = `${data.count}|${data.latestUpdatedAt ?? ''}`
      if (remoteSig !== sig) setUpdateAvailable(true)
    } catch {}
  }, [])

  // --- Company-Wide Stats (always all reps, same period) ---
  const [companyTotals, setCompanyTotals] = useState<any>({
    invoiceCount: 0, invoiceSubtotal: 0, invoiceWeeklyRevenue: 0,
    invoiceDeadProfit: 0, invoiceNetProfit: 0, invoiceCommission: 0,
    salesOrderCount: 0, salesOrderSubtotal: 0, salesOrderDeadProfit: 0, salesOrderEstCommission: 0
  })
  const [companyReps, setCompanyReps] = useState<any[]>([])
  const [companyLoading, setCompanyLoading] = useState(false)
  const [companyTileModal, setCompanyTileModal] = useState<{ title: string; type: "invoices" | "salesOrders"; docs: any[] } | null>(null)

  const fetchRepStatsData = useCallback(async () => {
    try {
      setRepStatsLoading(true)
      const params = new URLSearchParams()
      params.set("repId", repStatsSelectedRepId)
      params.set("period", repStatsPeriod)
      if (repStatsPeriod === "custom") {
        if (repStatsStartDate) params.set("startDate", repStatsStartDate)
        if (repStatsEndDate) params.set("endDate", repStatsEndDate)
      }

      const res = await fetch(`/api/get-rep-stats?${params.toString()}`)
      const d = await res.json()
      if (d.success) {
        setRepStatsReps(d.reps || [])
        if (d.totals) setRepStatsTotals(d.totals)

        const sig = `${(d.reps || []).length}|${(d.reps || [])[0]?.repId ?? ''}`
        setUpdateAvailable(false)
        setTimeout(() => checkForUpdates(sig, `/api/get-rep-stats?${params.toString()}`), 2000)
      }
    } catch (e) {
      console.error("Failed to load rep stats on dashboard", e)
    } finally {
      setRepStatsLoading(false)
    }
  }, [repStatsSelectedRepId, repStatsPeriod, repStatsStartDate, repStatsEndDate])

  const fetchCompanyStats = useCallback(async () => {
    try {
      setCompanyLoading(true)
      const params = new URLSearchParams()
      params.set("repId", "all")
      params.set("period", repStatsPeriod)
      if (repStatsPeriod === "custom") {
        if (repStatsStartDate) params.set("startDate", repStatsStartDate)
        if (repStatsEndDate) params.set("endDate", repStatsEndDate)
      }
      const res = await fetch(`/api/get-rep-stats?${params.toString()}`)
      const d = await res.json()
      if (d.success) {
        setCompanyReps(d.reps || [])
        if (d.totals) setCompanyTotals(d.totals)
      }
    } catch (e) {
      console.error("Failed to load company stats", e)
    } finally {
      setCompanyLoading(false)
    }
  }, [repStatsPeriod, repStatsStartDate, repStatsEndDate])

  useEffect(() => {
    fetchRepStatsData()
    fetchCompanyStats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repStatsSelectedRepId, repStatsPeriod, repStatsStartDate, repStatsEndDate, refreshTrigger])

  const repStatsAllInvoices = useMemo(() => {
    let list: any[] = []
    repStatsReps.forEach(r => {
      if (r.invoices && Array.isArray(r.invoices)) {
        list = list.concat(r.invoices.map((inv: any) => ({ ...inv, repName: r.repName })))
      }
    })
    if (repStatsSearchQuery.trim()) {
      const q = repStatsSearchQuery.toLowerCase().trim()
      return list.filter(inv =>
        (inv.invoiceNumber || "").toLowerCase().includes(q) ||
        (inv.customerName || "").toLowerCase().includes(q) ||
        (inv.repName || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [repStatsReps, repStatsSearchQuery])

  // Uninvoiced Sales Orders only (exclude ones that have been converted to invoices)
  const repStatsAllSalesOrders = useMemo(() => {
    let list: any[] = []
    repStatsReps.forEach(r => {
      if (r.salesOrders && Array.isArray(r.salesOrders)) {
        list = list.concat(r.salesOrders.map((so: any) => ({ ...so, repName: r.repName })))
      }
    })
    // Filter to uninvoiced: exclude orders that already have an invoice or status is 'invoiced'
    list = list.filter(so => {
      const s = (so.status || "").toLowerCase().trim()
      return s !== "invoiced" && s !== "closed" && s !== "billed" && !so.invoiceId && !so.invoiceNumber
    })
    if (repStatsSearchQuery.trim()) {
      const q = repStatsSearchQuery.toLowerCase().trim()
      return list.filter(so =>
        (so.salesOrderNumber || "").toLowerCase().includes(q) ||
        (so.customerName || "").toLowerCase().includes(q) ||
        (so.repName || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [repStatsReps, repStatsSearchQuery])

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rep_dashboard_widget_layout")
      if (saved) {
        setRepWidgets(JSON.parse(saved))
      }
    } catch (e) {
      console.error("Failed to load rep layout", e)
    }
  }, [])

  const handleUpdateRepWidgets = useCallback((updated: RepWidgetConfig[]) => {
    setRepWidgets(updated)
    try {
      localStorage.setItem("rep_dashboard_widget_layout", JSON.stringify(updated))
    } catch (e) {
      console.error("Failed to save rep layout", e)
    }
  }, [])

  const isVisible = useCallback((id: string) => {
    return repWidgets.find(w => w.id === id)?.visible !== false
  }, [repWidgets])

  const filterRepName = repName || null
  const showTopPerformers = isAdmin === true
  const showCompanyBreakdown = isAdmin === true

  const data = useMemo<DashboardData | null>(() => {
    if (!rawData || !rawData.success) return null

    try {
      const companyTotalsKpi = rawData.companyTotals || rawData.totals || {}
      const repTotalsKpi = rawData.totals || {}
      const companyRepsList = rawData.companyReps || rawData.reps || []
      const scopedReps = rawData.reps || []

      let repProfitGoal = rawData.repProfitGoal || 20000
      let repSubtotalGoal = rawData.repSubtotalGoal || 40000
      let repVigRate = rawData.repVigRate || 1.3
      let monthlyVigPenaltyLoss = rawData.monthlyVigPenaltyLoss || 0

      // --- Build chart data from company reps list (DB-backed) ---
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"]
      const dayOfWeek = now.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset)
      monday.setHours(0, 0, 0, 0)

      // Trailing 6-month revenue from company invoices
      const monthlyRevData: Record<string, number> = {}
      const commData: Record<string, number> = {}
      for (let i = 5; i >= 0; i--) {
        const m = new Date(currentYear, currentMonth - i, 1)
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
        monthlyRevData[key] = 0
        commData[key] = 0
      }

      // Daily data for weekly trend
      const dailySales: Record<string, number> = {}
      const dailyProfit: Record<string, number> = {}
      for (let d = 0; d < 5; d++) {
        const dt = new Date(monday)
        dt.setDate(monday.getDate() + d)
        const key = dt.toISOString().slice(0, 10)
        dailySales[key] = 0
        dailyProfit[key] = 0
      }

      // Status counts for donut
      const statusCounts: Record<string, number> = {}
      let totalDealsWon = 0, totalDealsLost = 0, totalDealsRevenue = 0

      // Per-rep aggregation (for leaderboard, use current rep scope invoices)
      const repData: Record<string, { sales: number; profit: number; deals: number; commission: number; weeklySales: number }> = {}

      // Build chart data from the DB invoices on the scoped reps (this_month query)
      for (const rep of scopedReps) {
        if (!repData[rep.repName]) repData[rep.repName] = { sales: 0, profit: 0, deals: 0, commission: 0, weeklySales: rep.weeklyRevenue || 0 }
        for (const inv of (rep.invoices || [])) {
          const invDate = inv.date ? new Date(inv.date) : null
          if (!invDate) continue
          const amount = inv.subtotal || 0
          const profit = inv.profit || 0
          const commission = inv.commission || 0
          const status = (inv.status || "").toLowerCase()

          // Monthly revenue chart
          const invMonth = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`
          if (monthlyRevData[invMonth] !== undefined) monthlyRevData[invMonth] += amount
          if (commData[invMonth] !== undefined) commData[invMonth] += commission

          // Status donut
          const statusKey = (status === "paid" || status === "completed") ? "Paid" : status === "overdue" ? "Overdue" : status === "draft" ? "Draft" : (status === "sent" || status === "open" || status === "unpaid") ? "Sent" : status === "partially_paid" ? "Partial" : "Other"
          statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1

          // Won/Lost
          if (status === "void") { totalDealsLost++ } else { totalDealsWon++; totalDealsRevenue += amount }

          // Weekly trend
          const dayKey = invDate.toISOString().slice(0, 10)
          if (dailySales[dayKey] !== undefined) {
            dailySales[dayKey] += amount
            dailyProfit[dayKey] += profit
          }

          repData[rep.repName].sales += amount
          repData[rep.repName].profit += profit
          repData[rep.repName].deals++
          repData[rep.repName].commission += commission
        }
      }

      const revenueByMonth = Object.entries(monthlyRevData).map(([key, rev]) => ({
        month: monthNames[parseInt(key.split("-")[1]) - 1],
        revenue: Math.round(rev),
        goal: 64000
      }))

      const weeklyTrend = Object.entries(dailySales).map(([key, sales], i) => ({
        day: dayNames[i] || key,
        sales: Math.round(sales),
        profit: Math.round(dailyProfit[key] || 0)
      }))

      const CHART_COLORS_LOCAL = { accent: "#10b981", rose: "#f43f5e", sky: "#38bdf8", amber: "#f59e0b", purple: "#a855f7", text: "#6b7280" }
      const statusColors: Record<string, string> = { Paid: CHART_COLORS_LOCAL.accent, Overdue: CHART_COLORS_LOCAL.rose, Sent: CHART_COLORS_LOCAL.sky, Draft: CHART_COLORS_LOCAL.text, Partial: CHART_COLORS_LOCAL.amber, Other: CHART_COLORS_LOCAL.purple }
      const dealsByStatus = Object.entries(statusCounts).map(([name, value]) => ({ name, value, color: statusColors[name] || CHART_COLORS_LOCAL.text }))
      const commissionByMonth = Object.entries(commData).map(([key, commission]) => ({ month: monthNames[parseInt(key.split("-")[1]) - 1], commission: Math.round(commission) }))

      const topReps = Object.entries(repData)
        .map(([name, d]) => ({ name, sales: Math.round(d.sales), profit: Math.round(d.profit), deals: d.deals, quota: 10000 }))
        .sort((a, b) => b.sales - a.sales).slice(0, 5)

      const allRepData = companyRepsList.map((r: any) => ({
        name: r.repName,
        weeklySales: Math.round(r.weeklyRevenue || 0),
        mtdSales: Math.round(r.revenue || 0),
        mtdProfit: Math.round(r.profit || 0),
        mtdCommission: Math.round(r.commissions || 0),
        deals: r.invoiceCount || 0,
      })).sort((a: { mtdSales: number }, b: { mtdSales: number }) => b.mtdSales - a.mtdSales)

      const avgDealSize = totalDealsWon > 0 ? Math.round(totalDealsRevenue / totalDealsWon) : 0
      const winLossData = [
        { name: "Won", value: totalDealsWon || 1, color: "#10b981" },
        { name: "Lost", value: totalDealsLost || 0, color: "#f43f5e" }
      ]
      const avgDealSizeTrend = revenueByMonth.map(m => ({ month: m.month, avgSize: m.revenue > 0 ? Math.round(m.revenue / Math.max(1, topReps.length)) : 0 }))

      // Use rep-scoped totals for the individual KPI cards
      const weeklyTotal = repTotalsKpi.invoiceWeeklyRevenue || 0
      const monthlyTotal = repTotalsKpi.invoiceSubtotal || 0
      const monthlyProfit = repTotalsKpi.invoiceNetProfit || 0
      const monthlyCommission = repTotalsKpi.invoiceCommission || 0
      const monthlyDeals = repTotalsKpi.invoiceCount || 0

      const companyWeeklyTotal = companyTotalsKpi.invoiceWeeklyRevenue || 0
      const companyMonthlyTotal = companyTotalsKpi.invoiceSubtotal || 0

      // Pipeline and overdue from current rep scope
      let pipelineValue = 0, pipelineCount = 0, overdueCount = 0, overdueBalance = 0
      for (const rep of scopedReps) {
        for (const inv of (rep.invoices || [])) {
          const status = (inv.status || "").toLowerCase()
          if (status !== "paid" && status !== "void" && status !== "draft") {
            pipelineValue += inv.subtotal || 0
            pipelineCount++
          }
          if (status === "overdue") {
            overdueCount++
            overdueBalance += inv.subtotal || 0
          }
        }
      }

      return {
        companyWeeklyTotal: Math.round(companyWeeklyTotal),
        companyMonthlyTotal: Math.round(companyMonthlyTotal),
        weeklyTotal: Math.round(weeklyTotal),
        weeklyTarget: 64000,
        monthlyTotal: Math.round(monthlyTotal),
        monthlyProfit: Math.round(monthlyProfit),
        monthlyCommission: Math.round(monthlyCommission),
        monthlyDeals,
        monthlyProfitGoal: repProfitGoal,
        monthlySubtotalGoal: repSubtotalGoal,
        currentVigRate: repVigRate,
        monthlyVigPenaltyLoss,
        pipelineValue: Math.round(pipelineValue),
        pipelineCount,
        overdueCount,
        overdueBalance: Math.round(overdueBalance),
        revenueByMonth,
        weeklyTrend,
        dealsByStatus,
        commissionByMonth,
        topReps,
        allRepData,
        dealsWon: totalDealsWon,
        dealsLost: totalDealsLost,
        avgDealSize,
        winLossData,
        avgDealSizeTrend,
      }
    } catch (err) {
      console.error("Dashboard data transformation error:", err)
      return null
    }
  }, [rawData])

  useEffect(() => {
    const handleGlobalMetricEvent = (e: any) => {
      if (e.detail?.key && data) {
        const info = buildMetricInfo(e.detail.key, data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin)
        if (info) setSelectedMetricInfo(info)
      }
    }
    window.addEventListener("open-metric-derivation", handleGlobalMetricEvent as any)
    return () => window.removeEventListener("open-metric-derivation", handleGlobalMetricEvent as any)
  }, [data, timeEntry, rawInvoicesList, repName, repEmail, isAdmin])

  useEffect(() => {
    if (!currentUser?.id) return
    const fetchTime = async () => {
      try {
        const res = await fetch(`/api/timeclock/get-entries?userId=${currentUser.id}&email=${encodeURIComponent(currentUser.email || '')}`, { cache: 'no-store' })
        const tdata = await res.json()
        if (tdata.success && tdata.entries && tdata.entries.length > 0) {
          const now = new Date()
          const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' })
          const parts = formatter.formatToParts(now)
          const phoenixDate = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`
          if (tdata.entries[0].date === phoenixDate) {
            setTimeEntry(tdata.entries[0])
          }
        }
      } catch (e) { console.error('Timeclock fetch error:', e) }
    }
    fetchTime()
    const interval = setInterval(fetchTime, 60000)
    return () => clearInterval(interval)
  }, [currentUser?.id])

  const calculateHours = useCallback((entry: any) => {
    if (!entry) return "0.0"
    const start = new Date(entry.manualClockIn || entry.clockIn)
    let end: Date
    if (entry.manualClockOut) {
      end = new Date(entry.manualClockOut)
    } else if (entry.clockOut) {
      end = new Date(entry.clockOut)
    } else {
      end = new Date(entry.lastActivity || new Date())
    }
    const now = new Date()
    if (end > now) end = now

    let inactivityMs = 0
    if (entry.inactivityPeriods && Array.isArray(entry.inactivityPeriods)) {
      entry.inactivityPeriods.forEach((p: any) => {
        const pStart = new Date(p.start)
        const pEnd = new Date(p.end)
        const overlapStart = new Date(Math.max(start.getTime(), pStart.getTime()))
        const overlapEnd = new Date(Math.min(end.getTime(), pEnd.getTime()))
        if (overlapEnd > overlapStart) {
          inactivityMs += overlapEnd.getTime() - overlapStart.getTime()
        }
      })
    }

    const diffHours = ((end.getTime() - start.getTime()) - inactivityMs) / (1000 * 60 * 60)
    return Math.max(0, diffHours).toFixed(1)
  }, [])

  const handleToggleClock = useCallback(async () => {
    if (!currentUser?.id || clockLoading) return
    setClockLoading(true)
    const action = (!timeEntry || timeEntry.manualClockOut) ? "clockIn" : "clockOut"
    try {
      const res = await fetch("/api/timeclock/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: currentUser.id,
          email: currentUser.email,
          action,
          source: 'manual',
          name: currentUser.name || currentUser.fullName || "Zoho User"
        })
      })
      const tdata = await res.json()
      if (tdata.success) {
        setTimeEntry(tdata.entry)
      }
    } catch (e) {
      console.error("Timeclock toggle error:", e)
    } finally {
      setClockLoading(false)
    }
  }, [currentUser, clockLoading, timeEntry])


  const goalPct = data && data.weeklyTarget > 0 ? Math.round((data.weeklyTotal / data.weeklyTarget) * 100) : 0

  return {
    currentUser,
    rawData, isLoading, isError, refetch,
    showCompanyWide, setShowCompanyWide,
    timeEntry, setTimeEntry,
    clockLoading, setClockLoading,
    selectedMetricInfo, setSelectedMetricInfo,
    rawInvoicesList, setRawInvoicesList,
    repWidgets, setRepWidgets,
    isRepCustomizerOpen, setIsRepCustomizerOpen,
    repStatsReps, setRepStatsReps,
    repStatsSelectedRepId, setRepStatsSelectedRepId,
    repStatsPeriod, setRepStatsPeriod,
    repStatsStartDate, setRepStatsStartDate,
    repStatsEndDate, setRepStatsEndDate,
    repStatsTotals, setRepStatsTotals,
    repStatsLoading, setRepStatsLoading,
    repStatsModalRep, setRepStatsModalRep,
    repStatsActiveTab, setRepStatsActiveTab,
    repStatsSearchQuery, setRepStatsSearchQuery,
    repStatsTileModalInfo, setRepStatsTileModalInfo,
    updateAvailable, setUpdateAvailable,
    refreshTrigger, setRefreshTrigger,
    companyTotals, setCompanyTotals,
    companyReps, setCompanyReps,
    companyLoading, setCompanyLoading,
    companyTileModal, setCompanyTileModal,
    data,
    repStatsAllInvoices,
    repStatsAllSalesOrders,
    handleUpdateRepWidgets,
    isVisible,
    calculateHours,
    handleToggleClock,
    checkForUpdates,
    fetchRepStatsData,
    fetchCompanyStats,
    goalPct,
    showTopPerformers,
    showCompanyBreakdown
  }
}
export function buildMetricInfo(
  key: string, 
  data: DashboardData, 
  timeEntry: any, 
  repName?: string | null,
  repEmail?: string | null,
  invoices: any[] = [],
  isAdmin?: boolean
): MetricDerivationInfo | null {
  const repLabel = repName || "All Sales Representatives"
  
  const activeRepFilter = repName
  const isAllOrAdminFilter = !activeRepFilter || activeRepFilter.trim().toUpperCase().includes("ADMIN") || activeRepFilter.trim().toUpperCase().includes("MYSELF") || activeRepFilter.trim().toUpperCase() === "ALL"

  // Filter invoices for the rep first
  const repInvoices = invoices.filter(inv => {
    const rep = inv.salesorder_salesperson_name || inv.salesperson_name || "Unknown"
    const repUpper = rep.toUpperCase()
    if (repUpper.includes("PAUL") && (repUpper.includes("GENCUSKI") || repUpper.includes("GENKUSKI"))) return false
    if (!isAllOrAdminFilter && activeRepFilter) {
      return matchesRep(rep, activeRepFilter, repEmail)
    }
    return true
  })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Calculate current week (Mon-Fri)
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  monday.setHours(0, 0, 0, 0)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  friday.setHours(23, 59, 59, 999)

  switch (key) {
    case "weeklyGoal": {
      const pct = data.weeklyTarget > 0 ? Math.round((data.weeklyTotal / data.weeklyTarget) * 100) : 0
      const matchingDocs = repInvoices.filter(inv => {
        const dateStr = inv.salesorder_date || inv.date || ""
        const invDate = parseLocalDate(dateStr)
        return invDate && invDate >= monday && invDate <= friday
      })
      return {
        title: "Weekly Goal Progress",
        value: `$${data.weeklyTotal.toLocaleString()} / $${data.weeklyTarget.toLocaleString()} (${pct}%)`,
        subtitle: `Tracked for ${repLabel} this calendar week`,
        color: CHART_COLORS.primary,
        formula: "Weekly Goal % = (Current Week Paid & Active Invoices Subtotal / Weekly Quota Target) × 100",
        explanation: "Measures current week sales volume against your target quota. Resets every Monday at midnight. Includes all non-void, active invoices created within the current week date range.",
        dataSource: "Prisma `Invoice` & `SalesOrder` models, filtered by `orderDate >= Monday`.",
        calculationDetails: [
          { label: "Current Week Sales", value: `$${data.weeklyTotal.toLocaleString()}`, description: "Sum of valid invoice subtotals issued Mon-Sun" },
          { label: "Weekly Quota Target", value: `$${data.weeklyTarget.toLocaleString()}`, description: "Rep target assigned in system settings" },
          { label: "Completion Rate", value: `${pct}%`, description: "Calculated progress ratio" }
        ],
        notes: "Quotes and draft orders are excluded from goal progress until converted to active Sales Orders or Invoices.",
        documents: matchingDocs
      }
    }
    case "totalRevenue": {
      const matchingDocs = repInvoices.filter(inv => {
        const dateStr = inv.salesorder_date || inv.date || ""
        const invDate = parseLocalDate(dateStr)
        return invDate && invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear
      })
      return {
        title: "Month-to-Date (MTD) Total Revenue",
        value: `$${data.monthlyTotal.toLocaleString()}`,
        subtitle: `Total sales generated in current month (${data.monthlyDeals} completed deals)`,
        color: CHART_COLORS.primary,
        formula: "MTD Revenue = Σ (Invoice Subtotal) for all active invoices issued in current calendar month",
        explanation: "Total gross revenue generated by confirmed invoices during the current calendar month. Excludes tax, shipping, and voided/cancelled documents.",
        dataSource: "Prisma `Invoice` table, filtered by `issueDate` within current month.",
        calculationDetails: [
          { label: "MTD Gross Subtotal", value: `$${data.monthlyTotal.toLocaleString()}`, description: "Sum of items subtotal before VIG or deductions" },
          { label: "Completed Deals", value: `${data.monthlyDeals}`, description: "Number of active invoices/orders this month" },
          { label: "Average Order Value", value: data.monthlyDeals > 0 ? `$${Math.round(data.monthlyTotal / data.monthlyDeals).toLocaleString()}` : "$0", description: "MTD Revenue / Deals Count" }
        ],
        documents: matchingDocs
      }
    }
    case "monthlyProfit": {
      const matchingDocs = repInvoices.filter(inv => {
        const dateStr = inv.salesorder_date || inv.date || ""
        const invDate = parseLocalDate(dateStr)
        return invDate && invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear
      })
      return {
        title: "Monthly Profit & Commission",
        value: `$${data.monthlyProfit.toLocaleString()}`,
        subtitle: `Commission earned: $${data.monthlyCommission.toLocaleString()}`,
        color: CHART_COLORS.purple,
        formula: "Profit = Subtotal - (Dead Cost + VIG) - Credit Card Fees - Additional Costs\nCommission = Max(0, Profit) × Commission %",
        explanation: "Calculated per line item using item wholesale cost, salesperson VIG rate multiplier (e.g. 1.3x for standard, 1.0x for Montgomery Morgan), credit card processing fees (3%), and custom invoice fee deductions.",
        dataSource: "Calculated via `cost-calculations.ts` engine on synced Zoho Invoices.",
        calculationDetails: [
          { label: "Gross Subtotal", value: `$${data.monthlyTotal.toLocaleString()}`, description: "Total revenue before costs" },
          { label: "Net Profit Total", value: `$${data.monthlyProfit.toLocaleString()}`, description: "Profit after VIG cost deduction & CC fees" },
          { label: "Estimated Commission", value: `$${data.monthlyCommission.toLocaleString()}`, description: "Salesperson payout based on tier %" }
        ],
        notes: isAdmin ? "Montgomery Morgan invoices enforce a 1.0 VIG multiplier. Insurance items are retained as company revenue and not deducted from rep profit." : undefined,
        documents: matchingDocs
      }
    }
    case "timeclock": {
      const statusText = (!timeEntry || timeEntry.manualClockOut) ? "Off Clock" : "Clocked In"
      return {
        title: "Timeclock & Logged Shift Hours",
        value: statusText,
        subtitle: "Shift details and tracking info",
        color: CHART_COLORS.accent,
        formula: "Shift Hours = (Clock Out Time - Clock In Time) - Total Logged Inactivity Periods",
        explanation: "Calculates total active working hours. Inactivity detection flags periods over 20 minutes without system interaction, deducting them from total paid time unless approved by admin.",
        dataSource: "Prisma `TimeEntry` table with geofence validation.",
        calculationDetails: [
          { label: "Current Status", value: statusText, description: "Real-time state from Timeclock engine" },
          { label: "Geofence Check", value: timeEntry?.locationStatus || "VERIFIED", description: "GPS validation against office coordinates" }
        ]
      }
    }
    case "dealsWon": {
      const matchingDocs = repInvoices.filter(inv => {
        const status = (inv.status || "").toLowerCase()
        return status === "paid" || status === "sent" || status === "partially_paid" || status === "overdue"
      })
      return {
        title: "Deals Won",
        value: `${data.dealsWon}`,
        subtitle: "Successful sales closed",
        color: CHART_COLORS.accent,
        formula: "Deals Won = Count(Deals / Invoices with status 'Closed Won' or 'Paid')",
        explanation: "Represents the total count of successfully closed sales opportunities that reached final payment or confirmation.",
        dataSource: "Prisma `Deal` and `Invoice` records.",
        calculationDetails: [
          { label: "Total Closed Won", value: `${data.dealsWon}`, description: "Count of successful deals" }
        ],
        documents: matchingDocs
      }
    }
    case "dealsLost": {
      const matchingDocs = repInvoices.filter(inv => {
        const status = (inv.status || "").toLowerCase()
        return status === "void"
      })
      return {
        title: "Deals Lost",
        value: `${data.dealsLost}`,
        subtitle: "Voided or lost opportunities",
        color: CHART_COLORS.rose,
        formula: "Deals Lost = Count(Deals with status 'Closed Lost', 'Void', or 'Write-Off')",
        explanation: "Tracks non-converting deals, cancelled sales orders, or bad debt write-offs to monitor win/loss conversion ratios.",
        dataSource: "Prisma `Deal` and `SalesOrder` records.",
        calculationDetails: [
          { label: "Total Void/Lost", value: `${data.dealsLost}`, description: "Count of lost opportunities" }
        ],
        documents: matchingDocs
      }
    }
    case "avgDealSize": {
      const matchingDocs = repInvoices.filter(inv => {
        const status = (inv.status || "").toLowerCase()
        return status === "paid" || status === "sent" || status === "partially_paid" || status === "overdue"
      })
      return {
        title: "Average Deal Size",
        value: `$${data.avgDealSize.toLocaleString()}`,
        subtitle: "Average revenue generated per closed deal",
        color: CHART_COLORS.sky,
        formula: "Average Deal Size = Total Revenue from Won Deals / Total Count of Won Deals",
        explanation: "Measures average deal value across all closed transactions, helping gauge upsell performance and customer sizing.",
        dataSource: "Aggregated from MTD invoice totals and won deal counts.",
        calculationDetails: [
          { label: "Won Revenue Sum", value: `$${(data.avgDealSize * (data.dealsWon || 1)).toLocaleString()}`, description: "Total won deal value" },
          { label: "Won Deals Count", value: `${data.dealsWon}`, description: "Total count of closed deals" },
          { label: "Avg Deal Size", value: `$${data.avgDealSize.toLocaleString()}`, description: "Result of Division" }
        ],
        documents: matchingDocs
      }
    }
    case "vigPenalty": {
      const matchingDocs = repInvoices.filter(inv => {
        const dateStr = inv.salesorder_date || inv.date || ""
        const invDate = parseLocalDate(dateStr)
        if (!invDate || invDate.getMonth() !== currentMonth || invDate.getFullYear() !== currentYear) return false
        
        const invVig = extractVigRate(inv) || data.currentVigRate
        const deadCostTotal = extractDeadCostTotal(inv)
        const deadCostNoVig = parseFloat(extractCustomFieldValue(inv, 'cf_dead_cost_no_vig', 0) || 0)
        const deadCostSubjectToVig = parseFloat(
          extractCustomFieldValue(inv, 'cf_dead_cost_subject_to_vig', null) ?? Math.max(0, deadCostTotal - deadCostNoVig)
        )
        return invVig >= 1.45 && deadCostSubjectToVig > 0
      })
      return {
        title: "1.5x VIG Penalty Money Lost",
        value: `-$${data.monthlyVigPenaltyLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        subtitle: data.monthlyVigPenaltyLoss > 0 
          ? `Penalty active: 1.5x VIG multiplier applied due to missing prior month's goal`
          : `No penalty: Standard 1.3x VIG rate maintained`,
        color: data.monthlyVigPenaltyLoss > 0 ? CHART_COLORS.rose : CHART_COLORS.accent,
        formula: "VIG Penalty Loss = Σ [ Dead Cost Subject to VIG × (Current VIG Rate - 1.3) ]",
        explanation: "When last month's sales goal is missed, the salesperson's VIG multiplier increases from 1.3x to 1.5x. This box shows the exact money lost on this month's commissions as a result of that 0.2x penalty difference.",
        dataSource: "Calculated from invoice dead cost subject to VIG vs standard 1.3x baseline VIG.",
        calculationDetails: [
          { label: "Current VIG Rate", value: `${data.currentVigRate}x`, description: data.currentVigRate >= 1.45 ? "Penalty rate applied" : "Standard rate" },
          { label: "Penalty Difference", value: "0.20x", description: "1.5x penalty rate minus 1.3x standard rate" },
          { label: "Total Money Lost", value: `-$${data.monthlyVigPenaltyLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, description: "Net commission reduction this month" }
        ],
        notes: "Achieving your monthly goal will restore your VIG multiplier back to 1.3x for the next month.",
        documents: matchingDocs
      }
    }
    case "activePipeline": {
      const matchingDocs = repInvoices.filter(inv => {
        const status = (inv.status || "").toLowerCase()
        return status !== "paid" && status !== "void" && status !== "draft"
      })
      return {
        title: "Active Pipeline & Overdue Balances",
        value: `$${data.pipelineValue.toLocaleString()}`,
        subtitle: `${data.pipelineCount} open invoices (${data.overdueCount} overdue: $${data.overdueBalance.toLocaleString()})`,
        color: CHART_COLORS.sky,
        formula: "Pipeline = Σ (Unpaid Invoice Balance)\nOverdue = Σ (Balance of Invoices where Due Date < Current Date)",
        explanation: "Tracks total outstanding collections value. Overdue balance highlights invoices requiring immediate follow-up by reps or collections team.",
        dataSource: "Prisma `Invoice` table, filtered by `balance > 0`.",
        calculationDetails: [
          { label: "Total Open Invoices", value: `${data.pipelineCount}`, description: "All active non-paid invoices" },
          { label: "Total Open Balance", value: `$${data.pipelineValue.toLocaleString()}`, description: "Sum of unpaid balances" },
          { label: "Overdue Invoices", value: `${data.overdueCount}`, description: "Invoices past due date" },
          { label: "Overdue Balance", value: `$${data.overdueBalance.toLocaleString()}`, description: "Past due collection amount" }
        ],
        documents: matchingDocs
      }
    }
    default:
      return null
  }
}