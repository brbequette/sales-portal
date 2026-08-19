"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { WidgetConfig, DEFAULT_WIDGET_LAYOUT } from "./SalesBoardCustomizer"

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

export interface SalesBoardDataReturn {
  data: any
  loading: boolean
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
      if (!data) return

      let title = "KPI Calculation Breakdown"
      let formula = "Sum of matching documents"
      let docs: any[] = []

      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      const docList = data.rawDocuments || data.rawInvoices || []

      if (key === "weeklyGoal") {
        title = "Weekly Subtotal Derivation"
        formula = "Sum of 48h active estimates, uninvoiced sales orders, and invoices of all statuses issued in current week"
        docs = docList.filter((doc: any) => {
          const saleDate = doc.date ? doc.date.split('T')[0] : ''
          return (data.weekDays || []).includes(saleDate)
        })
      } else if (key === "totalRevenue") {
        title = "MTD Total Revenue Derivation"
        formula = "Sum of active 48h estimates, uninvoiced sales orders, and invoices of all statuses created in current month"
        docs = docList.filter((inv: any) => {
          const d = new Date(inv.date || inv.issueDate)
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear
        })
      } else if (key === "estimates") {
        title = "48h Active Estimates Derivation"
        formula = "Estimates <= 48 hours old that have not been converted to a sales order"
        docs = (data.rawQuotes || []).filter((q: any) => {
          const qDate = new Date(q.date)
          const ageHours = (now.getTime() - qDate.getTime()) / (1000 * 3600)
          return ageHours >= 0 && ageHours <= 48 && !q.isConvertedToSO
        })
      } else if (key === "salesOrders") {
        title = "Uninvoiced Sales Orders Derivation"
        formula = "Sales orders not yet linked to or accounted for by an invoice"
        docs = (data.rawSalesOrders || []).filter((so: any) => !so.isLinkedToInvoice)
      } else if (key === "invoices") {
        title = "Invoices Derivation (All Statuses)"
        formula = "All invoices across all statuses (Paid, Open, Overdue, Draft, Void, etc.)"
        docs = data.rawInvoices || []
      } else if (key === "monthlyProfit") {
        title = "Monthly Net Profit & Commission Derivation"
        formula = "Sum of (Subtotal - DeadCostPlusVIG - CCFees - AdditionalCosts) for current month documents"
        docs = docList.filter((inv: any) => {
          const d = new Date(inv.date || inv.issueDate)
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear
        })
      } else if (key === "activePipeline") {
        title = "Active Pipeline Derivation"
        formula = "48h unconverted estimates, uninvoiced sales orders, and open invoice balances"
        docs = [
          ...(data.rawQuotes || []).filter((q: any) => {
            const qDate = new Date(q.date)
            const ageHours = (now.getTime() - qDate.getTime()) / (1000 * 3600)
            return ageHours >= 0 && ageHours <= 48 && !q.isConvertedToSO
          }),
          ...(data.rawSalesOrders || []).filter((so: any) => !so.isLinkedToInvoice),
          ...(data.rawInvoices || []).filter((inv: any) => {
            const status = (inv.status || "").toLowerCase()
            return status !== "paid" && status !== "void" && parseFloat(inv.balance || 0) > 0
          })
        ]
      } else {
        title = "Sales Performance Document Derivation"
        formula = "All matching period estimates, sales orders, and invoices"
        docs = docList
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

        const lastMonthDate = new Date(currentYear, currentMonth - 1, 1)
        const yyyyLM = lastMonthDate.getFullYear()
        const mmLM = String(lastMonthDate.getMonth() + 1).padStart(2, '0')
        const startDateStr = `${yyyyLM}-${mmLM}-01`

        const threeDaysAgoStr = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        
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

        const [usersPayloadRaw, invoicesPayloadRaw, salesOrdersPayloadRaw, quotesPayloadRaw, configPayloadRaw, overduePayloadRaw] = await Promise.all([
          fetchSafe("/api/admin/users"),
          fetchSafe(`/api/get-documents?pageSize=8000&type=Invoice&loadAll=true&startDate=${startDateStr}`),
          fetchSafe(`/api/get-documents?pageSize=8000&type=SalesOrder&loadAll=true&startDate=${startDateStr}`),
          fetchSafe(`/api/get-documents?pageSize=8000&type=Quote&loadAll=true&startDate=${startDateStr}`),
          fetchSafe("/api/get-config"),
          fetchSafe(`/api/get-documents?pageSize=8000&type=Invoice&loadAll=true&status=overdue`)
        ])

        const usersPayload = usersPayloadRaw || { users: [] }
        const invoicesPayload = invoicesPayloadRaw || { documents: [] }
        const salesOrdersPayload = salesOrdersPayloadRaw || { documents: [] }
        const quotesPayload = quotesPayloadRaw || { documents: [] }
        const configPayload = configPayloadRaw || { holidays: [] }
        const overduePayload = overduePayloadRaw || { documents: [] }

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
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
        const workdaysInCurrentMonth = Math.max(1, countWorkdays(firstDayOfMonth, lastDayOfMonth))
        const currentWorkdayIndex = Math.max(1, countWorkdays(firstDayOfMonth, today))

        // Compute Last Month date range & Workday #N Cutoff Date
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear
        const lastMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1
        const firstDayOfLastMonth = new Date(lastMonthYear, lastMonthIndex, 1)
        const lastDayOfLastMonth = new Date(lastMonthYear, lastMonthIndex + 1, 0)

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
            name: u.name || u.email,
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
            subtotals: {
              estimates: 0,
              estimatesCount: 0,
              salesOrders: 0,
              salesOrdersCount: 0,
              invoices: 0,
              invoicesCount: 0,
              invoicesByStatus: {
                paid: 0,
                open: 0,
                overdue: 0,
                draft: 0,
                void: 0,
                other: 0
              },
              total: 0
            },
            weekly: { 
              sales: [0,0,0,0,0], 
              profit: [0,0,0,0,0], 
              deadCostNoVig: 0, 
              deadCostSubjectToVig: 0, 
              totalSales: 0, 
              totalProfit: 0, 
              dealsClosed: 0, 
              commission: 0, 
              estimatesSubtotal: 0,
              estimatesCount: 0,
              salesOrdersSubtotal: 0,
              salesOrdersCount: 0,
              invoicesSubtotal: 0,
              invoicesCount: 0,
              invoices: [] 
            },
            mtd: { 
              sales: 0, 
              profit: 0, 
              deadCostNoVig: 0, 
              deadCostSubjectToVig: 0, 
              commission: 0, 
              dealsClosed: 0, 
              estimatesSubtotal: 0,
              estimatesCount: 0,
              salesOrdersSubtotal: 0,
              salesOrdersCount: 0,
              invoicesSubtotal: 0,
              invoicesCount: 0,
              invoices: [] 
            },
            lastMonthPace: { sales: 0, profit: 0, dealsClosed: 0 },
            lastMonthFinal: { sales: 0, profit: 0, dealsClosed: 0 },
            ytd: { 
              sales: 0, 
              profit: 0, 
              deadCostNoVig: 0, 
              deadCostSubjectToVig: 0, 
              commission: 0, 
              dealsClosed: 0, 
              estimatesSubtotal: 0,
              estimatesCount: 0,
              salesOrdersSubtotal: 0,
              salesOrdersCount: 0,
              invoicesSubtotal: 0,
              invoicesCount: 0,
              invoices: [] 
            },
            activePipeline: { estimateCount: 0, estimateAmount: 0, salesOrderCount: 0, salesOrderAmount: 0 }
          }
        })

        let teamSubtotals = {
          estimates: 0,
          estimatesCount: 0,
          salesOrders: 0,
          salesOrdersCount: 0,
          invoices: 0,
          invoicesCount: 0,
          total: 0
        }

        let teamWeekly = { 
          sales: 0, 
          profit: 0, 
          deadCostNoVig: 0,
          deadCostSubjectToVig: 0,
          commission: 0, 
          estimatesSubtotal: 0,
          salesOrdersSubtotal: 0,
          invoicesSubtotal: 0,
          target: dynamicReps.reduce((sum: number, r: any) => sum + r.weeklyTarget, 0) 
        }

        const normalizeRepName = (n: string) => {
          return (n || '').toLowerCase().replace(/\s+/g, ' ').trim()
        }

        const getMatchedRep = (nameStr: string) => {
          const spNameNormalized = normalizeRepName(nameStr)
          if (!spNameNormalized) return null
          return Object.values(repsMap).find(r => {
            const repNameNormalized = normalizeRepName(r.name)
            return repNameNormalized.includes(spNameNormalized) || spNameNormalized.includes(repNameNormalized)
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
          const dueDateObj = doc.dueDate ? new Date(doc.dueDate) : (doc.date ? new Date(doc.date) : today)
          const daysOverdue = Math.max(1, Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 3600 * 24)))

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
        // Pre-build index of Invoices to link with Sales Orders and avoid double counting
        const processedInvoiceIds = new Set<string>()
        const processedInvoiceNumbers = new Set<string>()
        const invoicedSOIds = new Set<string>()
        const invoicedSONumbers = new Set<string>()

        // Pass 1: Identify all Invoices (and their linked Sales Orders)
        ;(invoicesPayload.documents || []).forEach((inv: any) => {
          if (!inv) return
          if (inv.id) processedInvoiceIds.add(String(inv.id).toLowerCase())
          if (inv.zohoId) processedInvoiceIds.add(String(inv.zohoId).toLowerCase())
          if (inv.invoiceNumber) processedInvoiceNumbers.add(String(inv.invoiceNumber).toLowerCase().trim())
          if (inv.invoiceNumberFull) processedInvoiceNumbers.add(String(inv.invoiceNumberFull).toLowerCase().trim())
          
          const linkedSOId = inv.linkedSalesOrderId || inv.salesOrderId
          const linkedSONum = inv.linkedSalesOrderNumber || inv.salesOrderNumber
          if (linkedSOId) invoicedSOIds.add(String(linkedSOId).toLowerCase())
          if (linkedSONum) invoicedSONumbers.add(String(linkedSONum).toLowerCase().trim())
        })

        const rawDocs = combinedDocuments
        const countedDocs: any[] = []

        rawDocs.forEach((doc: any) => {
          let spName = (doc.salesperson || "").toUpperCase()
          const docType = doc.type || 'Invoice'

          // If no salesperson, fall back to account owner ID matching
          let matchedRep: any = null
          if (spName) {
            if (spName.includes("PAUL") && (spName.includes("GENCUSKI") || spName.includes("GENKUSKI"))) return
            matchedRep = getMatchedRep(spName)
          }
          // Fallback: match by account owner ID when salesperson is missing
          if (!matchedRep && doc.accountOwnerId) {
            matchedRep = Object.values(repsMap).find((r: any) => r.id === doc.accountOwnerId) || null
          }
          if (!matchedRep && !spName) return // truly unattributable — skip

          const amount = Number(doc.amount || 0)
          const profit = Number(doc.profit || 0)
          const deadCostNoVig = Number(doc.deadCostNoVig || 0)
          const deadCostSubjectToVig = Number(doc.deadCostSubjectToVig || 0)

          // --- 1. ESTIMATES / QUOTES (48 Hours active on board or until SO) ---
          if (docType === 'Quote') {
            const quoteDate = new Date(doc.date)
            const ageHours = (today.getTime() - quoteDate.getTime()) / (1000 * 3600)
            const isConvertedToSO = doc.isConvertedToSO || false
            
            // Estimates only last for 48 hours. If unconverted and <= 48h, count as active estimate subtotal.
            // If converted after 48h (or anytime), the converted SO or Invoice will represent its subtotal.
            if (!isConvertedToSO && ageHours >= 0 && ageHours <= 48) {
              if (matchedRep) {
                matchedRep.activePipeline.estimateCount += 1
                matchedRep.activePipeline.estimateAmount += amount
                matchedRep.subtotals.estimates += amount
                matchedRep.subtotals.estimatesCount += 1
                matchedRep.subtotals.total += amount
              }
              teamSubtotals.estimates += amount
              teamSubtotals.estimatesCount += 1
              teamSubtotals.total += amount

              const saleDate = doc.date ? doc.date.split('T')[0] : ''
              if (saleDate) {
                countedDocs.push(doc)
                const inCurrentWeek = weekDays.includes(saleDate)
                const isMTD = quoteDate >= firstDayOfMonth && quoteDate <= lastDayOfMonth
                const isYTD = quoteDate.getFullYear() === currentYear

                if (matchedRep) {
                  if (inCurrentWeek) {
                    matchedRep.weekly.estimatesSubtotal += amount
                    matchedRep.weekly.estimatesCount += 1
                    matchedRep.weekly.invoices.push({
                      id: doc.id,
                      zohoId: doc.zohoId,
                      date: saleDate,
                      customer: doc.accountName,
                      amount,
                      profit,
                      deadCostNoVig,
                      deadCostSubjectToVig,
                      commission: 0,
                      invoiceNumber: doc.invoiceNumber,
                      type: 'Quote',
                      status: doc.status || 'Draft'
                    })
                    teamWeekly.estimatesSubtotal += amount
                  }
                  if (isMTD) {
                    matchedRep.mtd.estimatesSubtotal += amount
                    matchedRep.mtd.estimatesCount += 1
                    matchedRep.mtd.invoices.push({
                      id: doc.id,
                      zohoId: doc.zohoId,
                      date: saleDate,
                      customer: doc.accountName,
                      amount,
                      profit,
                      deadCostNoVig,
                      deadCostSubjectToVig,
                      commission: 0,
                      invoiceNumber: doc.invoiceNumber,
                      type: 'Quote',
                      status: doc.status || 'Draft'
                    })
                  }
                  if (isYTD) {
                    matchedRep.ytd.estimatesSubtotal += amount
                    matchedRep.ytd.estimatesCount += 1
                    matchedRep.ytd.invoices.push({
                      id: doc.id,
                      zohoId: doc.zohoId,
                      date: saleDate,
                      customer: doc.accountName,
                      amount,
                      profit,
                      deadCostNoVig,
                      deadCostSubjectToVig,
                      commission: 0,
                      invoiceNumber: doc.invoiceNumber,
                      type: 'Quote',
                      status: doc.status || 'Draft'
                    })
                  }
                }
              }
            }
            return
          }

          // --- 2. SALES ORDERS for Active Pipeline (Uninvoiced SOs) ---
          let isAlreadyAccountedByInvoice = false
          if (docType === 'SalesOrder') {
            const soStatus = (doc.status || '').toLowerCase().trim()
            const isClosedOrVoid = soStatus === 'closed' || soStatus === 'void' || soStatus === 'cancelled'
            const isLinkedToInv = doc.isLinkedToInvoice || !!(doc.linkedInvoiceId || doc.linkedInvoiceNumber) || soStatus === 'invoiced'
            
            const soId = String(doc.zohoId || doc.id || '').toLowerCase()
            const soNum = String(doc.salesOrderNumber || doc.invoiceNumber || '').toLowerCase().trim()
            const linkedInvId = String(doc.linkedInvoiceId || '').toLowerCase()
            const linkedInvNum = String(doc.linkedInvoiceNumber || '').toLowerCase().trim()

            if (soId && invoicedSOIds.has(soId)) isAlreadyAccountedByInvoice = true
            if (soNum && invoicedSONumbers.has(soNum)) isAlreadyAccountedByInvoice = true
            if (linkedInvId && processedInvoiceIds.has(linkedInvId)) isAlreadyAccountedByInvoice = true
            if (linkedInvNum && processedInvoiceNumbers.has(linkedInvNum)) isAlreadyAccountedByInvoice = true
            if (isLinkedToInv) isAlreadyAccountedByInvoice = true

            // Only count open, uninvoiced Sales Orders in Active Pipeline badge and SO subtotals
            if (!isAlreadyAccountedByInvoice && !isClosedOrVoid) {
              if (matchedRep) {
                matchedRep.activePipeline.salesOrderCount += 1
                matchedRep.activePipeline.salesOrderAmount += amount
                matchedRep.subtotals.salesOrders += amount
                matchedRep.subtotals.salesOrdersCount += 1
                matchedRep.subtotals.total += amount
              }
              teamSubtotals.salesOrders += amount
              teamSubtotals.salesOrdersCount += 1
              teamSubtotals.total += amount
            }
          }

          // --- 3. INVOICES (Subtotals for invoices of all statuses) ---
          if (docType === 'Invoice') {
            const st = (doc.status || 'draft').toLowerCase().trim()
            let statusCategory = 'other'
            if (st === 'paid') statusCategory = 'paid'
            else if (st === 'open' || st === 'sent' || st === 'unpaid') statusCategory = 'open'
            else if (st === 'overdue') statusCategory = 'overdue'
            else if (st === 'draft') statusCategory = 'draft'
            else if (st === 'void' || st === 'voided' || st === 'cancelled') statusCategory = 'void'

            if (matchedRep) {
              matchedRep.subtotals.invoices += amount
              matchedRep.subtotals.invoicesCount += 1
              matchedRep.subtotals.total += amount
              if ((matchedRep.subtotals.invoicesByStatus as any)[statusCategory] !== undefined) {
                (matchedRep.subtotals.invoicesByStatus as any)[statusCategory] += amount
              }
            }
            teamSubtotals.invoices += amount
            teamSubtotals.invoicesCount += 1
            teamSubtotals.total += amount
          }

          // Deduplication: if Sales Order is already invoiced, invoice handles financial grid
          if (docType === 'SalesOrder' && isAlreadyAccountedByInvoice) {
            return
          }

          const saleDate = doc.date ? doc.date.split('T')[0] : ''
          if (!saleDate) return

          countedDocs.push(doc)

          const invDateObj = new Date(saleDate)

          const isPaid = doc.isPaid || false
          const isSameDayPaid = doc.isSameDayPaid || false
          // Use structured commission data if available, otherwise fall back to raw number
          const commObj = typeof doc.commission === 'object' && doc.commission !== null ? doc.commission : null
          const fullComm = commObj ? (commObj.total || 0) + (commObj.future || 0) : Number(doc.commission || 0)

          const isSinglePayment = matchedRep?.payoutStructure === 'single_payment'
          let commissionEarned = 0
          if (commObj) {
            commissionEarned = commObj.total || 0
          } else if (isSinglePayment) {
            commissionEarned = (isPaid || isSameDayPaid) ? fullComm : 0
          } else {
            commissionEarned = fullComm * 0.5
            if (isPaid || isSameDayPaid) {
              commissionEarned = fullComm
            }
          }

          const inCurrentWeek = weekDays.includes(saleDate)
          const isMTD = invDateObj >= firstDayOfMonth && invDateObj <= lastDayOfMonth
          const isLastMonth = invDateObj >= firstDayOfLastMonth && invDateObj <= lastDayOfLastMonth
          const isYTD = invDateObj.getFullYear() === currentYear

          if (matchedRep) {
            // 1. Current Week (Monday - Friday)
            if (inCurrentWeek) {
              const dayIdx = weekDays.indexOf(saleDate)
              if (dayIdx >= 0 && dayIdx < 5) {
                matchedRep.weekly.sales[dayIdx] += amount
                matchedRep.weekly.profit[dayIdx] += profit
              }
              matchedRep.weekly.totalSales += amount
              matchedRep.weekly.totalProfit += profit
              matchedRep.weekly.deadCostNoVig += deadCostNoVig
              matchedRep.weekly.deadCostSubjectToVig += deadCostSubjectToVig
              matchedRep.weekly.commission += commissionEarned
              matchedRep.weekly.dealsClosed += 1

              if (docType === 'SalesOrder') {
                matchedRep.weekly.salesOrdersSubtotal += amount
                matchedRep.weekly.salesOrdersCount += 1
                teamWeekly.salesOrdersSubtotal += amount
              } else if (docType === 'Invoice') {
                matchedRep.weekly.invoicesSubtotal += amount
                matchedRep.weekly.invoicesCount += 1
                teamWeekly.invoicesSubtotal += amount
              }

              matchedRep.weekly.invoices.push({ 
                id: doc.id, 
                zohoId: doc.zohoId,
                date: saleDate, 
                customer: doc.accountName, 
                amount, 
                profit, 
                deadCostNoVig,
                deadCostSubjectToVig,
                commission: commissionEarned, 
                invoiceNumber: doc.invoiceNumber,
                type: docType,
                status: doc.status || 'Draft'
              })

              teamWeekly.sales += amount
              teamWeekly.profit += profit
              teamWeekly.deadCostNoVig += deadCostNoVig
              teamWeekly.deadCostSubjectToVig += deadCostSubjectToVig
              teamWeekly.commission += commissionEarned
            }

            // 2. Last Month Final & Pace
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

            // 3. Month To Date (MTD)
            if (isMTD) {
              matchedRep.mtd.sales += amount
              matchedRep.mtd.profit += profit
              matchedRep.mtd.deadCostNoVig += deadCostNoVig
              matchedRep.mtd.deadCostSubjectToVig += deadCostSubjectToVig
              matchedRep.mtd.commission += commissionEarned
              matchedRep.mtd.dealsClosed += 1

              if (docType === 'SalesOrder') {
                matchedRep.mtd.salesOrdersSubtotal += amount
                matchedRep.mtd.salesOrdersCount += 1
              } else if (docType === 'Invoice') {
                matchedRep.mtd.invoicesSubtotal += amount
                matchedRep.mtd.invoicesCount += 1
              }

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
                invoiceNumber: doc.invoiceNumber,
                type: docType,
                status: doc.status || 'Draft'
              })
            }

            // 4. Year To Date (YTD)
            if (isYTD) {
              matchedRep.ytd.sales += amount
              matchedRep.ytd.profit += profit
              matchedRep.ytd.deadCostNoVig += deadCostNoVig
              matchedRep.ytd.deadCostSubjectToVig += deadCostSubjectToVig
              matchedRep.ytd.commission += commissionEarned
              matchedRep.ytd.dealsClosed += 1

              if (docType === 'SalesOrder') {
                matchedRep.ytd.salesOrdersSubtotal += amount
                matchedRep.ytd.salesOrdersCount += 1
              } else if (docType === 'Invoice') {
                matchedRep.ytd.invoicesSubtotal += amount
                matchedRep.ytd.invoicesCount += 1
              }

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
                invoiceNumber: doc.invoiceNumber,
                type: docType,
                status: doc.status || 'Draft'
              })
            }
          }
        })

        const computedBoardData = {
          reps: Object.values(repsMap),
          teamWeekly,
          teamSubtotals,
          currentWorkdayIndex,
          repOverdueMap,
          totalOverdueBalance,
          totalOverdueCount,
          maxSystemOverdueDays,
          rawInvoices: rawDocs.filter((d: any) => d.type === 'Invoice'),
          rawSalesOrders: rawDocs.filter((d: any) => d.type === 'SalesOrder'),
          rawQuotes: rawDocs.filter((d: any) => d.type === 'Quote'),
          rawDocuments: countedDocs,
          weekDays
        }

        try {
          if (typeof window !== "undefined") {
            localStorage.setItem("tv_salesboard_cache", JSON.stringify(computedBoardData))
          }
        } catch (e) {
          console.warn("Failed to cache TV salesboard data:", e)
        }

        setData(computedBoardData)

      } catch (err) {
        console.error("Sales Board Error:", err)
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
