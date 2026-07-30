"use client"

import React, { useEffect, useState, useMemo, useRef } from "react"
import { FiTrendingUp, FiDollarSign, FiTarget, FiActivity, FiAward, FiClock, FiStar, FiMaximize, FiMinimize, FiPlay, FiPause, FiChevronLeft, FiChevronRight, FiAlertCircle, FiSliders } from "react-icons/fi"

import { KpiBreakdownModal } from "./KpiBreakdownModal"
import SalesBoardCustomizer, { WidgetConfig, DEFAULT_WIDGET_LAYOUT } from "./SalesBoardCustomizer"
import { RevenueVsGoalWidget, VigCostAllocationWidget, PipelineFunnelWidget, ZDialerActivityWidget, TimeclockStatusWidget } from "./DashboardWidgetCatalog"

const REP_GRADIENTS = [
  "from-purple-500 to-indigo-500",
  "from-pink-500 to-rose-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-red-500 to-rose-700",
  "from-fuchsia-500 to-pink-600",
  "from-sky-500 to-blue-700",
  "from-lime-500 to-emerald-700",
  "from-violet-500 to-purple-700",
]

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(val)
}

const formatPercent = (val: number) => {
  return `${val.toFixed(1)}%`
}

const SCREENS = ["WEEKLY_GRID", "REPS_KPI", "MTD_STATS", "YTD_STATS", "OVERDUE_INVOICES"] as const
type ScreenType = typeof SCREENS[number]

