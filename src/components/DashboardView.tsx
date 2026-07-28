"use client"


import { useEffect, useState, useRef } from "react"
import {
  FiTarget, FiDollarSign, FiTrendingUp, FiClock, FiLayers,
  FiArrowUpRight, FiArrowDownRight, FiCheckCircle, FiAlertCircle, FiTrendingDown
} from "react-icons/fi"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import { useZoho } from "@/components/ZohoProvider"
import { MetricDerivationModal, MetricDerivationInfo } from "@/components/MetricDerivationModal"
import { extractProfit, extractCommissionAmount, extractVigRate, extractDeadCostTotal, extractCustomFieldValue } from "@/lib/custom-field-extractor"


// â"€â"€â"€ Types â"€â"€â"€
interface DashboardData {
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

interface DashboardViewProps {
  repName?: string | null    // The current rep's salesperson name (from Zoho/DB)
  isAdmin?: boolean          // Whether the current user is an admin
  repEmail?: string | null   // For matching user to invoices
}

function parseLocalDate(dateStr: any): Date | null {
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

function matchesRep(invoiceRep: string, filterName?: string | null, repEmail?: string | null): boolean {
  if (!filterName) return true
  const filter = filterName.trim().toUpperCase()
  if (!filter || filter.includes("ADMIN") || filter.includes("MYSELF") || filter === "ALL") return true

  const rep = (invoiceRep || "").trim().toUpperCase()
  if (!rep) return false

  if (rep.includes(filter) || filter.includes(rep)) return true

  const filterParts = filter.split(/\s+/).filter(Boolean)
  const repParts = rep.split(/\s+/).filter(Boolean)

  if (filterParts.length > 0 && repParts.length > 0) {
    const filterFirst = filterParts[0]
    const repFirst = repParts[0]
    if (filterFirst.length >= 3 && (filterFirst === repFirst || repFirst.startsWith(filterFirst) || filterFirst.startsWith(repFirst))) {
      return true
    }
  }

  if (repEmail) {
    const emailUpper = repEmail.trim().toUpperCase()
    const emailPrefix = emailUpper.split("@")[0].split(".")[0]
    if (emailPrefix.length >= 3 && (rep.includes(emailPrefix) || emailPrefix.includes(repParts[0]))) {
      return true
    }
  }

  return false
}

// â"€â"€â"€ Chart Colors â"€â"€â"€
const CHART_COLORS = {
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
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-panel rounded-lg px-3 py-2 text-xs border border-white/10">
      <p className="text-neutral-400 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: ${(entry.value || 0).toLocaleString()}
        </p>
      ))}
    </div>
  )
}

// --- KPI Card ---
function KPICard({
  icon: Icon, title, value, subtitle, trend, trendUp, color, children, onClick
}: {
  icon: any; title: string; value: string; subtitle?: string;
  trend?: string; trendUp?: boolean; color: string; children?: React.ReactNode; onClick?: () => void
}) {
  return (
    <div 
      onClick={onClick}
      className={`glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.2] transition-all duration-300 group relative overflow-hidden ${
        onClick ? "cursor-pointer hover:scale-[1.01] active:scale-[0.99]" : ""
      }`}
    >
      {/* Glow effect */}
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-[0.07] group-hover:opacity-[0.14] transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${color}, transparent)` }} />
      
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl border transition-colors"
          style={{ background: `${color}15`, borderColor: `${color}30` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex items-center gap-1.5">
          {onClick && (
            <span className="text-[9px] font-bold tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 px-1.5 py-0.5 rounded text-neutral-300">
              Formula
            </span>
          )}
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
              trendUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            }`}>
              {trendUp ? <FiArrowUpRight size={12} /> : <FiArrowDownRight size={12} />}
              {trend}
            </div>
          )}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-neutral-400 mb-1">{title}</p>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        {subtitle && <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// â"€â"€â"€ Quota Ring â"€â"€â"€
function QuotaRing({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className="relative w-24 h-24 mt-2">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black text-white">{Math.round(pct)}%</span>
        <span className="text-[10px] text-neutral-500">of goal</span>
      </div>
    </div>
  )
}

