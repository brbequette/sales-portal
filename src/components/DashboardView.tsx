"use client"


import { useEffect, useState, useRef, useMemo } from "react"
import {
  FiTarget, FiDollarSign, FiTrendingUp, FiClock, FiLayers,
  FiArrowUpRight, FiArrowDownRight, FiCheckCircle, FiAlertCircle, FiTrendingDown,
  FiSliders, FiX, FiEye, FiEyeOff, FiAward, FiShoppingCart, FiFileText, FiRefreshCw, FiSearch, FiUsers, FiZap, FiPhoneCall, FiCalendar
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
  if (!filterName && !repEmail) return false

  const rep = (invoiceRep || "").trim().toUpperCase()
  if (!rep) return false

  if (filterName) {
    const filter = filterName.trim().toUpperCase()
    if (filter === "ALL") return true

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
  }

  if (repEmail) {
    const emailUpper = repEmail.trim().toUpperCase()
    const emailPrefix = emailUpper.split("@")[0].split(".")[0]
    const repParts = rep.split(/\s+/).filter(Boolean)
    if (emailPrefix.length >= 3 && (rep.includes(emailPrefix) || (repParts.length > 0 && emailPrefix.includes(repParts[0])))) {
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

function formatRepCurrency(amount: number): string {
  return `$${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatRepDate(dateStr?: string): string {
  if (!dateStr) return "N/A"
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}

function getStatusBadgeClass(statusStr?: string): string {
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

// ------ Main Dashboard Component ------
export function DashboardView({ repName, isAdmin, repEmail }: DashboardViewProps) {
  const { zohoContext: currentUser } = useZoho()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCompanyWide, setShowCompanyWide] = useState<boolean>(false)
  const [timeEntry, setTimeEntry] = useState<any | null>(null)
  const [clockLoading, setClockLoading] = useState(false)
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<MetricDerivationInfo | null>(null)
  const [rawInvoicesList, setRawInvoicesList] = useState<any[]>([])

  const [repWidgets, setRepWidgets] = useState<RepWidgetConfig[]>(DEFAULT_REP_DASHBOARD_LAYOUT)
  const [isRepCustomizerOpen, setIsRepCustomizerOpen] = useState(false)

  // --- Rep Stats Board State ---
  // For non-admins, auto-scope to current rep's name; for admins use 'all' (company aggregate)
  const [repStatsReps, setRepStatsReps] = useState<any[]>([])
  const repStatsSelectedRepId = isAdmin ? "all" : (repName || "all")
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

  const fetchRepStatsData = async () => {
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
      }
    } catch (e) {
      console.error("Failed to load rep stats on dashboard", e)
    } finally {
      setRepStatsLoading(false)
    }
  }

  useEffect(() => {
    fetchRepStatsData()
  }, [repStatsSelectedRepId, repStatsPeriod, repStatsStartDate, repStatsEndDate, repName, isAdmin])

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

  const handleUpdateRepWidgets = (updated: RepWidgetConfig[]) => {
    setRepWidgets(updated)
    try {
      localStorage.setItem("rep_dashboard_widget_layout", JSON.stringify(updated))
    } catch (e) {
      console.error("Failed to save rep layout", e)
    }
  }

  const isVisible = (id: string) => {
    return repWidgets.find(w => w.id === id)?.visible !== false
  }

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
  }, [repName, isAdmin, repEmail, showCompanyWide])

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
            if (json && Array.isArray(json.invoices) && json.invoices.length > 0) {
              invoices = json.invoices
            }
          }
        }
      } catch (e) {
        console.error("Dashboard invoice fetch failed:", e)
      }

      // Fallback: If /api/zoho-invoices returns empty or fails, load from /api/get-commissions?year=all
      if (invoices.length === 0) {
        try {
          const commRes = await fetch("/api/get-commissions?year=all&includeHidden=true")
          if (commRes.ok) {
            const commData = await commRes.json()
            if (commData.success && commData.byRep) {
              const allRepInvoices = Object.entries(commData.byRep).flatMap(([repId, r]: [string, any]) => {
                return (r.invoices || []).map((inv: any) => ({
                  ...inv,
                  repName: r.repName || "Unknown",
                  salesperson: r.repName || "Unknown",
                  salesperson_name: r.repName || "Unknown",
                  salesorder_salesperson_name: r.repName || "Unknown",
                  profit: inv.profit || 0,
                  cf_profit: inv.profit || 0,
                  cf_profit_unformatted: inv.profit || 0,
                  commission: inv.commission?.total || (inv.profit * 0.5) || 0,
                  cf_commision_amount: inv.commission?.total || (inv.profit * 0.5) || 0,
                  cf_commision_amount_unformatted: inv.commission?.total || (inv.profit * 0.5) || 0
                }))
              })
              invoices = allRepInvoices.map((inv: any) => ({
                sub_total: inv.amount || 0,
                total: inv.amount || 0,
                date: inv.issueDate || inv.paymentDate || inv.createdAt,
                salesorder_date: inv.issueDate || inv.paymentDate || inv.createdAt,
                status: inv.isPaid || inv.status === 'paid' || inv.status === 'Paid' ? 'paid' : (inv.status?.toLowerCase() || 'sent'),
                ...inv
              }))
            }
          }
        } catch (e) {
          console.error("Dashboard fallback commission fetch failed:", e)
        }
      }
      setRawInvoicesList(invoices)
      
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
            if (showCompanyWide) {
              let sumProfitGoal = 0
              let sumSubtotalGoal = 0
              const today = new Date()
              const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
              const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
              let workdaysInMonth = 0
              const curDate = new Date(firstDayOfMonth)
              while (curDate <= lastDayOfMonth) {
                if (curDate.getDay() !== 0 && curDate.getDay() !== 6) {
                  workdaysInMonth++
                }
                curDate.setDate(curDate.getDate() + 1)
              }
              workdaysInMonth = Math.max(1, workdaysInMonth)

              vigData.repConfigs.forEach((r: any) => {
                // Only account for goals of show on salesboard reps
                if (!r.showOnSalesBoard) {
                  return
                }
                const emailLower = (r.email || "").toLowerCase()
                const nameLower = (r.name || "").toLowerCase()
                // Exclude admins and test/dummy accounts
                if (
                  emailLower.includes("dummy") || 
                  emailLower.includes("example.com") || 
                  emailLower.includes("test_migration") ||
                  emailLower.includes("ben@titandiamond.net") ||
                  emailLower.includes("ben@titandiamond.com") ||
                  emailLower.includes("admin@titandiamond.com") ||
                  nameLower.includes("admin") ||
                  nameLower.includes("benjamin")
                ) {
                  return
                }
                sumProfitGoal += (r.dailyProfitGoal > 0 ? r.dailyProfitGoal * workdaysInMonth : 1000 * workdaysInMonth)
                sumSubtotalGoal += (r.dailySubtotalGoal > 0 ? r.dailySubtotalGoal * workdaysInMonth : 2000 * workdaysInMonth)
              })
              if (sumProfitGoal > 0) repProfitGoal = sumProfitGoal
              if (sumSubtotalGoal > 0) repSubtotalGoal = sumSubtotalGoal
            } else {
              const activeFilter = filterRepName || repName
              const matchRep = vigData.repConfigs.find((r: any) => 
                (activeFilter && r.name.toLowerCase().includes(activeFilter.toLowerCase())) ||
                (repEmail && r.email.toLowerCase() === repEmail.toLowerCase())
              )
              if (matchRep) {
                const today = new Date()
                const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
                const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
                let workdaysInMonth = 0
                const curDate = new Date(firstDayOfMonth)
                while (curDate <= lastDayOfMonth) {
                  if (curDate.getDay() !== 0 && curDate.getDay() !== 6) {
                    workdaysInMonth++
                  }
                  curDate.setDate(curDate.getDate() + 1)
                }
                workdaysInMonth = Math.max(1, workdaysInMonth)

                if (matchRep.dailyProfitGoal > 0) repProfitGoal = matchRep.dailyProfitGoal * workdaysInMonth
                if (matchRep.dailySubtotalGoal > 0) repSubtotalGoal = matchRep.dailySubtotalGoal * workdaysInMonth
                if (matchRep.constantVigValue) repVigRate = parseFloat(matchRep.constantVigValue)
              }
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
      const activeEmailFilter = repEmail || currentUser?.email

      for (const inv of invoices) {
        const amount = parseFloat(inv.sub_total || inv.total || "0")
        const profit = inv.deadProfit !== undefined ? Number(inv.deadProfit) : extractProfit(inv)
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

        // Always track per-rep totals for company breakdown
        if (!repData[rep]) repData[rep] = { sales: 0, profit: 0, deals: 0, commission: 0, weeklySales: 0 }

        // Per-rep filtering: if NOT showing company wide, filter strictly for rep
        if (!showCompanyWide) {
          const matchRep = matchesRep(rep, activeRepFilter, activeEmailFilter)
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
      {/* Display Settings Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-neutral-900/60 border border-white/10 rounded-2xl shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <FiSliders size={15} />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              Performance & KPI Dashboard
            </h3>
            <p className="text-[10px] text-neutral-500 font-semibold mt-0.5">
              {isAdmin ? "Viewing company-wide aggregated metrics" : `Showing metrics for ${repName || currentUser?.name || 'you'}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            onClick={() => setIsRepCustomizerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] font-bold rounded-lg border border-white/10 transition-colors"
          >
            ⚙️ Customize Layout
          </button>
        </div>
      </div>

      {/* --- Company Totals Banner --- */}
      {(
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



      {/* --- Rep Performance & Financial Board Section --- */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 space-y-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FiTrendingUp className="text-orange-400" /> Rep Performance &amp; Financial Board
            </h2>
            <p className="text-xs text-neutral-400">
              Evaluate Billed Invoices &amp; Sales Orders with exact commission calculations, VIG dead profit, and net totals.
            </p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              onClick={fetchRepStatsData}
              disabled={repStatsLoading}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl border border-white/10 flex items-center gap-2 cursor-pointer transition-all"
            >
              <FiRefreshCw className={repStatsLoading ? "animate-spin" : ""} size={14} /> Refresh Data
            </button>
          </div>
        </div>

        {/* Filters Bar: Date Period Only (rep auto-scoped by role) */}
        <div className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-1">
          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
            <FiCalendar /> Date Range / Period
            {!isAdmin && repName && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[9px] font-black">
                📊 {repName}
              </span>
            )}
            {isAdmin && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-black">
                🏢 Company Aggregate
              </span>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "today", label: "Today" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month (MTD)" },
              { id: "last_month", label: "Last Month" },
              { id: "this_year", label: "This Year (YTD)" },
              { id: "last_year", label: "Last Year" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom Range" },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setRepStatsPeriod(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  repStatsPeriod === p.id
                    ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {p.id === "all" ? "🌟 " : ""}{p.label}
              </button>
            ))}
          </div>

          {repStatsPeriod === "custom" && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="date"
                value={repStatsStartDate}
                onChange={e => setRepStatsStartDate(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
              <span className="text-xs text-neutral-500">to</span>
              <input
                type="date"
                value={repStatsEndDate}
                onChange={e => setRepStatsEndDate(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          )}
        </div>

        {/* INVOICES TOTALS SUMMARY (Interactive Clickable Tiles) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
            <FiFileText /> Invoices Totals Summary (Click any tile to inspect documents)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => setRepStatsTileModalInfo({ title: "Invoiced Sales Subtotals Breakdown", type: "invoices", docs: repStatsAllInvoices })}
              className="bg-neutral-900/60 border border-sky-500/20 hover:border-sky-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-sky-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Invoice Subtotals</span>
                <span className="text-[9px] font-bold text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Docs
                </span>
              </div>
              <p className="text-2xl font-black text-white">{formatRepCurrency(repStatsTotals.invoiceSubtotal)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">{repStatsTotals.invoiceCount} Invoices Billed</p>
            </div>

            <div
              onClick={() => setRepStatsTileModalInfo({ title: "Dead Profit (VIG) Breakdown", type: "invoices", docs: repStatsAllInvoices })}
              className="bg-neutral-900/60 border border-emerald-500/20 hover:border-emerald-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Dead Profit (VIG)</span>
                <span className="text-[9px] font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Docs
                </span>
              </div>
              <p className="text-2xl font-black text-emerald-400">{formatRepCurrency(repStatsTotals.invoiceDeadProfit)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">Gross profit before baseline</p>
            </div>

            <div
              onClick={() => setRepStatsTileModalInfo({ title: "Net Profit (After VIG) Breakdown", type: "invoices", docs: repStatsAllInvoices })}
              className="bg-neutral-900/60 border border-emerald-500/20 hover:border-emerald-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Net Profit (After VIG)</span>
                <span className="text-[9px] font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Docs
                </span>
              </div>
              <p className="text-2xl font-black text-emerald-400">{formatRepCurrency(repStatsTotals.invoiceNetProfit)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">Net profit after baseline VIG rate</p>
            </div>

            <div
              onClick={() => setRepStatsTileModalInfo({ title: "Invoice Commissions Breakdown", type: "invoices", docs: repStatsAllInvoices })}
              className="bg-neutral-900/60 border border-amber-500/20 hover:border-amber-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-amber-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1">
                  💰 Invoice Commissions
                </span>
                <span className="text-[9px] font-bold text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Docs
                </span>
              </div>
              <p className="text-2xl font-black text-amber-400">{formatRepCurrency(repStatsTotals.invoiceCommission)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">50% Rep Earned Commissions</p>
            </div>
          </div>

          {/* COMPANY-WIDE TOTALS — Labeled Summary Rows */}
          <div className="bg-black/40 border border-white/[0.06] rounded-2xl p-4 space-y-3">
            <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
              🏢 Company-Wide Totals
              <span className="text-[9px] font-medium text-neutral-600 normal-case tracking-normal">All reps, same period</span>
            </h4>
            <div className="divide-y divide-white/5">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-neutral-400 font-semibold">Invoice Subtotals</span>
                <span className="text-sm font-black text-white font-mono">{formatRepCurrency(repStatsTotals.invoiceSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-neutral-400 font-semibold">Total Invoices Billed</span>
                <span className="text-sm font-black text-sky-400 font-mono">{repStatsTotals.invoiceCount}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-neutral-400 font-semibold">Dead Profit (VIG)</span>
                <span className="text-sm font-black text-emerald-400 font-mono">{formatRepCurrency(repStatsTotals.invoiceDeadProfit)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-neutral-400 font-semibold">Net Profit (After VIG)</span>
                <span className="text-sm font-black text-emerald-300 font-mono">{formatRepCurrency(repStatsTotals.invoiceNetProfit)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-amber-400 font-bold">💰 Total Commissions Earned</span>
                <span className="text-sm font-black text-amber-400 font-mono">{formatRepCurrency(repStatsTotals.invoiceCommission)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* SALES ORDERS TOTALS SUMMARY (Uninvoiced Only) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
            <FiShoppingCart /> Uninvoiced Sales Orders Summary (Click any tile to inspect orders)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => setRepStatsTileModalInfo({ title: "Sales Orders Subtotals Breakdown", type: "salesOrders", docs: repStatsAllSalesOrders })}
              className="bg-neutral-900/60 border border-purple-500/20 hover:border-purple-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Sales Order Subtotals</span>
                <span className="text-[9px] font-bold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Orders
                </span>
              </div>
              <p className="text-2xl font-black text-white">{formatRepCurrency(repStatsTotals.salesOrderSubtotal)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">{repStatsTotals.salesOrderCount} Orders Created</p>
            </div>

            <div
              onClick={() => setRepStatsTileModalInfo({ title: "Sales Order Dead Profit Breakdown", type: "salesOrders", docs: repStatsAllSalesOrders })}
              className="bg-neutral-900/60 border border-purple-500/20 hover:border-purple-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Sales Order Dead Profit</span>
                <span className="text-[9px] font-bold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Orders
                </span>
              </div>
              <p className="text-2xl font-black text-purple-300">{formatRepCurrency(repStatsTotals.salesOrderDeadProfit)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">Gross profit on orders</p>
            </div>

            <div
              onClick={() => setRepStatsTileModalInfo({ title: "Est. Order Commissions Breakdown", type: "salesOrders", docs: repStatsAllSalesOrders })}
              className="bg-neutral-900/60 border border-purple-500/20 hover:border-purple-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-purple-300 tracking-wider flex items-center gap-1">
                  💼 Est. Order Commissions
                </span>
                <span className="text-[9px] font-bold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Orders
                </span>
              </div>
              <p className="text-2xl font-black text-purple-300">{formatRepCurrency(repStatsTotals.salesOrderEstCommission)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">Est. commission upon invoicing</p>
            </div>
          </div>
        </div>



        {/* Global Document Datapoints Table (Invoices & Sales Orders across reps) */}
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRepStatsActiveTab("invoices")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  repStatsActiveTab === "invoices"
                    ? "bg-sky-500 text-white shadow-md"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                📄 All Invoices ({repStatsAllInvoices.length})
              </button>
              <button
                onClick={() => setRepStatsActiveTab("salesOrders")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  repStatsActiveTab === "salesOrders"
                    ? "bg-purple-600 text-white shadow-md"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                📦 Uninvoiced Sales Orders ({repStatsAllSalesOrders.length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <FiSearch className="absolute left-3 top-2.5 text-neutral-500" size={14} />
              <input
                type="text"
                value={repStatsSearchQuery}
                onChange={e => setRepStatsSearchQuery(e.target.value)}
                placeholder="Search document # or customer..."
                className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {repStatsActiveTab === "invoices" ? (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-400 uppercase text-[10px] tracking-wider bg-black/30">
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Issue Date</th>
                    <th className="p-3">Customer Account</th>
                    <th className="p-3">Salesperson</th>
                    <th className="p-3 text-right">Subtotal</th>
                    <th className="p-3 text-right">Dead Profit</th>
                    <th className="p-3 text-right text-amber-400 font-bold">Commission</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {repStatsAllInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-neutral-500">
                        No invoice datapoints found for the selected range.
                      </td>
                    </tr>
                  ) : (
                    repStatsAllInvoices.map((inv, idx) => (
                      <tr key={inv.id || idx} className="hover:bg-white/5 transition-colors">
                        <td className="p-3">
                          <a
                            href={`/invoices/${inv.id || inv.invoiceNumber}`}
                            className="font-mono font-bold text-sky-400 hover:text-sky-300 hover:underline transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            #{inv.invoiceNumber}
                          </a>
                        </td>
                        <td className="p-3 text-neutral-400">{formatRepDate(inv.date)}</td>
                        <td className="p-3 font-semibold text-white">{inv.customerName}</td>
                        <td className="p-3 text-neutral-300">{inv.repName}</td>
                        <td className="p-3 text-right font-mono font-bold text-white">{formatRepCurrency(inv.subtotal || 0)}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatRepCurrency(inv.deadProfit || 0)}</td>
                        <td className="p-3 text-right font-mono font-bold text-amber-400">{formatRepCurrency(inv.commission || 0)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${getStatusBadgeClass(inv.status)}`}>
                            {inv.status || "paid"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-400 uppercase text-[10px] tracking-wider bg-black/30">
                    <th className="p-3">Sales Order #</th>
                    <th className="p-3">Order Date</th>
                    <th className="p-3">Customer Account</th>
                    <th className="p-3">Salesperson</th>
                    <th className="p-3 text-right">Subtotal</th>
                    <th className="p-3 text-right">Dead Profit</th>
                    <th className="p-3 text-right text-purple-300 font-bold">Est. Commission</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {repStatsAllSalesOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-neutral-500">
                        No sales order datapoints found for the selected range.
                      </td>
                    </tr>
                  ) : (
                    repStatsAllSalesOrders.map((so, idx) => (
                      <tr key={so.id || idx} className="hover:bg-white/5 transition-colors">
                        <td className="p-3">
                          <a
                            href={`/sales/orders/${so.id || so.salesOrderNumber}`}
                            className="font-mono font-bold text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            #{so.salesOrderNumber}
                          </a>
                        </td>
                        <td className="p-3 text-neutral-400">{formatRepDate(so.date)}</td>
                        <td className="p-3 font-semibold text-white">{so.customerName}</td>
                        <td className="p-3 text-neutral-300">{so.repName}</td>
                        <td className="p-3 text-right font-mono font-bold text-white">{formatRepCurrency(so.subtotal || 0)}</td>
                        <td className="p-3 text-right font-mono font-bold text-purple-300">{formatRepCurrency(so.deadProfit || 0)}</td>
                        <td className="p-3 text-right font-mono font-bold text-purple-300">{formatRepCurrency(so.estCommission || 0)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${getStatusBadgeClass(so.status)}`}>
                            {so.status || "confirmed"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Rep Stats Tile Modal Inspection Popup */}
      {repStatsTileModalInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/20 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FiFileText className={repStatsTileModalInfo.type === "invoices" ? "text-sky-400" : "text-purple-400"} />
                  {repStatsTileModalInfo.title}
                </h2>
                <p className="text-xs text-neutral-400">
                  Showing {repStatsTileModalInfo.docs.length} {repStatsTileModalInfo.type === "invoices" ? "invoice" : "sales order"} document(s) included in this total metric.
                </p>
              </div>
              <button
                onClick={() => setRepStatsTileModalInfo(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 border border-white/10 rounded-xl bg-black/40">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] sticky top-0 border-b border-white/10">
                  <tr>
                    <th className="p-3">{repStatsTileModalInfo.type === "invoices" ? "Invoice #" : "Sales Order #"}</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer Account</th>
                    <th className="p-3">Salesperson</th>
                    <th className="p-3 text-right">Subtotal</th>
                    <th className="p-3 text-right">Dead Profit</th>
                    <th className="p-3 text-right">{repStatsTileModalInfo.type === "invoices" ? "Commission" : "Est. Commission"}</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {repStatsTileModalInfo.docs.map((doc: any, idx: number) => (
                    <tr key={doc.id || idx} className="hover:bg-white/5">
                      <td className="p-3">
                        {doc.invoiceNumber ? (
                          <a
                            href={`/invoices/${doc.id || doc.invoiceNumber}`}
                            className="font-mono font-bold text-sky-400 hover:text-sky-300 hover:underline transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            #{doc.invoiceNumber}
                          </a>
                        ) : (
                          <a
                            href={`/sales/orders/${doc.id || doc.salesOrderNumber}`}
                            className="font-mono font-bold text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            #{doc.salesOrderNumber}
                          </a>
                        )}
                      </td>
                      <td className="p-3 text-neutral-400">{formatRepDate(doc.date)}</td>
                      <td className="p-3 font-semibold text-white">{doc.customerName}</td>
                      <td className="p-3 text-neutral-300">{doc.repName}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">{formatRepCurrency(doc.subtotal || 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatRepCurrency(doc.deadProfit || 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-400">{formatRepCurrency(doc.commission || doc.estCommission || 0)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${getStatusBadgeClass(doc.status)}`}>
                          {doc.status || "completed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10 shrink-0">
              <span className="text-xs text-neutral-400">Total Count: <strong className="text-white">{repStatsTileModalInfo.docs.length}</strong></span>
              <button
                onClick={() => setRepStatsTileModalInfo(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rep Stats Individual Rep Breakdown Modal Popup */}
      {repStatsModalRep && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/20 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FiUsers className="text-orange-400" /> {repStatsModalRep.repName} Financial Breakdown
                </h2>
                <p className="text-xs text-neutral-400">Period: {repStatsPeriod.replace("_", " ").toUpperCase()}</p>
              </div>
              <button
                onClick={() => setRepStatsModalRep(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal KPI Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
              <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                <p className="text-[10px] text-neutral-400 uppercase font-bold">Invoices Billed</p>
                <p className="text-lg font-bold text-white">{formatRepCurrency(repStatsModalRep.totals?.invoiceSubtotal || 0)}</p>
                <p className="text-[9px] text-neutral-500">{repStatsModalRep.totals?.invoiceCount || 0} Invoices</p>
              </div>

              <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                <p className="text-[10px] text-neutral-400 uppercase font-bold">Dead Profit</p>
                <p className="text-lg font-bold text-emerald-400">{formatRepCurrency(repStatsModalRep.totals?.invoiceDeadProfit || 0)}</p>
              </div>

              <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                <p className="text-[10px] text-neutral-400 uppercase font-bold">Earned Comm.</p>
                <p className="text-lg font-bold text-amber-400">{formatRepCurrency(repStatsModalRep.totals?.invoiceCommission || 0)}</p>
              </div>

              <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                <p className="text-[10px] text-neutral-400 uppercase font-bold">SO Est. Comm.</p>
                <p className="text-lg font-bold text-purple-300">{formatRepCurrency(repStatsModalRep.totals?.salesOrderEstCommission || 0)}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10 shrink-0">
              <button
                onClick={() => setRepStatsModalRep(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- KPI Cards --- */}
      {isVisible("KPI_CARDS") && (
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
          onClick={() => setSelectedMetricInfo(buildMetricInfo("weeklyGoal", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
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
          onClick={() => setSelectedMetricInfo(buildMetricInfo("totalRevenue", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />
          
        {/* Monthly Profit */}
        <KPICard 
          icon={FiTrendingUp} 
          title="Monthly Profit" 
          value={`$${data.monthlyProfit.toLocaleString()}`}
          subtitle={`Commission: $${data.monthlyCommission.toLocaleString()}`} 
          color={CHART_COLORS.purple} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("monthlyProfit", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />
          
        {/* Timeclock */}
        <KPICard 
          icon={FiClock} 
          title="Timeclock" 
          value={(!timeEntry || timeEntry.manualClockOut) ? "Off Clock" : `${calculateHours(timeEntry)}h`}
          color={(!timeEntry || timeEntry.manualClockOut) ? CHART_COLORS.text : CHART_COLORS.accent}
          onClick={() => setSelectedMetricInfo(buildMetricInfo("timeclock", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
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
          onClick={() => setSelectedMetricInfo(buildMetricInfo("dealsWon", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />

        {/* Deals Lost */}
        <KPICard 
          icon={FiAlertCircle} 
          title="Deals Lost" 
          value={`${data.dealsLost}`}
          subtitle="Total void/lost deals" 
          color={CHART_COLORS.rose} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("dealsLost", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />

        {/* Avg Deal Size */}
        <KPICard 
          icon={FiTrendingUp} 
          title="Avg Deal Size" 
          value={`$${data.avgDealSize.toLocaleString()}`}
          subtitle="Revenue per won deal" 
          color={CHART_COLORS.sky} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("avgDealSize", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />

        {/* Pipeline */}
        <KPICard 
          icon={FiLayers} 
          title="Active Pipeline" 
          value={`$${data.pipelineValue.toLocaleString()}`}
          subtitle={`${data.pipelineCount} open invoices`} 
          color={CHART_COLORS.sky}
          onClick={() => setSelectedMetricInfo(buildMetricInfo("activePipeline", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        >
          {data.overdueCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <FiAlertCircle size={12} />
              <span>{data.overdueCount} overdue (${data.overdueBalance.toLocaleString()})</span>
            </div>
          )}
        </KPICard>
      </div>
      )}

      {/* --- Goal Progress & 1.5x VIG Penalty Tracker --- */}
      {isVisible("GOAL_TRACKERS") && (
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
            onClick={() => setSelectedMetricInfo(buildMetricInfo("vigPenalty", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
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
      )}

      {/* --- Charts Row 1: Revenue & Status --- */}
      {isVisible("CHARTS_REVENUE_RATIO") && (
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
      )}

      {/* --- Charts Row 2: Weekly Trend & Commission --- */}
      {isVisible("CHARTS_TRENDS") && (
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
      )}

      {/* ─── Top Performers (admin only) ─── */}
      {showTopPerformers && isVisible("LEADERBOARD") && data.topReps.length > 0 && (
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

      {/* ─── Company Breakdown (admin only) ─── */}
      {showCompanyBreakdown && isVisible("LEADERBOARD") && data.allRepData.length > 0 && (
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

      {/* --- Rep Dashboard Layout Customizer Modal --- */}
      <RepDashboardCustomizer
        isOpen={isRepCustomizerOpen}
        onClose={() => setIsRepCustomizerOpen(false)}
        widgets={repWidgets}
        onUpdateWidgets={handleUpdateRepWidgets}
      />
    </div>
  )
}

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

interface RepDashboardCustomizerProps {
  isOpen: boolean
  onClose: () => void
  widgets: RepWidgetConfig[]
  onUpdateWidgets: (updated: RepWidgetConfig[]) => void
}

function RepDashboardCustomizer({ isOpen, onClose, widgets, onUpdateWidgets }: RepDashboardCustomizerProps) {
  if (!isOpen) return null

  const toggleVisibility = (id: string) => {
    const updated = widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w)
    onUpdateWidgets(updated)
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-white">Customize Home Dashboard</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <FiX className="text-lg" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-neutral-400 leading-relaxed">
            Select the metrics, goals, and graphs you would like to display on your performance dashboard.
          </p>
          <div className="space-y-2">
            {widgets.map(w => (
              <div 
                key={w.id} 
                className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
              >
                <div>
                  <span className="text-xs font-bold text-white block">{w.title}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Widget ID: {w.id}</span>
                </div>
                <button
                  onClick={() => toggleVisibility(w.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    w.visible 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20" 
                      : "bg-neutral-800 text-neutral-500 border border-neutral-700/50 hover:bg-neutral-700"
                  }`}
                >
                  {w.visible ? <FiEye size={14} /> : <FiEyeOff size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  )
}

function buildMetricInfo(
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