export function SalesBoard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("WEEKLY_GRID")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Layout Customizer state
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false)
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGET_LAYOUT)

  useEffect(() => {
    try {
      const saved = localStorage.getItem("salesboard_widget_layout")
      if (saved) {
        setWidgets(JSON.parse(saved))
      }
    } catch (e) {
      console.error("Failed to load saved layout", e)
    }
  }, [])

  const handleUpdateWidgets = (updated: WidgetConfig[]) => {
    setWidgets(updated)
    try {
      localStorage.setItem("salesboard_widget_layout", JSON.stringify(updated))
    } catch (e) {
      console.error("Failed to save layout", e)
    }
  }

  const handleResetLayout = () => {
    setWidgets(DEFAULT_WIDGET_LAYOUT)
    try {
      localStorage.removeItem("salesboard_widget_layout")
    } catch (e) {
      console.error("Failed to reset layout", e)
    }
  }

  // KPI Breakdown Modal state
  const [kpiModalOpen, setKpiModalOpen] = useState(false)
  const [kpiModalTitle, setKpiModalTitle] = useState("")
  const [kpiModalFormula, setKpiModalFormula] = useState("")
  const [kpiModalDocs, setKpiModalDocs] = useState<any[]>([])

  useEffect(() => {
    const handleMetricEvent = (e: any) => {
      const key = e.detail?.key
      if (!data || !data.rawInvoices) return

      let title = "KPI Calculation Breakdown"
      let formula = "Sum of matching documents"
      let docs: any[] = []

      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()

      if (key === "weeklyGoal") {
        title = "Weekly Sales Revenue Derivation"
        formula = "Sum of invoice subtotals issued between Monday and Friday of current week"
        docs = data.rawInvoices.filter((inv: any) => {
          const d = new Date(inv.date || inv.issueDate)
          return !isNaN(d.getTime()) && (now.getTime() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000
        })
      } else if (key === "totalRevenue") {
        title = "MTD Total Revenue Derivation"
        formula = "Sum of all active invoice subtotals created in current month"
        docs = data.rawInvoices.filter((inv: any) => {
          const d = new Date(inv.date || inv.issueDate)
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear
        })
      } else if (key === "monthlyProfit") {
        title = "Monthly Net Profit & Commission Derivation"
        formula = "Sum of (Subtotal - DeadCostPlusVIG - CCFees - AdditionalCosts) for current month invoices"
        docs = data.rawInvoices.filter((inv: any) => {
          const d = new Date(inv.date || inv.issueDate)
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear
        })
      } else if (key === "activePipeline") {
        title = "Active Pipeline & Overdue Derivation"
        formula = "Sum of unpaid balances on non-draft, non-void invoices"
        docs = data.rawInvoices.filter((inv: any) => {
          const status = (inv.status || "").toLowerCase()
          return status !== "paid" && status !== "void" && status !== "draft" && parseFloat(inv.balance || 0) > 0
        })
      } else {
        title = "Sales Performance Document Derivation"
        formula = "All matching period invoices"
        docs = data.rawInvoices || []
      }

      setKpiModalTitle(title)
      setKpiModalFormula(formula)
      setKpiModalDocs(docs)
      setKpiModalOpen(true)
    }

    window.addEventListener("open-metric-derivation", handleMetricEvent)
    return () => window.removeEventListener("open-metric-derivation", handleMetricEvent)
  }, [data])

  // Collapse all rows when screen changes
  useEffect(() => {
    setExpandedRows(new Set())
  }, [currentScreen])

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const boardRef = useRef<HTMLDivElement>(null)
  const ROTATION_TIME = 15000
  const TICK_INTERVAL = 100

  // Fullscreen listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      if (boardRef.current) await boardRef.current.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }

  // Data fetching and processing
  useEffect(() => {
    const fetchData = async () => {
      try {
        const startOfYearStr = `${new Date().getFullYear()}-01-01`
        const threeDaysAgoStr = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        // Fetch users, invoices, sales orders, and quotes in parallel
        const [usersRes, invoicesRes, salesOrdersRes, quotesRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch(`/api/get-documents?pageSize=8000&type=Invoice&loadAll=true&startDate=${startOfYearStr}`),
          fetch(`/api/get-documents?pageSize=8000&type=SalesOrder&loadAll=true&startDate=${startOfYearStr}`),
          fetch(`/api/get-documents?pageSize=1000&type=Quote&loadAll=true&startDate=${threeDaysAgoStr}`)
        ])
        const usersPayload = usersRes.ok && (usersRes.headers.get("content-type") || "").includes("application/json") 
          ? await usersRes.json() 
          : { users: [] }
        const invoicesPayload = invoicesRes.ok && (invoicesRes.headers.get("content-type") || "").includes("application/json")
          ? await invoicesRes.json()
          : { documents: [] }
        const salesOrdersPayload = salesOrdersRes.ok && (salesOrdersRes.headers.get("content-type") || "").includes("application/json")
          ? await salesOrdersRes.json()
          : { documents: [] }
        const quotesPayload = quotesRes.ok && (quotesRes.headers.get("content-type") || "").includes("application/json")
          ? await quotesRes.json()
          : { documents: [] }
        const combinedDocuments = [
          ...(invoicesPayload.documents || []),
          ...(salesOrdersPayload.documents || []),
          ...(quotesPayload.documents || [])
        ]
        
        // Build reps from users with showOnSalesBoard
        const boardUsers = (usersPayload.users || []).filter((u: any) => u.showOnSalesBoard)
        const today = new Date()
        const currentYear = today.getFullYear()
        const currentMonth = today.getMonth()
        
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

        const dynamicReps = boardUsers.map((u: any, i: number) => {
          const currentGoal = u.monthlyVigGoals?.find((g: any) => g.monthKey === monthKey)
          const monthlyTarget = currentGoal?.profitGoal || 0
          
          return {
            id: u.id,
            name: u.name || u.email,
            role: u.role || "Sales Representative",
            expectedVig: 1.5,
            weeklyTarget: monthlyTarget / 4,
            monthlyTarget: monthlyTarget,
            gradient: REP_GRADIENTS[i % REP_GRADIENTS.length],
            payoutStructure: u.payoutStructure || "two_payment"
          }
        })

        const day = today.getDay()
        const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(today.getFullYear(), today.getMonth(), diffToMonday)
        
        const weekDays: string[] = []
        for (let i = 0; i < 5; i++) {
          const nextDay = new Date(monday)
          nextDay.setDate(monday.getDate() + i)
          const yyyy = nextDay.getFullYear()
          const mm = String(nextDay.getMonth() + 1).padStart(2, '0')
          const dd = String(nextDay.getDate()).padStart(2, '0')
          weekDays.push(`${yyyy}-${mm}-${dd}`)
        }

        const repsMap: Record<string, any> = {}
        dynamicReps.forEach((r: any) => {
          repsMap[r.id] = { 
            ...r, 
            weekly: { sales: [0,0,0,0,0], profit: [0,0,0,0,0], deadCostNoVig: 0, deadCostSubjectToVig: 0, totalSales: 0, totalProfit: 0, dealsClosed: 0, commission: 0, invoices: [] },
            mtd: { sales: 0, profit: 0, deadCostNoVig: 0, deadCostSubjectToVig: 0, commission: 0, dealsClosed: 0, invoices: [] },
            ytd: { sales: 0, profit: 0, deadCostNoVig: 0, deadCostSubjectToVig: 0, commission: 0, dealsClosed: 0, invoices: [] },
            activePipeline: { estimateCount: 0, estimateAmount: 0, salesOrderCount: 0, salesOrderAmount: 0 }
          }
        })

        let teamWeekly = { 
          sales: 0, 
          profit: 0, 
          deadCostNoVig: 0,
          deadCostSubjectToVig: 0,
          commission: 0, 
          target: dynamicReps.reduce((sum: number, r: any) => sum + r.weeklyTarget, 0) 
        }
        const overdueInvoices: any[] = []
        let totalOverdueBalance = 0
        const rawDocs = combinedDocuments

        const normalizeRepName = (n: string) => {
          const val = (n || '').toLowerCase().replace(/\s+/g, ' ').trim()
          if (val === 'ben bequette') return 'benjamin bequette'
          if (val === 'monty morgan') return 'montgomery morgan'
          if (val === 'ricky griffin') return 'richard griffin'
          return val
        }

        const getMatchedRep = (nameStr: string) => {
          const spNameNormalized = normalizeRepName(nameStr)
          if (!spNameNormalized) return null
          return Object.values(repsMap).find(r => {
            const repNameNormalized = normalizeRepName(r.name)
            return repNameNormalized.includes(spNameNormalized) || spNameNormalized.includes(repNameNormalized)
          })
        }

        rawDocs.forEach((doc: any) => {
          const raw = doc.raw || {}
          const items = raw.items || {}
          const spName = (doc.salesperson || "").toUpperCase()
          if (!spName) return
          if (spName.includes("PAUL") && (spName.includes("GENCUSKI") || spName.includes("GENKUSKI"))) return

          const docType = doc.type || 'Invoice'
          const matchedRep = getMatchedRep(spName)

          // --- 1. ESTIMATES / QUOTES (48 Hours active on board or until SO) ---
          if (docType === 'Quote') {
            const quoteDate = doc.date ? new Date(doc.date) : new Date(raw.createdAt || Date.now())
            const ageHours = (today.getTime() - quoteDate.getTime()) / (1000 * 3600)
            const isConvertedToSO = raw.status === 'Converted' || raw.salesorder_id || raw.salesorder_number
            if (ageHours <= 48 && !isConvertedToSO && matchedRep) {
              matchedRep.activePipeline.estimateCount += 1
              matchedRep.activePipeline.estimateAmount += parseFloat(doc.amount || raw.total || raw.amount || 0)
            }
            return
          }

          // --- 2. SALES ORDERS (Active on board until Invoiced) ---
          if (docType === 'SalesOrder') {
            const isInvoiced = raw.status === 'Invoiced' || raw.invoice_id || raw.invoice_number
            if (isInvoiced) return // Skip converted Sales Orders to avoid double-counting
            if (matchedRep) {
              matchedRep.activePipeline.salesOrderCount += 1
              matchedRep.activePipeline.salesOrderAmount += parseFloat(doc.amount || raw.total || raw.amount || 0)
            }
          }

          // --- 3. INVOICES & SALES ORDERS (Weekly/MTD/YTD totals) ---
          if (docType === 'Invoice' || docType === 'SalesOrder') {
            const saleDate = doc.date ? doc.date.split('T')[0] : ''
            if (!saleDate) return

            const invDateObj = new Date(saleDate)
            const amount = Number(doc.amount || 0)
            const profit = Number(doc.profit || 0)
            const deadCostNoVig = Number(doc.deadCostNoVig || 0)
            const deadCostSubjectToVig = Number(doc.deadCostSubjectToVig || 0)

            // Commission 50/50 split calculation
            const fullComm = Number(doc.commission || 0)
            const isPaid = (raw.status || "").toLowerCase() === "paid" || items.paymentDate != null
            const isSameDayPaid = items.isSameDayPaid || false

            const isSinglePayment = matchedRep?.payoutStructure === 'single_payment'
            let commissionEarned = 0
            if (isSinglePayment) {
              commissionEarned = (isPaid || isSameDayPaid) ? fullComm : 0
            } else {
              commissionEarned = fullComm * 0.5
              if (isPaid || isSameDayPaid) {
                commissionEarned = fullComm
              }
            }

            const balance = Number(doc.balance !== undefined ? doc.balance : 0)

            // Check overdue
            const dueDate = doc.dueDate ? new Date(doc.dueDate) : null
            if (dueDate && (doc.status === 'overdue' || raw.status === 'overdue') && balance > 0) {
              const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24))
              if (daysOverdue > 0) {
                totalOverdueBalance += balance
                overdueInvoices.push({
                  customer: raw.customer_name || doc.accountName,
                  invoiceNumber: raw.invoice_number || doc.invoiceNumber,
                  balance: balance,
                  saleDate: saleDate,
                  daysOverdue: daysOverdue,
                  repName: spName
                })
              }
            }

            const inCurrentWeek = weekDays.includes(saleDate)
            const isMTD = invDateObj.getFullYear() === currentYear && invDateObj.getMonth() === currentMonth
            const isYTD = invDateObj.getFullYear() === currentYear

            if (inCurrentWeek) {
              teamWeekly.sales += amount
              teamWeekly.profit += profit
              teamWeekly.deadCostNoVig += deadCostNoVig
              teamWeekly.deadCostSubjectToVig += deadCostSubjectToVig
              teamWeekly.commission += commissionEarned

              if (matchedRep) {
                const dayIdx = weekDays.indexOf(saleDate)
                if (dayIdx >= 0) {
                  matchedRep.weekly.sales[dayIdx] += amount
                  matchedRep.weekly.profit[dayIdx] += profit
                }
                matchedRep.weekly.totalSales += amount
                matchedRep.weekly.totalProfit += profit
                matchedRep.weekly.deadCostNoVig += deadCostNoVig
                matchedRep.weekly.deadCostSubjectToVig += deadCostSubjectToVig
                matchedRep.weekly.commission += commissionEarned
                matchedRep.weekly.dealsClosed += 1
                matchedRep.weekly.invoices.push({ 
                  id: raw.invoice_id || raw.id || doc.id, 
                  date: saleDate, 
                  customer: raw.customer_name || doc.accountName, 
                  amount, 
                  profit, 
                  deadCostNoVig,
                  deadCostSubjectToVig,
                  commission: commissionEarned, 
                  invoiceNumber: raw.invoice_number || doc.invoiceNumber 
                })
              }
            }

            if (matchedRep) {
              if (isMTD) {
                matchedRep.mtd.sales += amount
                matchedRep.mtd.profit += profit
                matchedRep.mtd.deadCostNoVig += deadCostNoVig
                matchedRep.mtd.deadCostSubjectToVig += deadCostSubjectToVig
                matchedRep.mtd.commission += commissionEarned
                matchedRep.mtd.dealsClosed += 1
                matchedRep.mtd.invoices.push({ 
                  id: raw.invoice_id || raw.id || doc.id, 
                  date: saleDate, 
                  customer: raw.customer_name || doc.accountName, 
                  amount, 
                  profit, 
                  deadCostNoVig,
                  deadCostSubjectToVig,
                  commission: commissionEarned, 
                  invoiceNumber: raw.invoice_number || doc.invoiceNumber 
                })
              }
              if (isYTD) {
                matchedRep.ytd.sales += amount
                matchedRep.ytd.profit += profit
                matchedRep.ytd.deadCostNoVig += deadCostNoVig
                matchedRep.ytd.deadCostSubjectToVig += deadCostSubjectToVig
                matchedRep.ytd.commission += commissionEarned
                matchedRep.ytd.dealsClosed += 1
                matchedRep.ytd.invoices.push({ 
                  id: raw.invoice_id || raw.id || doc.id, 
                  date: saleDate, 
                  customer: raw.customer_name || doc.accountName, 
                  amount, 
                  profit, 
                  deadCostNoVig,
                  deadCostSubjectToVig,
                  commission: commissionEarned, 
                  invoiceNumber: raw.invoice_number || doc.invoiceNumber 
                })
              }
            }
          }
        })

        setData({
          teamWeekly,
          reps: Object.values(repsMap),
          overdueInvoices: overdueInvoices.sort((a,b) => b.daysOverdue - a.daysOverdue),
          totalOverdueBalance,
          weekDays
        })

      } catch (err) {
        console.error("Sales Board Error:", err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
    // Refresh when tab becomes visible (instead of polling every 5 min)
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Auto-rotate screens
  useEffect(() => {
    if (isPaused) return
    let tickCount = progress
    const interval = setInterval(() => {
      tickCount += (TICK_INTERVAL / ROTATION_TIME) * 100
      if (tickCount >= 100) {
         tickCount = 0
         setCurrentScreen(prev => {
            const idx = SCREENS.indexOf(prev)
            return SCREENS[(idx + 1) % SCREENS.length]
         })
      }
      setProgress(tickCount)
    }, TICK_INTERVAL)
    return () => clearInterval(interval)
  }, [isPaused, progress])

  const nextScreen = () => {
     const idx = SCREENS.indexOf(currentScreen)
     setCurrentScreen(SCREENS[(idx + 1) % SCREENS.length])
     setProgress(0)
  }
  const prevScreen = () => {
     const idx = SCREENS.indexOf(currentScreen)
     setCurrentScreen(SCREENS[(idx - 1 + SCREENS.length) % SCREENS.length])
     setProgress(0)
  }
  const goToScreen = (screen: ScreenType) => {
     setCurrentScreen(screen)
     setProgress(0)
  }

  if (loading || !data) {
    return (
      <div className="w-full h-full min-h-[600px] flex flex-col items-center justify-center glass-panel-strong rounded-2xl border border-white/10 text-white shadow-2xl relative overflow-hidden">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-neutral-400 font-medium tracking-widest uppercase text-sm animate-pulse">Loading Live Metrics</p>
      </div>
    )
  }

  const teamQuotaPct = data.teamWeekly.target > 0 ? Math.min(100, Math.round((data.teamWeekly.profit / data.teamWeekly.target) * 100)) : 0

  return (
    <div ref={boardRef} className="w-full h-full bg-black/20 rounded-2xl border border-white/10 text-white shadow-2xl relative flex flex-col font-sans overflow-hidden flex-1 min-h-0">
      
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <FiActivity size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-white uppercase">Titan Sales Monitor</h2>
            <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync
            </p>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-4 bg-white/5 p-1.5 rounded-xl border border-white/10">
          <div className="flex items-center gap-1.5 px-2">
            {SCREENS.map(screen => (
              <button 
                key={screen} 
                onClick={() => goToScreen(screen)}
                title={screen}
                className={`h-2 rounded-full transition-all duration-500 ${currentScreen === screen ? "bg-emerald-400 w-6 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-white/20 hover:bg-white/40 w-2"}`}
              />
            ))}
          </div>
          <div className="w-[1px] h-4 bg-white/10"></div>
          <button onClick={prevScreen} className="text-neutral-400 hover:text-white transition-colors"><FiChevronLeft size={18} /></button>
          <button onClick={() => setIsPaused(!isPaused)} className="text-neutral-400 hover:text-white transition-colors">
            {isPaused ? <FiPlay size={16} /> : <FiPause size={16} />}
          </button>
          <button onClick={nextScreen} className="text-neutral-400 hover:text-white transition-colors"><FiChevronRight size={18} /></button>
          <button 
            onClick={() => setIsCustomizerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/30 transition-all shadow-[0_0_10px_rgba(52,211,153,0.15)]"
            title="Customize Dashboard Layout"
          >
            <FiSliders size={14} /> Customize Layout
          </button>
          <div className="w-[1px] h-4 bg-white/10"></div>
          <button onClick={toggleFullscreen} className="text-neutral-400 hover:text-white transition-colors pr-2">
            {isFullscreen ? <FiMinimize size={16} /> : <FiMaximize size={16} />}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-white/5 relative z-20">
         <div className="h-full bg-emerald-500 transition-all duration-100 ease-linear" style={{ width: `${progress}%` }}></div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-b from-black/20 to-transparent">
        
        {/* SCREEN 1: WEEKLY GRID */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "WEEKLY_GRID" ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0 pointer-events-none"}`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
             <div>
                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase flex items-center gap-2">
                   <FiActivity className="text-emerald-400 animate-pulse" /> Live Weekly Sales & Financial Performance
                </h3>
                <p className="text-[11px] text-neutral-500 font-semibold mt-0.5">
                  Pipeline: <span className="text-cyan-400 font-bold">48h Estimates</span> &amp; <span className="text-amber-400 font-bold">Uninvoiced Sales Orders</span>
                </p>
             </div>
             
             {/* --- 5-Badge Financial Metric Strip --- */}
             <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full md:w-auto">
                <div className="bg-gradient-to-br from-sky-950/60 to-blue-950/60 p-3 rounded-xl border border-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-sky-400 tracking-wider block">Gross Sales</span>
                   <span className="text-base font-black text-white block mt-0.5">{formatCurrency(data.teamWeekly.sales)}</span>
                </div>
                <div className="bg-gradient-to-br from-amber-950/60 to-orange-950/60 p-3 rounded-xl border border-amber-500/20 shadow-[0_0_15px_rgba(251,191,36,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-amber-400 tracking-wider block">DC (Subject VIG)</span>
                   <span className="text-base font-black text-amber-200 block mt-0.5">{formatCurrency(data.teamWeekly.deadCostSubjectToVig)}</span>
                </div>
                <div className="bg-gradient-to-br from-purple-950/60 to-fuchsia-950/60 p-3 rounded-xl border border-purple-500/20 shadow-[0_0_15px_rgba(232,121,249,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-purple-300 tracking-wider block">🎁 DC (No VIG)</span>
                   <span className="text-base font-black text-purple-200 block mt-0.5">{formatCurrency(data.teamWeekly.deadCostNoVig)}</span>
                </div>
                <div className="bg-gradient-to-br from-emerald-950/60 to-teal-950/60 p-3 rounded-xl border border-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-wider block">Net Profit</span>
                   <span className="text-base font-black text-emerald-300 block mt-0.5">{formatCurrency(data.teamWeekly.profit)}</span>
                </div>
                <div className="bg-gradient-to-br from-rose-950/60 to-pink-950/60 p-3 rounded-xl border border-rose-500/20 shadow-[0_0_15px_rgba(251,113,133,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-rose-300 tracking-wider block">Commission (50/50)</span>
                   <span className="text-base font-black text-rose-200 block mt-0.5">{formatCurrency(data.teamWeekly.commission)}</span>
                </div>
             </div>
          </div>

          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/10 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Metric</th>
                     {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, idx) => {
                        const dateParts = data.weekDays[idx].split('-')
                        return (
                           <th key={idx} className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">
                              {day} {dateParts[1]}/{dateParts[2]}
                           </th>
                        )
                     })}
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-emerald-400 border-b border-white/10 text-right bg-emerald-500/5 rounded-tr-xl">Week Total</th>
                  </tr>
               </thead>
               <tbody>
                  {data.reps.sort((a:any, b:any) => b.weekly.totalSales - a.weekly.totalSales).map((rep: any, idx: number) => {
                     const isExpanded = expandedRows.has(`weekly-${rep.id}`)
                     return (
                     <React.Fragment key={rep.id}>
                        {/* Sales Row */}
                        <tr className="group hover:bg-white/10 hover:shadow-lg transition-all duration-300 cursor-pointer transition-colors" onClick={() => toggleRow(`weekly-${rep.id}`)}>
                           <td className="p-4 text-sm font-bold border-b border-white/10 text-white align-middle" rowSpan={2}>
                              <div className="flex items-center gap-3">
                                 <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-xs shadow-lg`}>{rep.name.charAt(0)}</div>
                                 {rep.name}
                              </div>
                           </td>
                           <td className="p-4 text-xs font-medium text-neutral-400 border-b border-white/10">Gross Sales</td>
                           {rep.weekly.sales.map((val: number, i: number) => (
                              <td key={i} className="p-4 text-sm font-medium text-white text-right border-b border-white/10">{val > 0 ? formatCurrency(val) : '-'}</td>
                           ))}
                           <td className="p-4 text-sm font-black text-emerald-400 text-right border-b border-white/10 bg-emerald-500/5">{formatCurrency(rep.weekly.totalSales)}</td>
                        </tr>
                        {/* Profit Row */}
                        <tr className="group hover:bg-white/10 hover:shadow-lg transition-all duration-300 cursor-pointer transition-colors" onClick={() => toggleRow(`weekly-${rep.id}`)}>
                           <td className="p-4 text-xs font-medium text-neutral-500 border-b border-white/10">Dead Profit</td>
                           {rep.weekly.profit.map((val: number, i: number) => (
                              <td key={i} className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{val > 0 ? formatCurrency(val) : '-'}</td>
                           ))}
                           <td className="p-4 text-sm font-bold text-emerald-400/70 text-right border-b border-white/10 bg-emerald-500/5">{formatCurrency(rep.weekly.totalProfit)}</td>
                        </tr>

                        {isExpanded && rep.weekly.invoices?.length > 0 && (
                           <tr className="bg-black/40">
                              <td colSpan={8} className="p-4 border-b border-white/10">
                                 <div className="pl-12">
                                   <table className="w-full text-left border-collapse glass-panel-strong rounded-lg overflow-hidden border border-white/10">
                                     <thead>
                                       <tr className="bg-white/[0.02]">
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Gross Sales</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Commission</th>
                                       </tr>
                                     </thead>
                                     <tbody>
                                       {rep.weekly.invoices.map((inv:any) => (
                                         <tr key={inv.id} className="border-t border-white/10 hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                                           <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                           <td className="p-2">
                                              <div className="text-xs font-bold text-white">{inv.customer}</div>
                                              <div className="text-[10px] text-neutral-500 font-medium">{inv.invoiceNumber}</div>
                                           </td>
                                           <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                           <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                           <td className="p-2 text-xs font-bold text-emerald-400 text-right">{formatCurrency(inv.commission)}</td>
                                         </tr>
                                       ))}
                                     </tbody>
                                   </table>
                                 </div>
                              </td>
                           </tr>
                        )}
                     </React.Fragment>
                  )})}
               </tbody>
            </table>
          </div>
        </div>

        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "REPS_KPI" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 1 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
          <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-4 flex items-center gap-3">
            <FiStar className="text-amber-400" /> Weekly Top Performers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-max">
            {data.reps.sort((a:any, b:any) => b.weekly.totalProfit - a.weekly.totalProfit).map((rep: any, idx: number) => {
              const quota = rep.weeklyTarget > 0 ? Math.min(100, Math.round((rep.weekly.totalProfit / rep.weeklyTarget) * 100)) : 0
              const profitMargin = rep.weekly.totalSales > 0 ? (rep.weekly.totalProfit / rep.weekly.totalSales) * 100 : 0
              return (
                <div key={rep.id} className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 relative overflow-hidden group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${rep.gradient} flex items-center justify-center text-white font-black text-lg shadow-lg`}>
                        {rep.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-white">{rep.name}</h4>
                        <p className="text-[9px] text-neutral-500 uppercase tracking-wider">{rep.role}</p>
                      </div>
                    </div>
                    {idx === 0 && <FiAward size={24} className="text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />}
                  </div>
                  
                  <div className="space-y-3.5">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-black tracking-tight text-white">{formatCurrency(rep.weekly.totalProfit)}</div>
                        <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mt-0.5">Weekly Dead Profit</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold tracking-tight text-neutral-400">{formatCurrency(rep.weekly.totalSales)}</div>
                        <div className="text-[9px] text-neutral-600 font-bold uppercase tracking-widest mt-0.5">Gross Sales</div>
                      </div>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/10 relative">
                      <div className="absolute inset-y-0 bg-white/10" style={{ left: '0', width: '100%' }}></div>
                      <div className={`absolute inset-y-0 bg-gradient-to-r ${rep.gradient} transition-all duration-1000`} style={{ left: '0', width: `${quota}%` }}></div>
                      {/* Target Indicator */}
                      <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10" style={{ left: '100%' }}></div>
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-neutral-500 uppercase tracking-widest font-bold">
                       <span>{quota}% of Goal</span>
                       <span>Target: {formatCurrency(rep.weeklyTarget)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1.5 border-t border-white/10 text-xs">
                      <div>
                        <span className="text-[8px] uppercase font-bold text-neutral-500 block">DC Subject to VIG</span>
                        <span className="text-amber-300 font-bold">{formatCurrency(rep.weekly.deadCostSubjectToVig)}</span>
                      </div>
                      <div>
                        <span className="text-[8px] uppercase font-bold text-purple-400 block">🎁 DC (No VIG)</span>
                        <span className="text-purple-300 font-bold">{formatCurrency(rep.weekly.deadCostNoVig)}</span>
                      </div>
                    </div>

                    {/* Active Pipeline Badges (48h Estimates & Uninvoiced SOs) */}
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/10">
                      <div className="flex-1 bg-cyan-950/40 p-1.5 rounded-lg border border-cyan-500/20 text-[9px]">
                        <span className="text-cyan-400 font-bold block uppercase">48h Estimates</span>
                        <span className="text-white font-bold">{rep.activePipeline.estimateCount} ({formatCurrency(rep.activePipeline.estimateAmount)})</span>
                      </div>
                      <div className="flex-1 bg-amber-950/40 p-1.5 rounded-lg border border-amber-500/20 text-[9px]">
                        <span className="text-amber-400 font-bold block uppercase">Uninvoiced SOs</span>
                        <span className="text-white font-bold">{rep.activePipeline.salesOrderCount} ({formatCurrency(rep.activePipeline.salesOrderAmount)})</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-1.5 border-t border-white/10">
                      <div>
                         <div className="text-base font-bold text-white">{rep.weekly.dealsClosed}</div>
                         <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Deals</div>
                      </div>
                      <div>
                         <div className="text-base font-bold text-rose-400">{formatCurrency(rep.weekly.commission)}</div>
                         <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">50/50 Comm</div>
                      </div>
                      <div>
                         <div className="text-base font-bold text-emerald-400">{formatPercent(profitMargin)}</div>
                         <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Margin</div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Dynamic Grid Layout for Custom Catalog Widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            {widgets.filter(w => w.visible).map(w => {
              const colClass = w.size === "3" ? "md:col-span-3" : w.size === "2" ? "md:col-span-2" : "md:col-span-1"
              if (w.id === "REVENUE_VS_GOAL") return <div key={w.id} className={colClass}><RevenueVsGoalWidget data={data} /></div>
              if (w.id === "VIG_COST_DONUT") return <div key={w.id} className={colClass}><VigCostAllocationWidget data={data} /></div>
              if (w.id === "PIPELINE_FUNNEL") return <div key={w.id} className={colClass}><PipelineFunnelWidget data={data} /></div>
              if (w.id === "ZDIALER_FEED") return <div key={w.id} className={colClass}><ZDialerActivityWidget data={data} /></div>
              if (w.id === "TIMECLOCK_STATUS") return <div key={w.id} className={colClass}><TimeclockStatusWidget data={data} /></div>
              return null
            })}
          </div>
        </div>

        {/* SCREEN 3: MTD */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "MTD_STATS" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 2 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
           <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-8 flex items-center gap-3">
            <FiTarget className="text-blue-400" /> Month-To-Date Performance
          </h3>
          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/10 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Gross Sales</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Dead Profit</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Commission</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Deals</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Avg Deal</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Dead Profit %</th>
                  </tr>
               </thead>
               <tbody>
                  {data.reps.sort((a:any, b:any) => b.mtd.profit - a.mtd.profit).map((rep: any) => {
                     const avgDeal = rep.mtd.dealsClosed > 0 ? rep.mtd.sales / rep.mtd.dealsClosed : 0
                     const profitMargin = rep.mtd.sales > 0 ? (rep.mtd.profit / rep.mtd.sales) * 100 : 0
                     const isExpanded = expandedRows.has(`mtd-${rep.id}`)
                     return (
                     <React.Fragment key={rep.id}>
                     <tr onClick={() => toggleRow(`mtd-${rep.id}`)} className="hover:bg-white/15 hover:shadow-lg transition-all duration-300 transition-colors cursor-pointer group">
                        <td className="p-4 text-sm font-bold border-b border-white/10 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.name.charAt(0)}</div>
                              {rep.name}
                           </div>
                        </td>
                        <td className="p-4 text-sm font-black text-white text-right border-b border-white/10">{formatCurrency(rep.mtd.sales)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-300 text-right border-b border-white/10">{formatCurrency(rep.mtd.profit)}</td>
                        <td className="p-4 text-sm font-bold text-emerald-400 text-right border-b border-white/10">{formatCurrency(rep.mtd.commission)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{rep.mtd.dealsClosed}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{formatCurrency(avgDeal)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{formatPercent(profitMargin)}</td>
                     </tr>
                     {isExpanded && rep.mtd.invoices?.length > 0 && (
                        <tr className="bg-black/40">
                           <td colSpan={7} className="p-4 border-b border-white/10">
                              <div className="pl-12">
                                <table className="w-full text-left border-collapse glass-panel-strong rounded-lg overflow-hidden border border-white/10">
                                  <thead>
                                    <tr className="bg-white/[0.02]">
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Gross Sales</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Commission</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rep.mtd.invoices.map((inv:any) => (
                                      <tr key={inv.id} className="border-t border-white/10 hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                                        <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                        <td className="p-2">
                                           <div className="text-xs font-bold text-white">{inv.customer}</div>
                                           <div className="text-[10px] text-neutral-500 font-medium">{inv.invoiceNumber}</div>
                                        </td>
                                        <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                        <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                        <td className="p-2 text-xs font-bold text-emerald-400 text-right">{formatCurrency(inv.commission)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                           </td>
                        </tr>
                     )}
                     </React.Fragment>
                  )})}
               </tbody>
            </table>
          </div>
        </div>

        {/* SCREEN 4: YTD */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "YTD_STATS" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 3 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
           <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-8 flex items-center gap-3">
            <FiTrendingUp className="text-purple-400" /> Year-To-Date Performance
          </h3>
          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/10 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Gross Sales</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Dead Profit</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Commission</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Deals</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Avg Deal</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Dead Profit %</th>
                  </tr>
               </thead>
               <tbody>
                  {data.reps.sort((a:any, b:any) => b.ytd.profit - a.ytd.profit).map((rep: any) => {
                     const avgDeal = rep.ytd.dealsClosed > 0 ? rep.ytd.sales / rep.ytd.dealsClosed : 0
                     const profitMargin = rep.ytd.sales > 0 ? (rep.ytd.profit / rep.ytd.sales) * 100 : 0
                     const isExpanded = expandedRows.has(`ytd-${rep.id}`)
                     return (
                     <React.Fragment key={rep.id}>
                     <tr onClick={() => toggleRow(`ytd-${rep.id}`)} className="hover:bg-white/15 hover:shadow-lg transition-all duration-300 transition-colors cursor-pointer group">
                        <td className="p-4 text-sm font-bold border-b border-white/10 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.name.charAt(0)}</div>
                              {rep.name}
                           </div>
                        </td>
                        <td className="p-4 text-sm font-black text-white text-right border-b border-white/10">{formatCurrency(rep.ytd.sales)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-300 text-right border-b border-white/10">{formatCurrency(rep.ytd.profit)}</td>
                        <td className="p-4 text-sm font-bold text-emerald-400 text-right border-b border-white/10">{formatCurrency(rep.ytd.commission)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{rep.ytd.dealsClosed}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{formatCurrency(avgDeal)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{formatPercent(profitMargin)}</td>
                     </tr>
                     {isExpanded && rep.ytd.invoices?.length > 0 && (
                        <tr className="bg-black/40">
                           <td colSpan={7} className="p-4 border-b border-white/10">
                              <div className="pl-12">
                                <table className="w-full text-left border-collapse glass-panel-strong rounded-lg overflow-hidden border border-white/10">
                                  <thead>
                                    <tr className="bg-white/[0.02]">
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Gross Sales</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Commission</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rep.ytd.invoices.map((inv:any) => (
                                      <tr key={inv.id} className="border-t border-white/10 hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                                        <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                        <td className="p-2">
                                           <div className="text-xs font-bold text-white">{inv.customer}</div>
                                           <div className="text-[10px] text-neutral-500 font-medium">{inv.invoiceNumber}</div>
                                        </td>
                                        <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                        <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                        <td className="p-2 text-xs font-bold text-emerald-400 text-right">{formatCurrency(inv.commission)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                           </td>
                        </tr>
                     )}
                     </React.Fragment>
                  )})}
               </tbody>
            </table>
          </div>
        </div>

        {/* SCREEN 5: OVERDUE INVOICES */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "OVERDUE_INVOICES" ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
          
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 relative overflow-hidden group">
               <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent"></div>
               <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase mb-2">Total Overdue Balance</div>
               <div className="text-3xl font-black text-red-500">{formatCurrency(data.totalOverdueBalance)}</div>
            </div>
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 relative overflow-hidden">
               <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-2">Overdue Invoices</div>
               <div className="text-3xl font-black text-white">{data.overdueInvoices.length} <span className="text-sm font-medium text-neutral-500">Invoices</span></div>
            </div>
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 relative overflow-hidden">
               <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-2">Oldest Aging Invoice</div>
               <div className="text-3xl font-black text-white">
                  {data.overdueInvoices.length > 0 ? `${data.overdueInvoices[0].daysOverdue} ` : '0 '}
                  <span className="text-sm font-medium text-neutral-500">Days</span>
               </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/10 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Customer | Invoice</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Overdue Balance</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Sale Date</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-red-400 border-b border-white/10 text-right bg-red-500/5 rounded-tr-xl">Days Overdue</th>
                  </tr>
               </thead>
               <tbody>
                  {data.overdueInvoices.map((inv: any, idx: number) => {
                     const normalizeRepName = (n: string) => {
                        const val = (n || '').toLowerCase().replace(/\s+/g, ' ').trim()
                        if (val === 'ben bequette') return 'benjamin bequette'
                        if (val === 'monty morgan') return 'montgomery morgan'
                        if (val === 'ricky griffin') return 'richard griffin'
                        return val
                     }
                     const invRepNameNormalized = normalizeRepName(inv.repName)
                     const rep = data.reps.find((r: any) => {
                        const repNameNormalized = normalizeRepName(r.name)
                        return repNameNormalized.includes(invRepNameNormalized) || invRepNameNormalized.includes(repNameNormalized)
                     }) || { name: inv.repName, gradient: 'from-neutral-600 to-neutral-800' }
                     return (
                     <tr key={idx} className="hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors group">
                        <td className="p-4 text-sm font-bold border-b border-white/10 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.name.charAt(0) || '?'}</div>
                              {rep.name}
                           </div>
                        </td>
                        <td className="p-4 border-b border-white/10">
                           <div className="text-sm font-bold text-white">{inv.customer}</div>
                           <div className="text-xs font-medium text-neutral-500">{inv.invoiceNumber}</div>
                        </td>
                        <td className="p-4 text-sm font-black text-white text-right border-b border-white/10">{formatCurrency(inv.balance)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{inv.saleDate}</td>
                        <td className="p-4 text-sm font-bold text-red-400 text-right border-b border-white/10 bg-red-500/5">{inv.daysOverdue} Days</td>
                     </tr>
                  )})}
                  {data.overdueInvoices.length === 0 && (
                     <tr>
                        <td colSpan={5} className="p-8 text-center text-sm font-medium text-neutral-500">
                           <FiAlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                           No overdue invoices found.
                        </td>
                     </tr>
                  )}
               </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Weekly Sales Banner */}
      <div className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border-t border-emerald-500/20 px-6 py-4 flex items-center justify-between z-20 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 shadow-lg shadow-emerald-500/20">
            <FiDollarSign className="text-emerald-400 text-xl" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-widest text-white uppercase">Weekly Sales Totals</h3>
            <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Tracking
            </p>
          </div>
        </div>
        <div className="flex items-center gap-10">
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Total Sales</div>
            <div className="text-2xl font-black text-emerald-400 drop-shadow-md">{formatCurrency(data.teamWeekly.sales)}</div>
          </div>
          <div className="w-[1px] h-8 bg-white/10"></div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Total Dead Profit</div>
            <div className="text-2xl font-black text-white">{formatCurrency(data.teamWeekly.profit)}</div>
          </div>
          <div className="w-[1px] h-8 bg-white/10"></div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Total Commission</div>
            <div className="text-2xl font-black text-white">{formatCurrency(data.teamWeekly.commission)}</div>
          </div>
          <div className="w-[1px] h-8 bg-white/10"></div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Weekly Quota</div>
            <div className="flex items-center gap-2">
               <div className="text-2xl font-black text-white">{teamQuotaPct}%</div>
               <div className="w-16 h-2 bg-black rounded-full overflow-hidden border border-white/10">
                 <div className="h-full bg-emerald-500" style={{ width: `${teamQuotaPct}%` }}></div>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Derivation Document Breakdown Modal */}
      {kpiModalOpen && (
        <KpiBreakdownModal
          isOpen={kpiModalOpen}
          onClose={() => setKpiModalOpen(false)}
          title={kpiModalTitle}
          formula={kpiModalFormula}
          documents={kpiModalDocs}
        />
      )}

      {/* Dashboard Layout Customizer Modal */}
      {isCustomizerOpen && (
        <SalesBoardCustomizer
          isOpen={isCustomizerOpen}
          onClose={() => setIsCustomizerOpen(false)}
          widgets={widgets}
          onUpdateWidgets={handleUpdateWidgets}
          onReset={handleResetLayout}
        />
      )}
    </div>
  )
}

