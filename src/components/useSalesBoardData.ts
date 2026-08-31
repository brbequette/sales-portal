"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { WidgetConfig, DEFAULT_WIDGET_LAYOUT } from "./SalesBoardCustomizer"
import { clearSharedJson, fetchSharedJson } from "@/lib/shared-api-fetch"

export const SCREENS = ["WEEKLY_GRID", "REPS_KPI", "MTD_STATS", "YTD_STATS", "OVERDUE_INVOICES"] as const
export type ScreenType = typeof SCREENS[number]

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

const ROTATION_TIME = 15000
const TICK_INTERVAL = 100

const REP_FIRST_NAME_ALIASES: Record<string, string> = { ben: "benjamin", benjamin: "benjamin" }

export const canonicalRepDisplayName = (name: string) => {
  const normalized = String(name || "").trim().replace(/\s+/g, " ")
  if (/^ben(?:jamin)?\s+bequette$/i.test(normalized)) return "Benjamin"
  return normalized
}

const repNamesMatch = (left: string, right: string) => {
  const parts = (value: string) => String(value || "").toLowerCase().trim().split(/\s+/).filter(Boolean)
  const a = parts(left)
  const b = parts(right)
  if (!a.length || !b.length) return false
  if (a.join(" ") === b.join(" ")) return true
  return (REP_FIRST_NAME_ALIASES[a[0]] || a[0]) === (REP_FIRST_NAME_ALIASES[b[0]] || b[0])
    && a.at(-1) === b.at(-1)
}

export interface SalesBoardDataReturn {
  data: any
  loading: boolean
  lastUpdated: Date | null
  refreshError: boolean
  currentScreen: ScreenType
  isFullscreen: boolean
  isPaused: boolean
  progress: number
  expandedRows: Set<string>
  isCustomizerOpen: boolean
  setIsCustomizerOpen: React.Dispatch<React.SetStateAction<boolean>>
  widgets: WidgetConfig[]
  kpiModalOpen: boolean
  setKpiModalOpen: React.Dispatch<React.SetStateAction<boolean>>
  kpiModalTitle: string
  kpiModalFormula: string
  kpiModalDocs: any[]
  boardRef: React.RefObject<HTMLDivElement | null>
  teamQuotaPct: number
  handleUpdateWidgets: (updated: WidgetConfig[]) => void
  handleResetLayout: () => void
  toggleRow: (id: string) => void
  toggleFullscreen: () => Promise<void>
  nextScreen: () => void
  prevScreen: () => void
  goToScreen: (screen: ScreenType) => void
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>
}

