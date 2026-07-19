"use client"

import { useEffect, useState, useRef } from "react"
import {
  FiTarget, FiDollarSign, FiTrendingUp, FiClock, FiLayers,
  FiArrowUpRight, FiArrowDownRight, FiCheckCircle, FiAlertCircle
} from "react-icons/fi"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"

// ─── Types ───
interface DashboardData {
  weeklyTotal: number
  weeklyTarget: number
  monthlyTotal: number
  monthlyProfit: number
  monthlyCommission: number
  monthlyDeals: number
  pipelineValue: number
  pipelineCount: number
  overdueCount: number
  overdueBalance: number
  revenueByMonth: { month: string; revenue: number; goal: number }[]
  weeklyTrend: { day: string; sales: number; profit: number }[]
  dealsByStatus: { name: string; value: number; color: string }[]
  commissionByMonth: { month: string; commission: number }[]
  topReps: { name: string; sales: number; profit: number; deals: number; quota: number }[]
}

// ─── Chart Colors ───
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

// ─── Custom Tooltip ───
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

// ─── KPI Card ───
function KPICard({
  icon: Icon, title, value, subtitle, trend, trendUp, color, children
}: {
  icon: any; title: string; value: string; subtitle?: string;
  trend?: string; trendUp?: boolean; color: string; children?: React.ReactNode
}) {
  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 group relative overflow-hidden">
      {/* Glow effect */}
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${color}, transparent)` }} />
      
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl border transition-colors"
          style={{ background: `${color}15`, borderColor: `${color}30` }}>
          <Icon size={18} style={{ color }} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
            trendUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          }`}>
            {trendUp ? <FiArrowUpRight size={12} /> : <FiArrowDownRight size={12} />}
            {trend}
          </div>
        )}
      </div>
      <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider mb-1">{title}</p>
      <p className="text-2xl font-black tracking-tight text-white">{value}</p>
      {subtitle && <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>}
      {children}
    </div>
  )
}

// ─── Quota Ring ───
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