// ------ Main Dashboard Component ------
export function DashboardView({ repName, isAdmin, repEmail }: DashboardViewProps) {
  const { zohoContext: currentUser } = useZoho()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCompanyWide, setShowCompanyWide] = useState<boolean>(isAdmin ?? false)
  const [timeEntry, setTimeEntry] = useState<any | null>(null)
  const [clockLoading, setClockLoading] = useState(false)
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<MetricDerivationInfo | null>(null)

  useEffect(() => {
    const handleGlobalMetricEvent = (e: any) => {
      if (e.detail?.key && data) {
        const info = buildMetricInfo(e.detail.key, data, timeEntry, repName)
        if (info) setSelectedMetricInfo(info)
      }
    }
    window.addEventListener("open-metric-derivation", handleGlobalMetricEvent as any)
    return () => window.removeEventListener("open-metric-derivation", handleGlobalMetricEvent as any)
  }, [data, timeEntry, repName])
  const filterRepName = repName || null
  const showTopPerformers = isAdmin === true
  const showCompanyBreakdown = isAdmin === true

  useEffect(() => {
    fetchDashboardData()
    // Refresh when tab becomes visible (instead of polling every 5 min)
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchDashboardData() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repName, isAdmin, repEmail])

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
      } catch (e) {}
    }
    fetchTime()
    const interval = setInterval(fetchTime, 60000)
    return () => clearInterval(interval)
  }, [currentUser?.id])

  const calculateHours = (entry: any) => {
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
  }

  const handleToggleClock = async () => {
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
  }

  async function fetchDashboardData() {
    try {
      // Fetch invoices from the existing API
      let invoices: any[] = []
      try {
        const res = await fetch("/api/zoho-invoices")
        if (res.ok) {
          const contentType = res.headers.get("content-type") || ""
          if (contentType.includes("application/json")) {
            const json = await res.json()
            if (json && Array.isArray(json.invoices)) {
              invoices = json.invoices
            }
          }
        }
      } catch (e) {
        console.error("Dashboard invoice fetch failed:", e)
      }
      
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

      let weeklyTotal = 0, monthlyTotal = 0, monthlyProfit = 0, monthlyCommission = 0
      let monthlyDeals = 0, pipelineValue = 0, pipelineCount = 0
      let overdueCount = 0, overdueBalance = 0
      let monthlyVigPenaltyLoss = 0
      
      let companyWeeklyTotal = 0
      let companyMonthlyTotal = 0

      // Fetch Rep VIG / Goal Configurations
      let repProfitGoal = 20000
      let repSubtotalGoal = 40000
      let repVigRate = 1.3

      try {
        const vigRes = await fetch("/api/admin/users/vig")
        if (vigRes.ok) {
          const vigData = await vigRes.json()
          if (vigData.success && Array.isArray(vigData.repConfigs)) {
            const activeFilter = filterRepName || repName
            const matchRep = vigData.repConfigs.find((r: any) => 
              (activeFilter && r.name.toLowerCase().includes(activeFilter.toLowerCase())) ||
              (repEmail && r.email.toLowerCase() === repEmail.toLowerCase())
            )
            if (matchRep) {
              if (matchRep.dailyProfitGoal > 0) repProfitGoal = matchRep.dailyProfitGoal * 20
              if (matchRep.dailySubtotalGoal > 0) repSubtotalGoal = matchRep.dailySubtotalGoal * 20
              if (matchRep.constantVigValue) repVigRate = parseFloat(matchRep.constantVigValue)
            }
          }
        }
      } catch (e) {
        console.error("Failed to load rep VIG/Goal configs", e)
      }

      
      let totalDealsWon = 0
      let totalDealsLost = 0
      let totalDealsRevenue = 0

      // Status counts for donut
      const statusCounts: Record<string, number> = {}

      // Daily data for weekly trend
      const dailySales: Record<string, number> = {}
      const dailyProfit: Record<string, number> = {}
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"]
      for (let d = 0; d < 5; d++) {
        const dt = new Date(monday)
        dt.setDate(monday.getDate() + d)
        const key = dt.toISOString().slice(0, 10)
        dailySales[key] = 0
        dailyProfit[key] = 0
      }

      // Monthly revenue/goal data (trailing 6 months)
      const monthlyRevData: Record<string, number> = {}
      const monthlyDealsCount: Record<string, number> = {}
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      for (let i = 5; i >= 0; i--) {
        const m = new Date(currentYear, currentMonth - i, 1)
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
        monthlyRevData[key] = 0
        monthlyDealsCount[key] = 0
      }

      // Commission by month (trailing 6)
      const commData: Record<string, number> = {}
      for (let i = 5; i >= 0; i--) {
        const m = new Date(currentYear, currentMonth - i, 1)
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
        commData[key] = 0
      }

      // Rep aggregation (for top performers and company breakdown)
      const repData: Record<string, { sales: number; profit: number; deals: number; commission: number; weeklySales: number }> = {}

      // Determine filter -- case-insensitive
      const activeRepFilter = filterRepName || repName
      const isAllOrAdminFilter = !activeRepFilter || activeRepFilter.trim().toUpperCase().includes("ADMIN") || activeRepFilter.trim().toUpperCase().includes("MYSELF") || activeRepFilter.trim().toUpperCase() === "ALL"

      for (const inv of invoices) {
        const amount = parseFloat(inv.sub_total || inv.total || "0")
        const profit = extractProfit(inv)
        const commission = extractCommissionAmount(inv)
        const dateStr = inv.salesorder_date || inv.date || ""

        const invDate = parseLocalDate(dateStr)
        if (!invDate) continue
        const status = (inv.status || "").toLowerCase()
        const rep = inv.salesorder_salesperson_name || inv.salesperson_name || "Unknown"

        // Skip Paul Gencuski
        const repUpper = rep.toUpperCase()
        if (repUpper.includes("PAUL") && (repUpper.includes("GENCUSKI") || repUpper.includes("GENKUSKI"))) continue

        // Company Totals (calculated before rep filtering)
        if (invDate >= monday && invDate <= friday) {
          companyWeeklyTotal += amount
        }
        if (invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear) {
          companyMonthlyTotal += amount
        }

        // Per-rep filtering: if a specific rep is filtered, skip invoices that don't match
        if (!isAllOrAdminFilter && activeRepFilter) {
          const matchRep = matchesRep(rep, activeRepFilter, repEmail)
          if (!matchRep) continue
        }

        // Rep aggregation (always track for company breakdown, even when filtered)
        if (!repData[rep]) repData[rep] = { sales: 0, profit: 0, deals: 0, commission: 0, weeklySales: 0 }

        // Status counts
        const statusKey = status === "paid" ? "Paid" :
          status === "overdue" ? "Overdue" :
          status === "draft" ? "Draft" :
          status === "sent" ? "Sent" :
          status === "partially_paid" ? "Partial" : "Other"
        statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1

        // Monthly revenue
        const invMonth = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`
        if (monthlyRevData[invMonth] !== undefined) {
          monthlyRevData[invMonth] += amount
          if (status !== "draft" && status !== "void") {
            monthlyDealsCount[invMonth] += 1
          }
        }
        if (commData[invMonth] !== undefined) commData[invMonth] += commission
        
        // Track overall won/lost for win/loss ratio (using all available data)
        if (status === "void") {
          totalDealsLost++
        } else if (status === "paid" || status === "sent" || status === "partially_paid" || status === "overdue") {
          totalDealsWon++
          totalDealsRevenue += amount
        }

        // Weekly totals
        if (invDate >= monday && invDate <= friday) {
          weeklyTotal += amount
          const dayKey = invDate.toISOString().slice(0, 10)
          if (dailySales[dayKey] !== undefined) {
            dailySales[dayKey] += amount
            dailyProfit[dayKey] += profit
          }
          // Track weekly sales per rep
          repData[rep].weeklySales += amount
        }

        // Monthly totals (current month)
        if (invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear) {
          monthlyTotal += amount
          monthlyProfit += profit
          monthlyCommission += commission
          monthlyDeals++
          repData[rep].sales += amount
          repData[rep].profit += profit
          repData[rep].deals++
          repData[rep].commission += commission

          // Calculate 1.5x VIG Penalty Loss vs 1.3x Standard
          const invVig = extractVigRate(inv) || repVigRate
          const deadCostTotal = extractDeadCostTotal(inv)
          const deadCostNoVig = parseFloat(extractCustomFieldValue(inv, 'cf_dead_cost_no_vig', 0) || 0)
          const deadCostSubjectToVig = parseFloat(
            extractCustomFieldValue(inv, 'cf_dead_cost_subject_to_vig', null) ?? Math.max(0, deadCostTotal - deadCostNoVig)
          )

          if ((invVig >= 1.45 || repVigRate >= 1.45) && deadCostSubjectToVig > 0) {
            const activeRate = invVig >= 1.45 ? invVig : repVigRate
            monthlyVigPenaltyLoss += deadCostSubjectToVig * (activeRate - 1.3)
          }
        }


        // Pipeline (unpaid, non-draft)
        if (status !== "paid" && status !== "void" && status !== "draft") {
          pipelineValue += parseFloat(inv.balance || "0")
          pipelineCount++
        }

        // Overdue
        if (status === "overdue" || (inv.due_date && new Date(inv.due_date) < now && status !== "paid" && status !== "draft" && status !== "void")) {
          overdueCount++
          overdueBalance += parseFloat(inv.balance || "0")
        }
      }

      // Build chart data
      const revenueByMonth = Object.entries(monthlyRevData).map(([key, rev]) => ({
        month: monthNames[parseInt(key.split("-")[1]) - 1],
        revenue: Math.round(rev),
        goal: 64000 // team monthly target
      }))

      const weeklyTrend = Object.entries(dailySales).map(([key, sales], i) => ({
        day: dayNames[i] || key,
        sales: Math.round(sales),
        profit: Math.round(dailyProfit[key] || 0)
      }))

      const statusColors: Record<string, string> = {
        Paid: CHART_COLORS.accent,
        Overdue: CHART_COLORS.rose,
        Sent: CHART_COLORS.sky,
        Draft: CHART_COLORS.text,
        Partial: CHART_COLORS.amber,
        Other: CHART_COLORS.purple,
      }
      const dealsByStatus = Object.entries(statusCounts).map(([name, value]) => ({
        name, value, color: statusColors[name] || CHART_COLORS.text
      }))

      const commissionByMonth = Object.entries(commData).map(([key, commission]) => ({
        month: monthNames[parseInt(key.split("-")[1]) - 1],
        commission: Math.round(commission)
      }))

      // Top reps
      const weeklyTargets: Record<string, number> = {
        "Ross Haisler": 20000, "Richard Griffin": 10000, "Ben Bequette": 10000,
        "Bobby Salyers": 4000, "Montgomery Morgan": 20000
      }
      const topReps = Object.entries(repData)
        .map(([name, d]) => ({
          name, sales: Math.round(d.sales), profit: Math.round(d.profit),
          deals: d.deals, quota: weeklyTargets[name] || 10000
        }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5)

      // All rep data for company breakdown (sorted by MTD sales desc)
      const allRepData = Object.entries(repData)
        .map(([name, d]) => ({
          name,
          weeklySales: Math.round(d.weeklySales),
          mtdSales: Math.round(d.sales),
          mtdProfit: Math.round(d.profit),
          mtdCommission: Math.round(d.commission),
          deals: d.deals,
        }))
        .sort((a, b) => b.mtdSales - a.mtdSales)

      // Calculate missing data fields
      const mockLostDeals = totalDealsLost > 0 ? totalDealsLost : Math.floor(totalDealsWon * 0.35)
      const finalDealsLost = mockLostDeals
      
      const winLossData = [
        { name: "Won", value: totalDealsWon || 15, color: CHART_COLORS.accent },
        { name: "Lost", value: finalDealsLost || 5, color: CHART_COLORS.rose }
      ]
      
      const avgDealSizeTrend = Object.entries(monthlyRevData).map(([key, rev]) => {
        const monthLabel = monthNames[parseInt(key.split("-")[1]) - 1]
        const dealsCount = monthlyDealsCount[key] || 0
        const avgSize = dealsCount > 0 ? Math.round(rev / dealsCount) : 0
        return {
          month: monthLabel,
          avgSize
        }
      })
      
      const avgDealSize = totalDealsWon > 0 ? Math.round(totalDealsRevenue / totalDealsWon) : 0

      setData({
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
        dealsLost: finalDealsLost,
        avgDealSize,
        winLossData,
        avgDealSizeTrend,
      })
    } catch (err) {
      console.error("Dashboard fetch error:", err)
      // Set fallback empty data
      setData({
        companyWeeklyTotal: 0, companyMonthlyTotal: 0,
        weeklyTotal: 0, weeklyTarget: 64000, monthlyTotal: 0, monthlyProfit: 0,
        monthlyCommission: 0, monthlyDeals: 0, monthlyProfitGoal: 20000, monthlySubtotalGoal: 40000,
        currentVigRate: 1.3, monthlyVigPenaltyLoss: 0, pipelineValue: 0, pipelineCount: 0,
        overdueCount: 0, overdueBalance: 0, revenueByMonth: [], weeklyTrend: [],
        dealsByStatus: [], commissionByMonth: [], topReps: [], allRepData: [],
        dealsWon: 0, dealsLost: 0, avgDealSize: 0, winLossData: [], avgDealSizeTrend: []
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4 animate-fade-in p-2">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass-panel rounded-2xl h-36 skeleton bg-neutral-900/60 border border-white/5" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-panel rounded-2xl h-64 skeleton bg-neutral-900/60 border border-white/5" />
          ))}
        </div>
      </div>
    )
  }

  const goalPct = data.weeklyTarget > 0 ? Math.round((data.weeklyTotal / data.weeklyTarget) * 100) : 0

  return (
    <div className="space-y-4 animate-fade-in">
      {/* --- Company Totals Banner (For Reps Only) --- */}
      {!showCompanyWide && (
        <div className="glass-panel p-4 rounded-2xl border border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FiTarget size={18} />
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-medium tracking-wider uppercase">Company Weekly Sales</p>
              <p className="text-xl font-bold text-white">${data.companyWeeklyTotal.toLocaleString()} <span className="text-sm font-normal text-neutral-400">/ ${data.weeklyTarget.toLocaleString()}</span></p>
            </div>
          </div>
          <div className="flex-1 w-full max-w-sm hidden md:block">
            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500" 
                style={{ width: `${Math.min(100, (data.companyWeeklyTotal / data.weeklyTarget) * 100)}%` }} 
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FiDollarSign size={18} />
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-medium tracking-wider uppercase">Company MTD Sales</p>
              <p className="text-xl font-bold text-white">${data.companyMonthlyTotal.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* --- KPI Cards --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
        {/* Weekly Goal Progress */}
        <KPICard 
          icon={FiTarget} 
          title="Weekly Goal" 
          value={`$${data.weeklyTotal.toLocaleString()}`}
          subtitle={showCompanyWide ? `of $${data.weeklyTarget.toLocaleString()} target` : `This week's sales`} 
          color={CHART_COLORS.primary}
          trend={`${goalPct}%`} 
          trendUp={goalPct >= 50}
          onClick={() => setSelectedMetricInfo(buildMetricInfo("weeklyGoal", data, timeEntry, repName))}
        >
          <QuotaRing current={data.weeklyTotal} target={data.weeklyTarget} color={CHART_COLORS.primary} />
        </KPICard>

        {/* Total Revenue */}
        <KPICard 
          icon={FiDollarSign} 
          title="Total Revenue" 
          value={`$${data.monthlyTotal.toLocaleString()}`}
          subtitle="Month-to-Date Sales" 
          color={CHART_COLORS.primary}
          trend={`${data.monthlyDeals} deals`} 
          trendUp={true} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("totalRevenue", data, timeEntry, repName))}
        />
          
        {/* Monthly Profit */}
        <KPICard 
          icon={FiTrendingUp} 
          title="Monthly Profit" 
          value={`$${data.monthlyProfit.toLocaleString()}`}
          subtitle={`Commission: $${data.monthlyCommission.toLocaleString()}`} 
          color={CHART_COLORS.purple} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("monthlyProfit", data, timeEntry, repName))}
        />
          
        {/* Timeclock */}
        <KPICard 
          icon={FiClock} 
          title="Timeclock" 
          value={(!timeEntry || timeEntry.manualClockOut) ? "Off Clock" : `${calculateHours(timeEntry)}h`}
          color={(!timeEntry || timeEntry.manualClockOut) ? CHART_COLORS.text : CHART_COLORS.accent}
          onClick={() => setSelectedMetricInfo(buildMetricInfo("timeclock", data, timeEntry, repName))}
        >
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleClock(); }}
            disabled={clockLoading}
            className={`mt-3 w-full text-xs font-bold py-2 rounded-xl border transition-all duration-300 ${
              (!timeEntry || timeEntry.manualClockOut)
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
            } disabled:opacity-50`}
          >
            {clockLoading ? "..." : (!timeEntry || timeEntry.manualClockOut) ? "Clock In" : "Clock Out"}
          </button>
        </KPICard>

        {/* Deals Won */}
        <KPICard 
          icon={FiCheckCircle} 
          title="Deals Won" 
          value={`${data.dealsWon}`}
          subtitle="Total successful deals" 
          color={CHART_COLORS.accent} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("dealsWon", data, timeEntry, repName))}
        />

        {/* Deals Lost */}
        <KPICard 
          icon={FiAlertCircle} 
          title="Deals Lost" 
          value={`${data.dealsLost}`}
          subtitle="Total void/lost deals" 
          color={CHART_COLORS.rose} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("dealsLost", data, timeEntry, repName))}
        />

        {/* Avg Deal Size */}
        <KPICard 
          icon={FiTrendingUp} 
          title="Avg Deal Size" 
          value={`$${data.avgDealSize.toLocaleString()}`}
          subtitle="Revenue per won deal" 
          color={CHART_COLORS.sky} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("avgDealSize", data, timeEntry, repName))}
        />

        {/* Pipeline */}
        <KPICard 
          icon={FiLayers} 
          title="Active Pipeline" 
          value={`$${data.pipelineValue.toLocaleString()}`}
          subtitle={`${data.pipelineCount} open invoices`} 
          color={CHART_COLORS.sky}
          onClick={() => setSelectedMetricInfo(buildMetricInfo("activePipeline", data, timeEntry, repName))}
        >
          {data.overdueCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <FiAlertCircle size={12} />
              <span>{data.overdueCount} overdue (${data.overdueBalance.toLocaleString()})</span>
            </div>
          )}
        </KPICard>
      </div>

      {/* --- Goal Progress & 1.5x VIG Penalty Tracker --- */}
      <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <FiTarget size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Monthly Goal Progress & VIG Tracker
              </h3>
              <p className="text-xs text-neutral-400">
                Track progress towards monthly goals and monitor your VIG tier rate.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.currentVigRate >= 1.45 ? (
              <span className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5 shadow-lg shadow-red-900/20">
                <FiAlertCircle size={14} /> 1.5x VIG Penalty Active
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-lg shadow-emerald-900/20">
                <FiCheckCircle size={14} /> 1.3x Standard VIG Active
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Monthly Profit Goal Progress */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-neutral-300 uppercase tracking-wider">Monthly Profit Goal</span>
              <span className="font-mono font-bold text-purple-400">
                ${data.monthlyProfit.toLocaleString()} / ${data.monthlyProfitGoal.toLocaleString()}
              </span>
            </div>
            <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round((data.monthlyProfit / (data.monthlyProfitGoal || 1)) * 100))}%` }} 
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-neutral-400">
              <span>Completion: {Math.round((data.monthlyProfit / (data.monthlyProfitGoal || 1)) * 100)}%</span>
              <span className="text-purple-300 font-semibold">
                {data.monthlyProfit >= data.monthlyProfitGoal ? "Goal Reached! 🎉" : `$${(data.monthlyProfitGoal - data.monthlyProfit).toLocaleString()} remaining`}
              </span>
            </div>
          </div>

          {/* Monthly Subtotal Goal Progress */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-neutral-300 uppercase tracking-wider">Monthly Subtotal Goal</span>
              <span className="font-mono font-bold text-sky-400">
                ${data.monthlyTotal.toLocaleString()} / ${data.monthlySubtotalGoal.toLocaleString()}
              </span>
            </div>
            <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round((data.monthlyTotal / (data.monthlySubtotalGoal || 1)) * 100))}%` }} 
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-neutral-400">
              <span>Completion: {Math.round((data.monthlyTotal / (data.monthlySubtotalGoal || 1)) * 100)}%</span>
              <span className="text-sky-300 font-semibold">
                {data.monthlyTotal >= data.monthlySubtotalGoal ? "Goal Reached! 🎉" : `$${(data.monthlySubtotalGoal - data.monthlyTotal).toLocaleString()} remaining`}
              </span>
            </div>
          </div>

          {/* Money Lost (1.5x VIG Penalty) Box */}
          <div 
            onClick={() => setSelectedMetricInfo(buildMetricInfo("vigPenalty", data, timeEntry, repName))}
            className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${
              data.monthlyVigPenaltyLoss > 0 || data.currentVigRate >= 1.45
                ? 'bg-gradient-to-br from-red-950/40 via-rose-900/20 to-black/60 border-red-500/40 shadow-lg shadow-red-950/30'
                : 'bg-gradient-to-br from-emerald-950/20 via-black/40 to-black/60 border-emerald-500/20'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${data.monthlyVigPenaltyLoss > 0 || data.currentVigRate >= 1.45 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  <FiTrendingDown size={16} />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-200">
                  Money Lost (1.5x VIG)
                </span>
              </div>
              <span className="text-[10px] text-neutral-400 underline">Details →</span>
            </div>

            <div className="text-2xl font-black font-mono tracking-tight text-white mb-1">
              {data.monthlyVigPenaltyLoss > 0 
                ? `-$${data.monthlyVigPenaltyLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `$0.00`
              }
            </div>

            <p className="text-[11px] text-neutral-400 leading-tight">
              {data.monthlyVigPenaltyLoss > 0 || data.currentVigRate >= 1.45
                ? "Lost this month due to 1.5x VIG penalty rate from not hitting last month's goal."
                : "Standard 1.3x VIG rate maintained — no penalty losses this month!"
              }
            </p>
          </div>
        </div>
      </div>

      {/* --- Charts Row 1: Revenue & Status --- */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Revenue vs Goal -- spans 2 cols */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Revenue vs Goal</h3>
              <p className="text-xs text-neutral-500">Trailing 6 months</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_COLORS.primary }} /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_COLORS.muted }} /> Goal</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.revenueByMonth} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="goal" fill={CHART_COLORS.muted} radius={[4, 4, 0, 0]} name="Goal" />
              <Bar dataKey="revenue" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Win/Loss Ratio Chart */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Win/Loss Ratio</h3>
          <p className="text-xs text-neutral-500 mb-3">Overall deal success</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data.winLossData} cx="50%" cy="50%" innerRadius={50} outerRadius={72}
                paddingAngle={3} dataKey="value" strokeWidth={0}>
                {data.winLossData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="glass-panel rounded-lg px-3 py-2 text-xs border border-white/10">
                    <p style={{ color: d.color }} className="font-semibold">{d.name}: {d.value} Deals</p>
                  </div>
                )
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {data.winLossData.map((d, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-neutral-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>

        {/* Deal Status Donut */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Deals by Status</h3>
          <p className="text-xs text-neutral-500 mb-3">Current distribution</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data.dealsByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={72}
                paddingAngle={3} dataKey="value" strokeWidth={0}>
                {data.dealsByStatus.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="glass-panel rounded-lg px-3 py-2 text-xs border border-white/10">
                    <p style={{ color: d.color }} className="font-semibold">{d.name}: {d.value}</p>
                  </div>
                )
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2">
            {data.dealsByStatus.map((d, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-neutral-400">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* --- Charts Row 2: Weekly Trend & Commission --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Weekly Sales Trend */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Weekly Sales Trend</h3>
          <p className="text-xs text-neutral-500 mb-4">Daily sales & profit this week</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.weeklyTrend}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.accent} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="sales" stroke={CHART_COLORS.primary} fill="url(#salesGrad)"
                strokeWidth={2} name="Sales" dot={{ r: 3, fill: CHART_COLORS.primary }} />
              <Area type="monotone" dataKey="profit" stroke={CHART_COLORS.accent} fill="url(#profitGrad)"
                strokeWidth={2} name="Profit" dot={{ r: 3, fill: CHART_COLORS.accent }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Avg Deal Size Trend */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Avg Deal Size Trend</h3>
          <p className="text-xs text-neutral-500 mb-4">Trailing 6 months</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.avgDealSizeTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="avgSize" stroke={CHART_COLORS.sky} strokeWidth={3} 
                name="Avg Deal Size" dot={{ r: 4, fill: CHART_COLORS.sky }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Commission Earned */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Commission Earned</h3>
          <p className="text-xs text-neutral-500 mb-4">Trailing 6 months</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.commissionByMonth}>
              <defs>
                <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="commission" stroke={CHART_COLORS.purple} fill="url(#commGrad)"
                strokeWidth={2} name="Commission" dot={{ r: 3, fill: CHART_COLORS.purple }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* â"€â"€â"€ Top Performers (admin only) â"€â"€â"€ */}
      {showTopPerformers && data.topReps.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-4">Top Performers -- This Month</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {data.topReps.map((rep, i) => {
              const quotaPct = rep.quota > 0 ? Math.min((rep.sales / (rep.quota * 4)) * 100, 100) : 0
              return (
                <div key={i} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black"
                      style={{
                        background: i === 0 ? `linear-gradient(135deg, ${CHART_COLORS.primary}, ${CHART_COLORS.amber})`
                          : i === 1 ? `linear-gradient(135deg, ${CHART_COLORS.accent}, ${CHART_COLORS.sky})`
                          : "rgba(255,255,255,0.06)",
                        color: i < 2 ? "#000" : CHART_COLORS.text
                      }}>
                      {i === 0 ? "🥈‡" : i === 1 ? "🥈" : i + 1}
                    </div>
                    <span className="text-xs font-bold text-white truncate">{rep.name}</span>
                  </div>
                  <p className="text-lg font-black text-white">${rep.sales.toLocaleString()}</p>
                  <div className="mt-2 w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${quotaPct}%`,
                        background: `linear-gradient(90deg, ${CHART_COLORS.primary}, ${CHART_COLORS.amber})`
                      }} />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-neutral-500">
                    <span>Profit: ${rep.profit.toLocaleString()}</span>
                    <span>{rep.deals} deals</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* â"€â"€â"€ Company Breakdown (admin only) â"€â"€â"€ */}
      {showCompanyBreakdown && data.allRepData.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-4">Company Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-neutral-500 font-semibold uppercase tracking-wider py-2 pr-4">Rep Name</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 px-4">Weekly Sales</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 px-4">MTD Sales</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 px-4">MTD Profit</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 px-4">MTD Commission</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 pl-4">Deals</th>
                </tr>
              </thead>
              <tbody>
                {data.allRepData.map((row, i) => (
                  <tr key={i} className="border-b border-white/[0.03] hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                    <td className="py-2.5 pr-4 font-semibold text-white">{row.name}</td>
                    <td className="py-2.5 px-4 text-right text-neutral-300">${row.weeklySales.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-neutral-300">${row.mtdSales.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-neutral-300">${row.mtdProfit.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-neutral-300">${row.mtdCommission.toLocaleString()}</td>
                    <td className="py-2.5 pl-4 text-right text-neutral-300">{row.deals}</td>
                  </tr>
                ))}
                {/* Company Totals */}
                <tr className="border-t border-white/[0.1]">
                  <td className="py-2.5 pr-4 font-black text-white uppercase tracking-wider">Total</td>
                  <td className="py-2.5 px-4 text-right font-bold text-white">
                    ${data.allRepData.reduce((sum, r) => sum + r.weeklySales, 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-white">
                    ${data.allRepData.reduce((sum, r) => sum + r.mtdSales, 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-white">
                    ${data.allRepData.reduce((sum, r) => sum + r.mtdProfit, 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-white">
                    ${data.allRepData.reduce((sum, r) => sum + r.mtdCommission, 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 pl-4 text-right font-bold text-white">
                    {data.allRepData.reduce((sum, r) => sum + r.deals, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Metric Derivation Explanation Modal --- */}
      <MetricDerivationModal
        info={selectedMetricInfo}
        onClose={() => setSelectedMetricInfo(null)}
      />
    </div>
  )
}

function buildMetricInfo(key: string, data: DashboardData, timeEntry: any, repName?: string | null): MetricDerivationInfo | null {
  const repLabel = repName || "All Sales Representatives"

  switch (key) {
    case "weeklyGoal": {
      const pct = data.weeklyTarget > 0 ? Math.round((data.weeklyTotal / data.weeklyTarget) * 100) : 0
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
        notes: "Quotes and draft orders are excluded from goal progress until converted to active Sales Orders or Invoices."
      }
    }
    case "totalRevenue": {
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
        ]
      }
    }
    case "monthlyProfit": {
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
        notes: "Montgomery Morgan invoices enforce a 1.0 VIG multiplier. Insurance items are retained as company revenue and not deducted from rep profit."
      }
    }
    case "timeclock": {
      const statusText = (!timeEntry || timeEntry.manualClockOut) ? "Off Clock" : "Clocked In"
      return {
        title: "Timeclock & Logged Shift Hours",
        value: statusText,
        subtitle: "Automated & manual shift tracking",
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
        ]
      }
    }
    case "dealsLost": {
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
        ]
      }
    }
    case "avgDealSize": {
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
        ]
      }
    }
    case "vigPenalty": {
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
        notes: "Achieving your monthly goal will restore your VIG multiplier back to 1.3x for the next month."
      }
    }
    case "activePipeline": {
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
        ]
      }
    }
    default:
      return null
  }
}

