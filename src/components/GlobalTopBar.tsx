"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { FiSearch, FiPlus, FiUserPlus, FiCheckSquare, FiFileText, FiDollarSign, FiBox, FiClock, FiBell, FiTrendingUp, FiAlertCircle } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { useProductModal } from "@/components/ProductModalProvider"
import { NewCustomerModal } from "@/components/NewCustomerModal"
import { useZoho } from "@/components/ZohoProvider"
import { useNotifications } from "@/components/NotificationProvider"
import { GeofenceMonitor, type MonitorStatus } from "@/lib/geofence-monitor"

export function GlobalTopBar() {
  const router = useRouter()
  const { showProduct } = useProductModal()
  const { zohoContext: currentUser } = useZoho()
  
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const { notifications, unreadCount, markAsRead, markAllAsRead, requestPermission, permission } = useNotifications()

  const searchRef = useRef<HTMLDivElement>(null)

  const [timeEntry, setTimeEntry] = useState<any>(null)
  const [geoStatus, setGeoStatus] = useState<{ status: string; location?: string } | null>(null)
  const [clockLoading, setClockLoading] = useState(false)
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus>('idle')
  const [autoClockToast, setAutoClockToast] = useState<string | null>(null)
  const [showClockInPrompt, setShowClockInPrompt] = useState(false)
  const clockPromptDismissed = useRef(false)
  const timeEntryLoaded = useRef(false)

  // ── Stats Strip Data ──
  const [stripStats, setStripStats] = useState<{
    weeklySales: number; mtdSales: number; mtdProfit: number;
    mtdCommission: number; pipeline: number; overdue: number;
  } | null>(null)

  useEffect(() => {
    fetchStripStats()
    // Refresh when tab becomes visible (instead of polling every 5 min)
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchStripStats() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  async function fetchStripStats() {
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
  }
  
  useEffect(() => {
    if (!currentUser?.id) return
    const fetchTime = async () => {
      try {
        const res = await fetch(`/api/timeclock/get-entries?userId=${currentUser.id}&email=${encodeURIComponent(currentUser.email || '')}`, { cache: 'no-store' })
        const data = await res.json()
        if (data.success && data.entries && data.entries.length > 0) {
          // Check if the top entry is today
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
    const interval = setInterval(fetchTime, 60000)
    return () => clearInterval(interval)
  }, [currentUser?.id])

  // ── Activity-based Clock-In Prompt ──
  // If user is logged in, data has loaded, and they're NOT clocked in — show prompt on first interaction
  useEffect(() => {
    if (!currentUser?.id) return
    // Wait for timeclock data to load before deciding
    const timer = setTimeout(() => {
      timeEntryLoaded.current = true
      checkClockInPrompt()
    }, 3000) // Give 3s for timeclock fetch to complete
    return () => clearTimeout(timer)
  }, [currentUser?.id])

  // Re-check when timeEntry changes
  useEffect(() => {
    if (timeEntryLoaded.current) checkClockInPrompt()
  }, [timeEntry])

  function checkClockInPrompt() {
    if (clockPromptDismissed.current) return
    // Check sessionStorage for dismissal
    if (typeof window !== 'undefined' && sessionStorage.getItem('clockInPromptDismissed')) {
      clockPromptDismissed.current = true
      return
    }
    const notClockedIn = !timeEntry || timeEntry.manualClockOut
    setShowClockInPrompt(notClockedIn)
  }

  function dismissClockInPrompt() {
    setShowClockInPrompt(false)
    clockPromptDismissed.current = true
    if (typeof window !== 'undefined') sessionStorage.setItem('clockInPromptDismissed', '1')
  }

  async function handlePromptClockIn() {
    setShowClockInPrompt(false)
    clockPromptDismissed.current = true
    if (typeof window !== 'undefined') sessionStorage.setItem('clockInPromptDismissed', '1')
    await handleToggleClock()
  }

  // ── Auto-start Geofence Monitor ──
  useEffect(() => {
    if (!currentUser?.id) return

    // Subscribe to status changes
    const unsubStatus = GeofenceMonitor.onStatusChange(setMonitorStatus)

    // Subscribe to auto-clock events
    const unsubEvent = GeofenceMonitor.onEvent((event) => {
      // Update the timeclock widget state
      if (event.entry) setTimeEntry(event.entry)

      // Show auto-clock toast
      const msg = event.action === 'clockIn'
        ? `📍 Auto clocked in — ${event.fenceName || 'On-Site'}`
        : `👋 Auto clocked out — ${event.fenceName || 'Off-Site'}`
      setAutoClockToast(msg)
      setTimeout(() => setAutoClockToast(null), 5000)
    })

    // Start the monitor
    GeofenceMonitor.start(
      currentUser.id,
      currentUser.email || '',
      currentUser.name || currentUser.fullName || 'Zoho User'
    )

    return () => {
      unsubStatus()
      unsubEvent()
      // Don't stop the monitor on unmount — it persists as singleton
    }
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
      end = new Date(entry.lastActivity)
    }
    // Cap at now if active
    const now = new Date()
    if (end > now) end = now

    // Subtract inactivity periods
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
    
    // Capture GPS at clock-in/out moment
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
        // Permission denied or unavailable — proceed without GPS
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
        // Show location feedback briefly
        if (data.locationStatus) {
          setGeoStatus({ status: data.locationStatus, location: data.locationName })
          setTimeout(() => setGeoStatus(null), 4000)
        }
      }
    } catch (e) {
      console.error("Timeclock toggle error:", e)
    } finally {
      setClockLoading(false)
      // Reset geofence monitor state so it won't conflict with manual action
      GeofenceMonitor.resetTodayState()
    }
  }

  useEffect(() => {
    // Close dropdown on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
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
    }, 400) // 400ms debounce

    return () => clearTimeout(delayDebounceFn)
  }, [query])

  const handleResultClick = (type: string, item: any) => {
    setShowResults(false)
    setQuery("")
    
    switch(type) {
      case "accounts":
        router.push(`/account?id=${item.zohoId}`)
        break
      case "invoices":
        // Route to the account page using the account's zohoId, with invoiceId for auto-open
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
  }

  return (
    <>
    <div className="glass-panel border-x-0 border-t-0 px-4 py-3 flex items-center justify-between sticky top-0 z-40 rounded-none shadow-lg">
      
      {/* Left side: Search */}
      <div className="flex-1 max-w-2xl relative" ref={searchRef}>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
          <input 
            type="text" 
            placeholder="Search accounts, invoices, products, quotes..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (results) setShowResults(true) }}
            className="w-full bg-white/[0.035] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--primary)] focus:bg-white/[0.055] transition-colors"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
          )}
        </div>

        {/* Dropdown Results */}
        {showResults && results && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#151618] border border-white/10 rounded-xl shadow-[0_22px_70px_rgba(0,0,0,0.45)] overflow-hidden max-h-[80vh] overflow-y-auto z-50">
            {Object.keys(results).every(k => results[k].length === 0) ? (
              <div className="p-4 text-center text-sm text-neutral-500">No results found for &quot;{query}&quot;</div>
            ) : (
              <div className="py-2">
                {results.accounts?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Accounts</div>
                    {results.accounts.map((a: any) => (
                      <div 
                        key={a.id} 
                        onClick={() => handleResultClick("accounts", a)}
                        className="px-4 py-2 hover:bg-white/[0.055] cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                          <FiUserPlus />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{a.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{a.zohoId} - {a.industry || "No Industry"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {results.invoices?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Invoices, Orders & Quotes</div>
                    {results.invoices.map((i: any) => (
                      <div 
                        key={i.id} 
                        onClick={() => handleResultClick("invoices", i)}
                        className="px-4 py-2 hover:bg-white/[0.055] cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                          <FiFileText />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{i.invoiceNumber || i.items?.invoiceNumber || i.items?.invoice_number || i.items?.estimate_number || i.items?.salesorder_number || "Draft"}</div>
                          <div className="text-xs text-neutral-500 truncate">{i.docType ? `${i.docType} · ` : ""}{i.status}{i.accountName ? ` · ${i.accountName}` : ""}</div>
                        </div>
                        <div className="text-sm font-bold text-emerald-400">${parseFloat(i.amount).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {results.deals?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Deals & Quotes</div>
                    {results.deals.map((d: any) => (
                      <div 
                        key={d.id} 
                        onClick={() => handleResultClick("deals", d)}
                        className="px-4 py-2 hover:bg-white/[0.055] cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                          <FiDollarSign />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{d.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{d.stage}</div>
                        </div>
                        <div className="text-sm font-bold text-emerald-400">${parseFloat(d.amount).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {results.products?.length > 0 && (
                  <div className="mb-0">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Products</div>
                    {results.products.map((p: any) => (
                      <div 
                        key={p.id || p.sku} 
                        onClick={() => handleResultClick("products", p)}
                        className="px-4 py-2 hover:bg-white/[0.055] cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                          <FiBox />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{p.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{p.sku}</div>
                        </div>
                        <div className="text-sm font-bold text-white">${parseFloat(p.price || 0).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side: Quick Add Actions */}
      <div className="flex items-center gap-2 lg:gap-3 ml-4 shrink-0">
        
        {/* Timeclock Toggle Widget */}
        <div className="relative flex items-center rounded-lg border border-white/10 bg-white/[0.045] overflow-hidden text-xs lg:text-sm h-10 lg:h-9">
          {/* Geofence monitor indicator */}
          {monitorStatus === 'monitoring' && (
            <div className="flex items-center px-2 h-full border-r border-white/10 bg-blue-500/10" title="📍 Auto-tracking active — GPS monitoring for clock-in/out">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
            </div>
          )}
          {monitorStatus === 'denied' && (
            <div className="flex items-center px-2 h-full border-r border-white/10 bg-red-500/5" title="GPS permission denied — auto-tracking disabled">
              <div className="w-2 h-2 rounded-full bg-red-500/60" />
            </div>
          )}
          <button
            onClick={handleToggleClock}
            disabled={clockLoading}
            className={`px-3 lg:px-4 h-full font-bold transition-all flex items-center gap-2 border-r border-white/10 ${
              clockLoading
                ? "bg-neutral-700/30 text-neutral-500 cursor-wait"
                : (!timeEntry || timeEntry.manualClockOut)
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" 
                  : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
            }`}
          >
            <FiClock size={14} className={clockLoading ? "animate-spin" : ""} /> 
            <span className="hidden sm:inline">
              {clockLoading ? "Locating..." : (!timeEntry || timeEntry.manualClockOut) ? "Clock In" : "Clock Out"}
            </span>
          </button>
          
          {timeEntry && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 h-full border-r border-white/10 bg-black/20" title={timeEntry.active ? "Currently Active" : "Inactive for > 20m"}>
              <span className="text-[10px] uppercase font-bold text-neutral-400">
                {timeEntry.active ? "Active" : "Away"}
              </span>
              <div className={`w-2 h-2 rounded-full ${timeEntry.active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"}`} />
            </div>
          )}

          <button 
            onClick={() => router.push("/timeclock")}
            className="px-3 lg:px-4 h-full hover:bg-white/[0.075] text-neutral-300 hover:text-white transition-all font-mono"
            title="View Timeclock"
          >
            {calculateHours(timeEntry)}h
          </button>

          {/* Geolocation status toast */}
          {geoStatus && (
            <div className={`absolute -bottom-9 left-0 right-0 mx-auto w-max px-3 py-1.5 rounded-md text-[10px] font-bold shadow-lg border animate-pulse z-50 ${
              geoStatus.status === 'VERIFIED'
                ? 'bg-emerald-900/90 text-emerald-300 border-emerald-500/30'
                : geoStatus.status === 'OUT_OF_RANGE'
                  ? 'bg-amber-900/90 text-amber-300 border-amber-500/30'
                  : 'bg-neutral-800/90 text-neutral-400 border-neutral-600/30'
            }`}>
              {geoStatus.status === 'VERIFIED' && `📍 ${geoStatus.location || 'On-Site'}`}
              {geoStatus.status === 'OUT_OF_RANGE' && '⚠️ Out of Range'}
              {geoStatus.status === 'DENIED' && '🔒 GPS Denied'}
              {geoStatus.status === 'UNAVAILABLE' && '📡 GPS Unavailable'}
            </div>
          )}

          {/* Auto-clock toast */}
          {autoClockToast && (
            <div className="absolute -bottom-9 left-0 right-0 mx-auto w-max px-3 py-1.5 rounded-md text-[10px] font-bold shadow-lg border z-50 bg-blue-900/90 text-blue-300 border-blue-500/30 animate-pulse">
              {autoClockToast}
            </div>
          )}
        </div>
        
        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              if (permission === 'default') {
                requestPermission()
              }
              setShowNotifications(!showNotifications)
            }}
            className="relative bg-white/[0.045] hover:bg-white/[0.075] text-neutral-300 hover:text-white font-bold p-2 lg:px-3 lg:py-2 rounded-lg text-xs lg:text-sm transition-all flex items-center justify-center border border-white/10"
          >
            <FiBell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] flex items-center justify-center rounded-full font-bold shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] bg-[#151618] border border-white/10 rounded-xl shadow-[0_22px_70px_rgba(0,0,0,0.45)] overflow-hidden z-50 flex flex-col max-h-[70vh]">
              <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/[0.02]">
                <h3 className="text-sm font-bold text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-[var(--primary)] hover:underline font-bold">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-neutral-500">
                    No notifications yet.
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {notifications.map((n) => (
                      <div 
                        key={n.id} 
                        className={`p-3 text-sm cursor-pointer transition-colors ${n.read ? 'bg-transparent hover:bg-white/[0.02]' : 'bg-blue-500/10 hover:bg-blue-500/20'}`}
                        onClick={() => {
                          if (!n.read) markAsRead(n.id)
                          if (n.url) router.push(n.url)
                          setShowNotifications(false)
                        }}
                      >
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <span className={`font-bold truncate ${n.read ? 'text-neutral-300' : 'text-white'}`}>{n.title}</span>
                          <span className="text-[10px] text-neutral-500 shrink-0 mt-0.5">
                            {new Date(n.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className={`text-xs line-clamp-2 ${n.read ? 'text-neutral-500' : 'text-neutral-300'}`}>
                          {n.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => router.push("/catalog")}
          className="hidden sm:flex bg-white/[0.045] hover:bg-white/[0.075] text-neutral-300 hover:text-white font-bold px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm transition-all items-center gap-2 border border-white/10"
        >
          <FiBox size={14} /> <span className="hidden sm:inline">Catalog Lookup</span>
        </button>
        <button
          onClick={() => router.push("/tasks/new")}
          className="hidden sm:flex bg-white/[0.045] hover:bg-white/[0.075] text-neutral-300 hover:text-white font-bold px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm transition-all items-center gap-2 border border-white/10"
        >
          <FiCheckSquare size={14} /> <span className="hidden sm:inline">Add Task</span>
        </button>
        <button
          onClick={() => setShowAddAccount(true)}
          className="bg-[var(--primary)] hover:brightness-110 text-black font-bold px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm transition-all flex items-center gap-2 whitespace-nowrap"
        >
          <FiUserPlus size={14} /> <span className="hidden sm:inline">Add Account</span>
        </button>
      </div>

      {/* Modals */}
      {showAddAccount && (
        <NewCustomerModal isOpen={showAddAccount} onClose={() => setShowAddAccount(false)} currentUserId={currentUser?.id} />
      )}
    </div>

    {/* ── Persistent Stats Strip ── */}
    {stripStats && (
      <div className="glass-panel border-x-0 border-t-0 px-4 py-1.5 sticky top-[56px] z-[39] rounded-none flex items-center gap-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-4 min-w-max mx-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Weekly</span>
            <span className="text-xs font-black text-white">${stripStats.weeklySales.toLocaleString()}</span>
          </div>
          <div className="w-px h-3.5 bg-white/[0.08]"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">MTD</span>
            <span className="text-xs font-black text-white">${stripStats.mtdSales.toLocaleString()}</span>
          </div>
          <div className="w-px h-3.5 bg-white/[0.08]"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Profit</span>
            <span className="text-xs font-black text-emerald-400">${stripStats.mtdProfit.toLocaleString()}</span>
          </div>
          <div className="w-px h-3.5 bg-white/[0.08]"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Comm</span>
            <span className="text-xs font-black text-purple-400">${stripStats.mtdCommission.toLocaleString()}</span>
          </div>
          <div className="w-px h-3.5 bg-white/[0.08]"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Pipeline</span>
            <span className="text-xs font-black text-sky-400">${stripStats.pipeline.toLocaleString()}</span>
          </div>
          {stripStats.overdue > 0 && (
            <>
              <div className="w-px h-3.5 bg-white/[0.08]"></div>
              <div className="flex items-center gap-1.5">
                <FiAlertCircle size={10} className="text-red-400" />
                <span className="text-[10px] text-red-400/70 font-medium uppercase tracking-wider">Overdue</span>
                <span className="text-xs font-black text-red-400">${stripStats.overdue.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    {/* ── Clock-In Prompt Banner ── */}
    {showClockInPrompt && currentUser?.id && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-[slideUp_0.3s_ease-out]">
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-900/95 to-indigo-900/95 backdrop-blur-xl border border-blue-500/30 rounded-2xl px-5 py-3 shadow-[0_8px_32px_rgba(59,130,246,0.3)] text-white">
          <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <FiClock size={18} className="text-blue-400" />
          </div>
          <div className="text-sm">
            <div className="font-bold">You&apos;re not clocked in</div>
            <div className="text-blue-300/70 text-xs">Clock in to track your hours?</div>
          </div>
          <button
            onClick={handlePromptClockIn}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-emerald-500/20 whitespace-nowrap"
          >
            Clock In
          </button>
          <button
            onClick={dismissClockInPrompt}
            className="text-blue-400/50 hover:text-white text-lg leading-none transition-colors px-1"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    )}
    </>
  )
}