// ─── Main Dashboard Component ───
export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [clockedIn, setClockedIn] = useState(false)
  const [clockHours, setClockHours] = useState("0h 0m")

  useEffect(() => {
    fetchDashboardData()
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000) // 5 min refresh
    return () => clearInterval(interval)
  }, [])

  async function fetchDashboardData() {
    try {
      // Fetch invoices from the existing API
      const res = await fetch("/api/zoho-invoices")
      const json = await res.json()
      if (!json.invoices) throw new Error("No invoice data")
      
      const invoices = json.invoices
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
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      for (let i = 5; i >= 0; i--) {
        const m = new Date(currentYear, currentMonth - i, 1)
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
        monthlyRevData[key] = 0
      }

      // Commission by month (trailing 6)
      const commData: Record<string, number> = {}
      for (let i = 5; i >= 0; i--) {
        const m = new Date(currentYear, currentMonth - i, 1)
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`
        commData[key] = 0
      }

      // Rep aggregation
      const repData: Record<string, { sales: number; profit: number; deals: number }> = {}

      for (const inv of invoices) {
        const amount = parseFloat(inv.sub_total || inv.total || "0")
        const profit = parseFloat(inv.cf_profit_unformatted || inv.cf_estimated_profit_unformatted || "0")
        const commission = parseFloat(inv.cf_commision_amount_unformatted || "0")
        const dateStr = inv.salesorder_date || inv.date || ""
        const invDate = new Date(dateStr)
        const status = (inv.status || "").toLowerCase()
        const rep = inv.salesorder_salesperson_name || inv.salesperson_name || "Unknown"

        // Skip Paul Gencuski
        const repUpper = rep.toUpperCase()
        if (repUpper.includes("PAUL") && (repUpper.includes("GENCUSKI") || repUpper.includes("GENKUSKI"))) continue

        // Rep aggregation
        if (!repData[rep]) repData[rep] = { sales: 0, profit: 0, deals: 0 }

        // Status counts
        const statusKey = status === "paid" ? "Paid" :
          status === "overdue" ? "Overdue" :
          status === "draft" ? "Draft" :
          status === "sent" ? "Sent" :
          status === "partially_paid" ? "Partial" : "Other"
        statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1

        // Monthly revenue
        const invMonth = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`
        if (monthlyRevData[invMonth] !== undefined) monthlyRevData[invMonth] += amount
        if (commData[invMonth] !== undefined) commData[invMonth] += commission

        // Weekly totals
        if (invDate >= monday && invDate <= friday) {
          weeklyTotal += amount
          const dayKey = invDate.toISOString().slice(0, 10)
          if (dailySales[dayKey] !== undefined) {
            dailySales[dayKey] += amount
            dailyProfit[dayKey] += profit
          }
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

      setData({
        weeklyTotal: Math.round(weeklyTotal),
        weeklyTarget: 64000,
        monthlyTotal: Math.round(monthlyTotal),
        monthlyProfit: Math.round(monthlyProfit),
        monthlyCommission: Math.round(monthlyCommission),
        monthlyDeals,
        pipelineValue: Math.round(pipelineValue),
        pipelineCount,
        overdueCount,
        overdueBalance: Math.round(overdueBalance),
        revenueByMonth,
        weeklyTrend,
        dealsByStatus,
        commissionByMonth,
        topReps
      })
    } catch (err) {
      console.error("Dashboard fetch error:", err)
      // Set fallback empty data
      setData({
        weeklyTotal: 0, weeklyTarget: 64000, monthlyTotal: 0, monthlyProfit: 0,
        monthlyCommission: 0, monthlyDeals: 0, pipelineValue: 0, pipelineCount: 0,
        overdueCount: 0, overdueBalance: 0, revenueByMonth: [], weeklyTrend: [],
        dealsByStatus: [], commissionByMonth: [], topReps: []
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass-panel rounded-2xl h-36 skeleton" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-panel rounded-2xl h-64 skeleton" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const goalPct = data.weeklyTarget > 0 ? Math.round((data.weeklyTotal / data.weeklyTarget) * 100) : 0

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Goal Progress */}
        <KPICard icon={FiTarget} title="Weekly Goal" value={`$${data.weeklyTotal.toLocaleString()}`}
          subtitle={`of $${data.weeklyTarget.toLocaleString()} target`} color={CHART_COLORS.primary}
          trend={`${goalPct}%`} trendUp={goalPct >= 50}>
          <QuotaRing current={data.weeklyTotal} target={data.weeklyTarget} color={CHART_COLORS.primary} />
        </KPICard>

        {/* Monthly Sales */}
        <KPICard icon={FiDollarSign} title="Monthly Sales" value={`$${data.monthlyTotal.toLocaleString()}`}
          subtitle={`${data.monthlyDeals} deals closed`} color={CHART_COLORS.accent}
          trend={`${data.monthlyDeals} deals`} trendUp={true} />

        {/* Monthly Profit */}
        <KPICard icon={FiTrendingUp} title="Monthly Profit" value={`$${data.monthlyProfit.toLocaleString()}`}
          subtitle={`Commission: $${data.monthlyCommission.toLocaleString()}`} color={CHART_COLORS.purple} />

        {/* Timeclock */}
        <KPICard icon={FiClock} title="Timeclock" value={clockedIn ? clockHours : "Off Clock"}
          color={clockedIn ? CHART_COLORS.accent : CHART_COLORS.text}>
          <button
            onClick={() => setClockedIn(!clockedIn)}
            className={`mt-3 w-full text-xs font-bold py-2 rounded-xl border transition-all duration-300 ${
              clockedIn
                ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
            }`}
          >
            {clockedIn ? "Clock Out" : "Clock In"}
          </button>
        </KPICard>

        {/* Pipeline */}
        <KPICard icon={FiLayers} title="Active Pipeline" value={`$${data.pipelineValue.toLocaleString()}`}
          subtitle={`${data.pipelineCount} open invoices`} color={CHART_COLORS.sky}>
          {data.overdueCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <FiAlertCircle size={12} />
              <span>{data.overdueCount} overdue (${data.overdueBalance.toLocaleString()})</span>
            </div>
          )}
        </KPICard>
      </div>

      {/* ─── Charts Row 1: Revenue & Status ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Revenue vs Goal — spans 2 cols */}
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

      {/* ─── Charts Row 2: Weekly Trend & Commission ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      {/* ─── Top Performers ─── */}
      {data.topReps.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-4">Top Performers — This Month</h3>
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
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i + 1}
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
    </div>
  )
}
