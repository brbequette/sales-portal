"use client"

import { useState, useEffect, useRef } from "react"
import { FiSearch, FiPlus, FiUserPlus, FiCheckSquare, FiFileText, FiDollarSign, FiBox, FiClock, FiBell } from "react-icons/fi"
import { useRouter } from "next/navigation"
import { useProductModal } from "@/components/ProductModalProvider"
import { NewCustomerModal } from "@/components/NewCustomerModal"
import { useZoho } from "@/components/ZohoProvider"
import { useNotifications } from "@/components/NotificationProvider"

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
  }, [currentUser])

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
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    return Math.max(0, diffHours).toFixed(1)
  }

  const handleToggleClock = async () => {
    if (!currentUser?.id) return
    const action = (!timeEntry || timeEntry.manualClockOut) ? "clockIn" : "clockOut"
    try {
      const res = await fetch("/api/timeclock/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: currentUser.id, 
          action,
          email: currentUser.email,
          name: currentUser.name || currentUser.fullName || "Zoho User"
        })
      })
      const data = await res.json()
      if (data.success) {
        setTimeEntry(data.entry)
      }
    } catch (e) {}
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
        // For now, route to account, later handle popup if needed
        router.push(`/account?id=${item.zohoId || item.accountId}&invoiceId=${item.zohoId || item.id}`)
        break
      case "deals":
        router.push(`/account?id=${item.accountId}`)
        break
      case "products":
        showProduct(item.name, item)
        break
      default:
        break
    }
  }

  return (
    <div className="bg-[#101113]/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      
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
            className="w-full bg-white/[0.035] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--primary)] focus:bg-white/[0.055] transition-colors"
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
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Invoices & Sales Orders</div>
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
                          <div className="text-sm font-bold text-white truncate">{i.invoiceNumber || i.orderNumber || "Draft"}</div>
                          <div className="text-xs text-neutral-500 truncate">{i.status}</div>
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
        <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.045] overflow-hidden text-xs lg:text-sm h-8 lg:h-9">
          <button
            onClick={handleToggleClock}
            className={`px-3 lg:px-4 h-full font-bold transition-all flex items-center gap-2 border-r border-white/10 ${
              (!timeEntry || timeEntry.manualClockOut)
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" 
                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
            }`}
          >
            <FiClock size={14} /> 
            <span className="hidden sm:inline">{(!timeEntry || timeEntry.manualClockOut) ? "Clock In" : "Clock Out"}</span>
          </button>
          
          {timeEntry && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 h-full border-r border-white/10 bg-black/20" title={timeEntry.active ? "Currently Active" : "Inactive for > 10m"}>
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
            <div className="absolute top-full right-0 mt-2 w-80 bg-[#151618] border border-white/10 rounded-xl shadow-[0_22px_70px_rgba(0,0,0,0.45)] overflow-hidden z-50 flex flex-col max-h-[70vh]">
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
          className="bg-white/[0.045] hover:bg-white/[0.075] text-neutral-300 hover:text-white font-bold px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm transition-all flex items-center gap-2 border border-white/10"
        >
          <FiBox size={14} /> <span className="hidden sm:inline">Catalog Lookup</span>
        </button>
        <button
          onClick={() => router.push("/tasks/new")}
          className="bg-white/[0.045] hover:bg-white/[0.075] text-neutral-300 hover:text-white font-bold px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm transition-all flex items-center gap-2 border border-white/10"
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
  )
}
