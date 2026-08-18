import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useProductModal } from "@/components/ProductModalProvider"
import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import { GeofenceMonitor, type MonitorStatus } from "@/lib/geofence-monitor"
import { useCampaignProgress } from "@/components/CampaignProgressProvider"

export function useGlobalTopBarData() {
  const router = useRouter()
  const { showProduct } = useProductModal()
  const { zohoContext: currentUser } = useZoho()
  const { preferences, updatePreferences } = usePreferences()
  const { state: campaignState, cancel: cancelCampaign, setShowModal: setCampaignModalOpen } = useCampaignProgress()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [showTaskDrawer, setShowTaskDrawer] = useState(false)
  const [taskDrawerTab, setTaskDrawerTab] = useState<"due" | "all" | "completed">("due")

  const [topBarTasks, setTopBarTasks] = useState<any[]>([])

  const fetchTopBarTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/get-tasks")
      const data = await res.json()
      if (data.tasks) {
        setTopBarTasks(data.tasks)
      }
    } catch (e) {
      console.error("Failed to fetch topbar tasks", e)
    }
  }, [])

  useEffect(() => {
    fetchTopBarTasks()
    const handleTaskUpdated = () => fetchTopBarTasks()
    window.addEventListener("task-updated", handleTaskUpdated)
    return () => window.removeEventListener("task-updated", handleTaskUpdated)
  }, [fetchTopBarTasks])

  const searchRef = useRef<HTMLDivElement>(null)

  const [timeEntry, setTimeEntry] = useState<any>(null)
  const timeEntryRef = useRef<any>(null)
  useEffect(() => { timeEntryRef.current = timeEntry }, [timeEntry])
  const [geoStatus, setGeoStatus] = useState<{ status: string; location?: string } | null>(null)
  const [clockLoading, setClockLoading] = useState(false)
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus>('idle')
  const [autoClockToast, setAutoClockToast] = useState<string | null>(null)
  const [showClockInPrompt, setShowClockInPrompt] = useState(false)
  const clockPromptDismissed = useRef(false)
  const timeEntryLoaded = useRef(false)

  // ―― Stats Strip Data ――
  const [stripStats, setStripStats] = useState<{
    weeklySales: number; mtdSales: number; mtdProfit: number;
    mtdCommission: number; pipeline: number; overdue: number;
  } | null>(null)

  const fetchStripStats = useCallback(async () => {
    try {
      const res = await fetch("/api/zoho-invoices")
      const json = await res.json()
      if (!json.invoices) return
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      const dow = now.getDay()
      const mondayOff = dow === 0 ? -6 : 1 - dow
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOff)
      monday.setHours(0,0,0,0)
      const friday = new Date(monday)
      friday.setDate(monday.getDate() + 4)
      friday.setHours(23,59,59,999)

      let ws = 0, ms = 0, mp = 0, mc = 0, pv = 0, ov = 0
      for (const inv of json.invoices) {
        const rep = (inv.salesorder_salesperson_name || inv.salesperson_name || "").toUpperCase()
        if (rep.includes("PAUL") && (rep.includes("GENCUSKI") || rep.includes("GENKUSKI"))) continue
        const amt = parseFloat(inv.sub_total || inv.total || "0")
        const profit = parseFloat(inv.cf_profit_unformatted || "0")
        const comm = parseFloat(inv.cf_commision_amount_unformatted || "0")
        const d = new Date(inv.salesorder_date || inv.date || "")
        const status = (inv.status || "").toLowerCase()
        const balance = parseFloat(inv.balance || "0")
        if (d >= monday && d <= friday) ws += amt
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          ms += amt; mp += profit; mc += comm
        }
        if (status !== "paid" && status !== "void" && status !== "draft" && balance > 0) pv += balance
        if (status === "overdue" || (inv.due_date && new Date(inv.due_date) < now && balance > 0 && status !== "paid" && status !== "void" && status !== "draft")) ov += balance
      }
      setStripStats({ weeklySales: Math.round(ws), mtdSales: Math.round(ms), mtdProfit: Math.round(mp), mtdCommission: Math.round(mc), pipeline: Math.round(pv), overdue: Math.round(ov) })
    } catch {}
  }, [])

  useEffect(() => {
    fetchStripStats()
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchStripStats() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchStripStats])

  useEffect(() => {
    if (!currentUser?.id) return
    const fetchTime = async () => {
      try {
        const res = await fetch(`/api/timeclock/get-entries?userId=${currentUser.id}&email=${encodeURIComponent(currentUser.email || '')}`, { cache: 'no-store' })
        const data = await res.json()
        if (data.success && data.entries && data.entries.length > 0) {
          const now = new Date()
          const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' })
          const parts = formatter.formatToParts(now)
          const phoenixDate = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`
          if (data.entries[0].date === phoenixDate) {
            setTimeEntry(data.entries[0])
          }
        }
      } catch (e) {}
    }
    fetchTime()
  }, [currentUser?.id, currentUser?.email])

  const checkClockInPrompt = useCallback(() => {
    if (clockPromptDismissed.current) return
    if (typeof window !== 'undefined' && sessionStorage.getItem('clockInPromptDismissed')) {
      clockPromptDismissed.current = true
      return
    }
    const currentEntry = timeEntryRef.current
    const notClockedIn = !currentEntry || currentEntry.manualClockOut
    setShowClockInPrompt(notClockedIn)
  }, [])

  useEffect(() => {
    if (!currentUser?.id) return
    const timer = setTimeout(() => {
      timeEntryLoaded.current = true
      checkClockInPrompt()
    }, 3000)
    return () => clearTimeout(timer)
  }, [currentUser?.id, checkClockInPrompt])

  useEffect(() => {
    if (timeEntryLoaded.current) checkClockInPrompt()
  }, [timeEntry, checkClockInPrompt])

  const dismissClockInPrompt = useCallback(() => {
    setShowClockInPrompt(false)
    clockPromptDismissed.current = true
    if (typeof window !== 'undefined') sessionStorage.setItem('clockInPromptDismissed', '1')
  }, [])

  const handleToggleClock = useCallback(async () => {
    if (!currentUser?.id || clockLoading) return
    setClockLoading(true)
    const action = (!timeEntry || timeEntry.manualClockOut) ? "clockIn" : "clockOut"
    
    let latitude: number | null = null
    let longitude: number | null = null
    let accuracy: number | null = null
    
    if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 10000, maximumAge: 30000
          })
        })
        latitude = pos.coords.latitude
        longitude = pos.coords.longitude
        accuracy = pos.coords.accuracy
      } catch {
        latitude = null
      }
    }
    
    try {
      const res = await fetch("/api/timeclock/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: currentUser.id,
          email: currentUser.email,
          action,
          source: 'manual',
          name: currentUser.name || currentUser.fullName || "Zoho User",
          latitude,
          longitude,
          accuracy
        })
      })
      const data = await res.json()
      if (data.success) {
        setTimeEntry(data.entry)
        if (data.locationStatus) {
          setGeoStatus({ status: data.locationStatus, location: data.locationName })
          setTimeout(() => setGeoStatus(null), 4000)
        }
      }
    } catch (e) {
      console.error("Timeclock toggle error:", e)
    } finally {
      setClockLoading(false)
      GeofenceMonitor.resetTodayState()
    }
  }, [currentUser, clockLoading, timeEntry])

  const handlePromptClockIn = useCallback(async () => {
    setShowClockInPrompt(false)
    clockPromptDismissed.current = true
    if (typeof window !== 'undefined') sessionStorage.setItem('clockInPromptDismissed', '1')
    await handleToggleClock()
  }, [handleToggleClock])

  useEffect(() => {
    if (!currentUser?.id) return

    const unsubStatus = GeofenceMonitor.onStatusChange(setMonitorStatus)

    const unsubEvent = GeofenceMonitor.onEvent((event) => {
      if (event.entry) setTimeEntry(event.entry)

      const msg = event.action === 'clockIn'
        ? `Auto clocked in -- ${event.fenceName || 'On-Site'}`
        : `Auto clocked out -- ${event.fenceName || 'Off-Site'}`
      setAutoClockToast(msg)
      setTimeout(() => setAutoClockToast(null), 5000)
    })

    GeofenceMonitor.start(
      currentUser.id,
      currentUser.email || '',
      currentUser.name || currentUser.fullName || 'Zoho User'
    )

    return () => {
      unsubStatus()
      unsubEvent()
    }
  }, [currentUser?.id, currentUser?.email, currentUser?.name, currentUser?.fullName])

  const calculateHours = useCallback((entry: any) => {
    if (!entry) return "0.0"
    const start = new Date(entry.manualClockIn || entry.clockIn)
    let end: Date
    if (entry.manualClockOut) {
      end = new Date(entry.manualClockOut)
    } else if (entry.clockOut) {
      end = new Date(entry.clockOut)
    } else {
      end = new Date(entry.lastActivity)
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

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim().length < 1) {
        setResults(null)
        setLoading(false)
        return
      }
      
      setLoading(true)
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        if (data.success) {
          setResults(data.results)
          setShowResults(true)
        }
      } catch (e) {
        console.error("Global search failed:", e)
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => clearTimeout(delayDebounceFn)
  }, [query])

  const handleResultClick = useCallback((type: string, item: any) => {
    setShowResults(false)
    setQuery("")
    
    switch(type) {
      case "accounts":
        router.push(`/account?id=${item.zohoId}`)
        break
      case "invoices":
        router.push(`/account?id=${item.accountZohoId || item.accountId}&invoiceId=${item.zohoId || item.id}`)
        break
      case "deals":
        router.push(`/account?id=${item.accountZohoId || item.accountId}`)
        break
      case "products":
        showProduct(item.name, item)
        break
      default:
        break
    }
  }, [router, showProduct])

  return {
    router, currentUser, preferences, updatePreferences,
    campaignState, cancelCampaign, setCampaignModalOpen,
    
    query, setQuery, results, loading, showResults, setShowResults, isMobile,
    showAddTaskModal, setShowAddTaskModal, showTaskDrawer, setShowTaskDrawer, taskDrawerTab, setTaskDrawerTab, topBarTasks,
    searchRef, timeEntry, geoStatus, clockLoading, monitorStatus,
    autoClockToast, showClockInPrompt, stripStats,
    
    fetchTopBarTasks, handleResultClick, calculateHours, handleToggleClock, dismissClockInPrompt, handlePromptClockIn
  }
}