export function useSalesBoardData(): SalesBoardDataReturn {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState(false)
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("WEEKLY_GRID")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const costRepairSignatureRef = useRef("")

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

  const handleUpdateWidgets = useCallback((updated: WidgetConfig[]) => {
    setWidgets(updated)
    try {
      localStorage.setItem("salesboard_widget_layout", JSON.stringify(updated))
    } catch (e) {
      console.error("Failed to save layout", e)
    }
  }, [])

  const handleResetLayout = useCallback(() => {
    setWidgets(DEFAULT_WIDGET_LAYOUT)
    try {
      localStorage.removeItem("salesboard_widget_layout")
    } catch (e) {
      console.error("Failed to reset layout", e)
    }
  }, [])

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
        title = "Weekly Subtotal Derivation"
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

  const toggleRow = useCallback((id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const boardRef = useRef<HTMLDivElement>(null)

  // Fullscreen listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      if (boardRef.current) await boardRef.current.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }, [])

  // Load local cache immediately on mount so TV screen loads instantly
  useEffect(() => {
    try {
      const cached = typeof window !== "undefined" ? localStorage.getItem("tv_salesboard_cache") : null
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && parsed.reps && parsed.reps.length > 0) {
          setData(parsed)
          setLoading(false)
        }
      }
    } catch (e) {
      console.warn("Failed to load cached TV salesboard data:", e)
    }
  }, [])

  // Data fetching and processing from local DB endpoints
  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = new Date()
        const currentYear = today.getFullYear()
        const currentMonth = today.getMonth()
        const yearStartStr = `${currentYear}-01-01`

        const lastMonthDate = new Date(currentYear, currentMonth - 1, 1)
        const yyyyLM = lastMonthDate.getFullYear()
        const mmLM = String(lastMonthDate.getMonth() + 1).padStart(2, '0')
        
        const fetchSafe = async (url: string) => {
          try {
            const res = await fetch(url)
            if (!res.ok) return null
            const type = res.headers.get("content-type") || ""
            return type.includes("application/json") ? await res.json() : null
          } catch {
            return null
          }
        }

        const [usersPayloadRaw, invoicesPayloadRaw, salesOrdersPayloadRaw, quotesPayloadRaw, configPayloadRaw, overduePayloadRaw, weeklyPayloadRaw] = await Promise.all([
          fetchSafe("/api/tv/users"),
          fetchSafe(`/api/get-documents?pageSize=8000&type=Invoice&loadAll=true&startDate=${yearStartStr}`),
          fetchSafe(`/api/get-documents?pageSize=8000&type=SalesOrder&loadAll=true&startDate=${yearStartStr}`),
          Promise.resolve({ documents: [] }),
          fetchSafe("/api/tv/config"),
          fetchSafe(`/api/get-documents?pageSize=8000&type=Invoice&loadAll=true&status=overdue`),
          fetchSharedJson<any>("/api/dashboard-weekly-sales").catch(() => null)
        ])

        const usersPayload = usersPayloadRaw || { users: [] }
        const invoicesPayload = invoicesPayloadRaw || { documents: [] }
        const salesOrdersPayload = salesOrdersPayloadRaw || { documents: [] }
        const quotesPayload = quotesPayloadRaw || { documents: [] }
        const configPayload = configPayloadRaw || { holidays: [] }
        const overduePayload = overduePayloadRaw || { documents: [] }
        const weeklyPayload = weeklyPayloadRaw || { documents: [] }

        if (!usersPayloadRaw || !invoicesPayloadRaw || !weeklyPayloadRaw) {
          throw new Error("Required TV dashboard data was unavailable")
        }

        const missingCostInvoiceIds: string[] = Array.isArray(weeklyPayload.missingCostInvoiceIds)
          ? weeklyPayload.missingCostInvoiceIds.map(String).filter(Boolean).slice(0, 5)
          : []
        const missingCostSalesOrderIds: string[] = Array.isArray(weeklyPayload.missingCostSalesOrderIds)
          ? weeklyPayload.missingCostSalesOrderIds.map(String).filter(Boolean).slice(0, 5)
          : []
        const repairSignature = [...missingCostInvoiceIds.map(id => `i:${id}`), ...missingCostSalesOrderIds.map(id => `s:${id}`)].sort().join(",")
        if (repairSignature && costRepairSignatureRef.current !== repairSignature) {
          costRepairSignatureRef.current = repairSignature
          fetch("/api/tv/process-missing-costs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoiceIds: missingCostInvoiceIds, salesOrderIds: missingCostSalesOrderIds }),
          }).then(async response => {
            const result = response.ok ? await response.json().catch(() => null) : null
            if (result?.processed > 0) {
              clearSharedJson("/api/dashboard-weekly-sales")
              window.setTimeout(fetchData, 1500)
            }
          }).catch(() => {
            costRepairSignatureRef.current = ""
          })
        } else if (!repairSignature) {
          costRepairSignatureRef.current = ""
        }

        const combinedDocuments = [
          ...(invoicesPayload.documents || []),
          ...(salesOrdersPayload.documents || []),
          ...(quotesPayload.documents || [])
        ]

        // Extract configured holidays list
        const holidaysList = configPayload.holidays || []
        const holidayDateSet = new Set((holidaysList || []).map((h: any) => typeof h === 'string' ? h : h.date ? h.date.split('T')[0] : ''))

        // Helper: Compute workdays in date range (excludes Saturdays, Sundays, and holidays)
        const countWorkdays = (start: Date, end: Date) => {
          let count = 0
          const cur = new Date(start)
          while (cur <= end) {
            const dayOfWeek = cur.getDay()
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Monday-Friday
              const yyyy = cur.getFullYear()
              const mm = String(cur.getMonth() + 1).padStart(2, '0')
              const dd = String(cur.getDate()).padStart(2, '0')
              const dateStr = `${yyyy}-${mm}-${dd}`
              if (!holidayDateSet.has(dateStr)) {
                count++
              }
            }
            cur.setDate(cur.getDate() + 1)
          }
          return count
        }
        
        // Build reps from users with showOnSalesBoard === true (fallback to all active team users)
        let boardUsers = (usersPayload.users || []).filter((u: any) => u.showOnSalesBoard)
        if (boardUsers.length === 0) {
          boardUsers = (usersPayload.users || []).filter((u: any) => {
            const emailLower = (u.email || "").toLowerCase()
            return !emailLower.includes("dummy") && !emailLower.includes("example.com") && !emailLower.includes("test_migration")
          })
        }
        
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

        // Compute workdays in current week (Mon-Fri)
        const day = today.getDay()
        const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(today.getFullYear(), today.getMonth(), diffToMonday)
        const friday = new Date(monday)
        friday.setDate(monday.getDate() + 4)
        const workdaysInCurrentWeek = Math.max(1, countWorkdays(monday, friday))

        // Compute workdays in current month and current workday index N
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0)
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999)
        const workdaysInCurrentMonth = Math.max(1, countWorkdays(firstDayOfMonth, lastDayOfMonth))
        const currentWorkdayIndex = Math.max(1, countWorkdays(firstDayOfMonth, today))

        // Compute Last Month date range & Workday #N Cutoff Date
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear
        const lastMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1
        const firstDayOfLastMonth = new Date(lastMonthYear, lastMonthIndex, 1, 0, 0, 0, 0)
        const lastDayOfLastMonth = new Date(lastMonthYear, lastMonthIndex + 1, 0, 23, 59, 59, 999)

        let countLM = 0
        let lastMonthCutoffDateStr = `${lastMonthYear}-${String(lastMonthIndex + 1).padStart(2, '0')}-01`
        const daysInLastMonth = lastDayOfLastMonth.getDate()
        for (let d = 1; d <= daysInLastMonth; d++) {
          const cur = new Date(lastMonthYear, lastMonthIndex, d)
          const dayOfWeek = cur.getDay()
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const yyyy = cur.getFullYear()
            const mm = String(cur.getMonth() + 1).padStart(2, '0')
            const dd = String(cur.getDate()).padStart(2, '0')
            const ds = `${yyyy}-${mm}-${dd}`
            if (!holidayDateSet.has(ds)) {
              countLM++
              lastMonthCutoffDateStr = ds
              if (countLM === currentWorkdayIndex) break
            }
          }
        }

        const dynamicReps = boardUsers.map((u: any, i: number) => {
          const currentGoal = u.monthlyVigGoals?.find((g: any) => g.monthKey === monthKey)
          const dailyGoal = parseFloat(u.dailyProfitGoal) || 0
          const weeklyTarget = dailyGoal * workdaysInCurrentWeek
          const monthlyTarget = currentGoal?.profitGoal || (dailyGoal * workdaysInCurrentMonth)
          
          return {
            id: u.id,
            name: canonicalRepDisplayName(u.name || u.email),
            sourceName: u.name || u.email,
            role: u.role || "Sales Representative",
            expectedVig: 1.5,
            weeklyTarget: weeklyTarget,
            monthlyTarget: monthlyTarget,
            gradient: REP_GRADIENTS[i % REP_GRADIENTS.length],
            payoutStructure: u.payoutStructure || "two_payment"
          }
        })

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
            lastMonthPace: { sales: 0, profit: 0, dealsClosed: 0 },
            lastMonthFinal: { sales: 0, profit: 0, dealsClosed: 0 },
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

        // Company-wide roll-ups count every invoice in the period, including
        // house accounts, deactivated reps and reps hidden from the board, so
        // the TV totals agree with the executive and dashboard totals.
        const companyTotals = {
          mtd: { sales: 0, profit: 0, commission: 0, dealsClosed: 0 },
          ytd: { sales: 0, profit: 0, commission: 0, dealsClosed: 0 },
          lastMonth: { sales: 0, profit: 0, dealsClosed: 0 },
        }

        const normalizeRepName = (n: string) => {
          return (n || '').toLowerCase().replace(/\s+/g, ' ').trim()
        }

        const getMatchedRep = (nameStr: string) => {
          const spNameNormalized = normalizeRepName(nameStr)
          if (!spNameNormalized) return null
          return Object.values(repsMap).find(r => {
            const repNameNormalized = normalizeRepName(r.sourceName || r.name)
            return repNameNormalized.includes(spNameNormalized)
              || spNameNormalized.includes(repNameNormalized)
              || repNamesMatch(repNameNormalized, spNameNormalized)
          })
        }

        // Group all-time overdue invoices by Sales Rep
        const repOverdueMap: Record<string, {
          repId: string
          repName: string
          gradient: string
          totalBalance: number
          overdueCount: number
          maxDaysOverdue: number
          invoices: any[]
        }> = {}

        let totalOverdueBalance = 0
        let maxSystemOverdueDays = 0
        let totalOverdueCount = 0

        const overdueDocs = [
          ...(overduePayload.documents || []),
          ...(invoicesPayload.documents || []).filter((d: any) => d.status === 'overdue' || parseFloat(d.balance || 0) > 0)
        ]

        const seenOverdueIds = new Set()
        for (const doc of overdueDocs) {
          if (!doc || !doc.id || seenOverdueIds.has(doc.id)) continue
          seenOverdueIds.add(doc.id)

          const balance = parseFloat(doc.balance !== undefined ? doc.balance : doc.amount || 0)
          if (balance <= 0) continue
          if (doc.status === 'Void' || doc.status === 'void' || doc.status === 'Draft' || doc.status === 'draft' || doc.status === 'Paid' || doc.status === 'paid') continue

          const spName = (doc.salesperson || "Unassigned").trim()
          const matchedRep = getMatchedRep(spName)
          const repKey = matchedRep ? matchedRep.id : spName.toLowerCase()
          const repName = matchedRep ? matchedRep.name : spName
          const repGradient = matchedRep ? matchedRep.gradient : 'from-slate-700 to-slate-900'

          const saleDate = doc.date ? doc.date.split('T')[0] : (doc.issueDate ? doc.issueDate.split('T')[0] : '')
          if (!doc.dueDate) continue
          const dueDateKey = String(doc.dueDate).split('T')[0]
          const dueDateObj = new Date(`${dueDateKey}T12:00:00`)
          const todayAtNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
          const daysOverdue = Math.floor((todayAtNoon.getTime() - dueDateObj.getTime()) / (1000 * 3600 * 24))
          if (daysOverdue <= 0) continue

          totalOverdueBalance += balance
          totalOverdueCount += 1
          if (daysOverdue > maxSystemOverdueDays) maxSystemOverdueDays = daysOverdue

          if (!repOverdueMap[repKey]) {
            repOverdueMap[repKey] = {
              repId: repKey,
              repName,
              gradient: repGradient,
              totalBalance: 0,
              overdueCount: 0,
              maxDaysOverdue: 0,
              invoices: []
            }
          }

          repOverdueMap[repKey].totalBalance += balance
          repOverdueMap[repKey].overdueCount += 1
          if (daysOverdue > repOverdueMap[repKey].maxDaysOverdue) {
            repOverdueMap[repKey].maxDaysOverdue = daysOverdue
          }

          repOverdueMap[repKey].invoices.push({
            id: doc.id,
            zohoId: doc.zohoId,
            invoiceNumber: doc.invoiceNumber || doc.invoice_number || doc.zohoId,
            customer: doc.accountName || "Customer",
            amount: doc.amount || 0,
            balance,
            daysOverdue,
            saleDate,
            dueDate: doc.dueDate ? doc.dueDate.split('T')[0] : saleDate
          })
        }
        const rawDocs = combinedDocuments

        rawDocs.forEach((doc: any) => {
          let spName = (doc.salesperson || "").toUpperCase()
          const docType = doc.type || 'Invoice'

          // Reps hidden from the board (and Paul Gencuski) stay off the rep
          // cards but their invoices still belong in the company roll-ups.
          const hiddenFromBoard = spName.includes("PAUL") && (spName.includes("GENCUSKI") || spName.includes("GENKUSKI"))

          // If no salesperson, fall back to account owner ID matching
          let matchedRep: any = null
          if (spName && !hiddenFromBoard) {
            matchedRep = getMatchedRep(spName)
          }
          // Fallback: match by account owner ID when salesperson is missing
          if (!matchedRep && !hiddenFromBoard && doc.accountOwnerId) {
            matchedRep = Object.values(repsMap).find((r: any) => r.id === doc.accountOwnerId) || null
          }

          // --- 1. ESTIMATES / QUOTES (48 Hours active on board or until SO) ---
          if (docType === 'Quote') {
            if (hiddenFromBoard) return
            const quoteDate = new Date(doc.date)
            const ageHours = (today.getTime() - quoteDate.getTime()) / (1000 * 3600)
            const isConvertedToSO = doc.isConvertedToSO || false
            if (ageHours <= 48 && !isConvertedToSO && matchedRep) {
              matchedRep.activePipeline.estimateCount += 1
              matchedRep.activePipeline.estimateAmount += parseFloat(doc.amount || 0)
            }
            return
          }

          // --- 2. SALES ORDERS (Active on board until Invoiced/Closed) ---
          if (docType === 'SalesOrder') {
            if (hiddenFromBoard) return
            const isInvoicedOrClosed = doc.isInvoicedOrClosed || false
            if (isInvoicedOrClosed) return // Skip converted/closed/voided Sales Orders to avoid double-counting
            if (matchedRep) {
              matchedRep.activePipeline.salesOrderCount += 1
              matchedRep.activePipeline.salesOrderAmount += parseFloat(doc.amount || 0)
            }
          }

          // Booked MTD/YTD performance is invoice-only. Uninvoiced sales
          // orders remain visible in activePipeline and are never called sales.
          if (docType === 'Invoice') {
            const saleDate = doc.date ? doc.date.split('T')[0] : ''
            if (!saleDate) return

            // Date-only strings parse as UTC and can shift to the prior day in
            // Arizona. Local noon preserves the intended business date.
            const invDateObj = new Date(`${saleDate}T12:00:00`)
            const amount = Number(doc.amount || 0)
            const profit = Number(doc.profit || 0)
            const deadCostNoVig = Number(doc.deadCostNoVig || 0)
            const deadCostSubjectToVig = Number(doc.deadCostSubjectToVig || 0)

            const isPaid = doc.isPaid || false
            const isSameDayPaid = doc.isSameDayPaid || false
            // Use structured commission data if available, otherwise fall back to raw number
            const commObj = typeof doc.commission === 'object' && doc.commission !== null ? doc.commission : null
            const fullComm = commObj ? (commObj.total || 0) + (commObj.future || 0) : Number(doc.commission || 0)

            const isSinglePayment = matchedRep?.payoutStructure === 'single_payment'
            let commissionEarned = 0
            if (commObj) {
              // Prefer API-computed values: total = already earned, future = pending
              commissionEarned = commObj.total || 0
            } else if (isSinglePayment) {
              commissionEarned = (isPaid || isSameDayPaid) ? fullComm : 0
            } else {
              commissionEarned = fullComm * 0.5
              if (isPaid || isSameDayPaid) {
                commissionEarned = fullComm
              }
            }

            const balance = Number(doc.balance !== undefined ? doc.balance : 0)

            const inCurrentWeek = weekDays.includes(saleDate)
            const isMTD = invDateObj >= firstDayOfMonth && invDateObj <= lastDayOfMonth
            const isLastMonth = invDateObj >= firstDayOfLastMonth && invDateObj <= lastDayOfLastMonth
            const isYTD = invDateObj.getFullYear() === currentYear

            // Company roll-ups first — every invoice counts, matched or not.
            if (isMTD) {
              companyTotals.mtd.sales += amount
              companyTotals.mtd.profit += profit
              companyTotals.mtd.commission += commissionEarned
              companyTotals.mtd.dealsClosed += 1
            }
            if (isYTD) {
              companyTotals.ytd.sales += amount
              companyTotals.ytd.profit += profit
              companyTotals.ytd.commission += commissionEarned
              companyTotals.ytd.dealsClosed += 1
            }
            if (isLastMonth) {
              companyTotals.lastMonth.sales += amount
              companyTotals.lastMonth.profit += profit
              companyTotals.lastMonth.dealsClosed += 1
            }

            if (matchedRep) {
              if (isLastMonth) {
                matchedRep.lastMonthFinal.sales += amount
                matchedRep.lastMonthFinal.profit += profit
                matchedRep.lastMonthFinal.dealsClosed += 1

                if (saleDate <= lastMonthCutoffDateStr) {
                  matchedRep.lastMonthPace.sales += amount
                  matchedRep.lastMonthPace.profit += profit
                  matchedRep.lastMonthPace.dealsClosed += 1
                }
              }

              if (isMTD) {
                teamWeekly.sales += amount
                teamWeekly.profit += profit
                teamWeekly.deadCostNoVig += deadCostNoVig
                teamWeekly.deadCostSubjectToVig += deadCostSubjectToVig
                teamWeekly.commission += commissionEarned

                matchedRep.mtd.sales += amount
                matchedRep.mtd.profit += profit
                matchedRep.mtd.deadCostNoVig += deadCostNoVig
                matchedRep.mtd.deadCostSubjectToVig += deadCostSubjectToVig
                matchedRep.mtd.commission += commissionEarned
                matchedRep.mtd.dealsClosed += 1
                matchedRep.mtd.invoices.push({ 
                  id: doc.id, 
                  zohoId: doc.zohoId,
                  date: saleDate, 
                  customer: doc.accountName, 
                  amount, 
                  profit, 
                  deadCostNoVig,
                  deadCostSubjectToVig,
                  commission: commissionEarned, 
                  invoiceNumber: doc.invoiceNumber 
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
                  id: doc.id, 
                  zohoId: doc.zohoId,
                  date: saleDate, 
                  customer: doc.accountName, 
                  amount, 
                  profit, 
                  deadCostNoVig,
                  deadCostSubjectToVig,
                  commission: commissionEarned, 
                  invoiceNumber: doc.invoiceNumber 
                })
              }
            }
          }
        })

        // Weekly sales use the lifecycle-aware server result: invoices plus
        // only estimates/SOs that have not been converted downstream.
        teamWeekly.sales = 0
        teamWeekly.profit = 0
        teamWeekly.deadCostNoVig = 0
        teamWeekly.deadCostSubjectToVig = 0
        teamWeekly.commission = 0
        for (const rep of Object.values(repsMap) as any[]) {
          rep.weekly.sales = [0, 0, 0, 0, 0]
          rep.weekly.profit = [0, 0, 0, 0, 0]
          rep.weekly.totalSales = 0
          rep.weekly.totalProfit = 0
          rep.weekly.deadCostNoVig = 0
          rep.weekly.deadCostSubjectToVig = 0
          rep.weekly.commission = 0
          rep.weekly.dealsClosed = 0
          rep.weekly.invoices = []
        }

        const rawDocById = new Map(rawDocs.map((doc: any) => [doc.id, doc]))
        for (const doc of (weeklyPayload.documents || [])) {
          const rawDoc: any = rawDocById.get(doc.id) || {}
          const amount = Number(doc.subtotal || 0)
          const profit = Number(doc.profit || rawDoc.profit || 0)
          const deadCostNoVig = Number(rawDoc.deadCostNoVig || 0)
          const deadCostSubjectToVig = Number(rawDoc.deadCostSubjectToVig || 0)
          const commission = typeof rawDoc.commission === "object"
            ? Number(rawDoc.commission?.total || 0)
            : Number(rawDoc.commission || 0)
          teamWeekly.sales += amount
          teamWeekly.profit += profit
          teamWeekly.deadCostNoVig += deadCostNoVig
          teamWeekly.deadCostSubjectToVig += deadCostSubjectToVig
          teamWeekly.commission += commission

          const matchedRep = repsMap[String(doc.repId || "")] || getMatchedRep(doc.salesperson || "")
          if (!matchedRep) continue
          if (doc.type === "estimate") {
            matchedRep.activePipeline.estimateCount += 1
            matchedRep.activePipeline.estimateAmount += amount
          }
          const dateKey = String(doc.date || "").split("T")[0]
          const dayIndex = weekDays.indexOf(dateKey)
          if (dayIndex >= 0) {
            matchedRep.weekly.sales[dayIndex] += amount
            matchedRep.weekly.profit[dayIndex] += profit
          }
          matchedRep.weekly.totalSales += amount
          matchedRep.weekly.totalProfit += profit
          matchedRep.weekly.deadCostNoVig += deadCostNoVig
          matchedRep.weekly.deadCostSubjectToVig += deadCostSubjectToVig
          matchedRep.weekly.commission += commission
          matchedRep.weekly.dealsClosed += 1
          matchedRep.weekly.invoices.push(doc)
        }

        const weeklyBreakdown = (weeklyPayload.documents || []).reduce((result: any, doc: any) => {
          const type = doc.type === "salesorder" || doc.type === "estimate" ? doc.type : "invoice"
          result[type].subtotal += Number(doc.subtotal || 0)
          result[type].deadCost += Number(doc.deadCost || 0)
          result[type].profit += Number(doc.profit || 0)
          result[type].count += 1
          return result
        }, {
          invoice: { subtotal: 0, deadCost: 0, profit: 0, count: 0 },
          salesorder: { subtotal: 0, deadCost: 0, profit: 0, count: 0 },
          estimate: { subtotal: 0, deadCost: 0, profit: 0, count: 0 },
        })

        const computedBoardData = {
          reps: Object.values(repsMap),
          companyTotals,
          teamWeekly,
          currentWorkdayIndex,
          repOverdueMap,
          totalOverdueBalance,
          totalOverdueCount,
          maxSystemOverdueDays,
          rawInvoices: rawDocs.filter((d: any) => d.type === 'Invoice'),
          weekDays,
          weeklyBreakdown,
          missingCostCount: missingCostInvoiceIds.length + missingCostSalesOrderIds.length,
        }

        try {
          if (typeof window !== "undefined") {
            localStorage.setItem("tv_salesboard_cache", JSON.stringify(computedBoardData))
          }
        } catch (e) {
          console.warn("Failed to cache TV salesboard data:", e)
        }

        setData(computedBoardData)
        setLastUpdated(new Date())
        setRefreshError(false)

      } catch (err) {
        console.error("Sales Board Error:", err)
        setRefreshError(true)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()

    // Poll for new sales/invoices every 60 seconds automatically on the TV display
    const pollInterval = setInterval(() => {
      fetchData()
    }, 60000)

    // Refresh when tab becomes visible
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Auto-rotate screens
  useEffect(() => {
    if (isPaused) return
    const interval = setInterval(() => {
      setProgress(previous => {
        const next = previous + (TICK_INTERVAL / ROTATION_TIME) * 100
        if (next < 100) return next
        setCurrentScreen(screen => {
          const idx = SCREENS.indexOf(screen)
          return SCREENS[(idx + 1) % SCREENS.length]
        })
        return 0
      })
    }, TICK_INTERVAL)
    return () => clearInterval(interval)
  }, [isPaused])

  const nextScreen = useCallback(() => {
    setCurrentScreen(prev => {
      const idx = SCREENS.indexOf(prev)
      return SCREENS[(idx + 1) % SCREENS.length]
    })
    setProgress(0)
  }, [])

  const prevScreen = useCallback(() => {
    setCurrentScreen(prev => {
      const idx = SCREENS.indexOf(prev)
      return SCREENS[(idx - 1 + SCREENS.length) % SCREENS.length]
    })
    setProgress(0)
  }, [])

  const goToScreen = useCallback((screen: ScreenType) => {
    setCurrentScreen(screen)
    setProgress(0)
  }, [])

  const teamQuotaPct = useMemo(() => {
    return data?.teamWeekly?.target > 0 
      ? Math.min(100, Math.round((data.teamWeekly.profit / data.teamWeekly.target) * 100)) 
      : 0
  }, [data])

  return {
    data,
    loading,
    lastUpdated,
    refreshError,
    currentScreen,
    isFullscreen,
    isPaused,
    progress,
    expandedRows,
    isCustomizerOpen,
    setIsCustomizerOpen,
    widgets,
    kpiModalOpen,
    setKpiModalOpen,
    kpiModalTitle,
    kpiModalFormula,
    kpiModalDocs,
    boardRef,
    teamQuotaPct,
    handleUpdateWidgets,
    handleResetLayout,
    toggleRow,
    toggleFullscreen,
    nextScreen,
    prevScreen,
    goToScreen,
    setIsPaused
  }
}
