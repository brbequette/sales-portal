"use client"

import { useCallback, useEffect, useRef, useState, useTransition, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  FiMonitor, FiWifi, FiWifiOff, FiMaximize, FiSearch, FiPhone, FiPhoneCall,
  FiUser, FiMapPin, FiDollarSign, FiClock, FiRefreshCw, FiExternalLink,
  FiChevronRight, FiX, FiActivity, FiLayers, FiAlertCircle
} from "react-icons/fi"
import { DUAL_SCREEN_CHANNEL, type DualScreenMessage, type DualScreenState, isDualScreenMessage } from "@/lib/dual-screen"
import { AccountSecondScreenWorkspace } from "@/components/AccountSecondScreenWorkspace"
import { toast } from "react-hot-toast"

interface AccountSearchResult {
  id: string
  name: string
  billingCity?: string | null
  billingState?: string | null
  balance?: number | null
  phone?: string | null
  contacts?: Array<{
    id: string
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    mobilePhone?: string | null
    email?: string | null
    isPrimary?: boolean
  }>
}

function CommunicatorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Controller & Broadcast Channel Sync
  const sourceId = useRef("")
  const targetControllerId = useRef("")
  const sequence = useRef(0)
  const channel = useRef<BroadcastChannel | null>(null)
  const seen = useRef(new Set<string>())
  const controllerSourceId = useRef("")
  const lastControllerSequence = useRef(0)
  const lastControllerAt = useRef(0)

  const [connected, setConnected] = useState(false)
  const [controllerAccountSuggestion, setControllerAccountSuggestion] = useState<{ id: string; name?: string } | null>(null)

  // Account State
  const initialAccountId = searchParams.get("accountId") || searchParams.get("id") || ""
  const [activeAccountId, setActiveAccountId] = useState<string>(initialAccountId)
  const [account, setAccount] = useState<any>(null)
  const [loadingAccount, setLoadingAccount] = useState<boolean>(false)
  const [accountError, setAccountError] = useState<string>("")

  // Search & Lookup State
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<AccountSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Direct Dialer Keypad Modal
  const [showDialer, setShowDialer] = useState(false)
  const [dialerNumber, setDialerNumber] = useState("")

  // Recent / Calling Queue
  const [recentAccounts, setRecentAccounts] = useState<AccountSearchResult[]>([])
  const [loadingRecents, setLoadingRecents] = useState(false)

  // 1. Post to broadcast channel
  const post = useCallback((type: DualScreenMessage["type"], extra: Partial<DualScreenMessage> = {}) => {
    if (!channel.current) return
    const message: DualScreenMessage = {
      id: crypto.randomUUID(),
      sourceId: sourceId.current,
      sequence: ++sequence.current,
      sentAt: new Date().toISOString(),
      type,
      displayId: sourceId.current,
      controllerId: targetControllerId.current || undefined,
      ...extra
    }
    seen.current.add(message.id)
    channel.current.postMessage(message)
  }, [])

  // 2. Setup BroadcastChannel listener
  useEffect(() => {
    sourceId.current = crypto.randomUUID()
    targetControllerId.current = searchParams.get("controller") || ""
    if (!("BroadcastChannel" in window)) return

    const bc = new BroadcastChannel(DUAL_SCREEN_CHANNEL)
    channel.current = bc

    bc.onmessage = event => {
      const message = event.data
      if (!isDualScreenMessage(message) || message.sourceId === sourceId.current || seen.current.has(message.id)) return
      if (targetControllerId.current && message.sourceId !== targetControllerId.current) return
      if (!targetControllerId.current && (message.type === "CONTROLLER_STATE" || message.type === "CONTROLLER_PING")) {
        targetControllerId.current = message.sourceId
      }
      seen.current.add(message.id)
      if (seen.current.size > 500) seen.current.clear()

      const newController = controllerSourceId.current !== message.sourceId
      if (message.type === "CONTROLLER_STATE" && message.state && (newController || message.sequence > lastControllerSequence.current)) {
        controllerSourceId.current = message.sourceId
        lastControllerSequence.current = message.sequence
        setConnected(true)
        lastControllerAt.current = Date.now()
        post("DISPLAY_ACK", { acknowledgedId: message.id })

        // Check if controller navigated to an account
        const cPath = message.state.controllerPath || ""
        if (cPath.includes("/account")) {
          try {
            const url = new URL(cPath, "http://titan.local")
            const cAccId = url.searchParams.get("id")
            if (cAccId && cAccId !== activeAccountId) {
              // Automatically switch or suggest switch
              setActiveAccountId(prev => {
                if (!prev) return cAccId
                setControllerAccountSuggestion({ id: cAccId, name: message.state?.title })
                return prev
              })
            }
          } catch { /* ignore parse error */ }
        }
      }

      if (message.type === "CONTROLLER_PING") {
        setConnected(true)
        lastControllerAt.current = Date.now()
      }
    }

    post("DISPLAY_READY")
    const heartbeat = window.setInterval(() => {
      post("DISPLAY_HEARTBEAT")
      if (lastControllerAt.current && Date.now() - lastControllerAt.current > 6500) {
        setConnected(false)
      }
    }, 2000)

    const closing = () => post("DISPLAY_CLOSING")
    window.addEventListener("beforeunload", closing)

    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener("beforeunload", closing)
      post("DISPLAY_CLOSING")
      bc.close()
      channel.current = null
    }
  }, [post, searchParams, activeAccountId])

  // 3. Restore last active account from localStorage if none provided
  useEffect(() => {
    if (!activeAccountId) {
      const saved = localStorage.getItem("titan-communicator-active-account-id")
      if (saved) setActiveAccountId(saved)
    }
  }, [activeAccountId])

  // 4. Fetch Account Details whenever activeAccountId changes
  useEffect(() => {
    if (!activeAccountId) {
      setAccount(null)
      return
    }

    let active = true
    setLoadingAccount(true)
    setAccountError("")

    fetch(`/api/get-account-details?id=${encodeURIComponent(activeAccountId)}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error || data.message || "Failed to load account")
        return data.account
      })
      .then(acc => {
        if (!active) return
        setAccount(acc)
        localStorage.setItem("titan-communicator-active-account-id", activeAccountId)
        setControllerAccountSuggestion(null)
      })
      .catch(err => {
        if (!active) return
        setAccountError(err.message || "Could not load account details")
      })
      .finally(() => {
        if (active) setLoadingAccount(false)
      })

    return () => { active = false }
  }, [activeAccountId])

  // 5. Account Search logic with debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/get-accounts?search=${encodeURIComponent(searchQuery.trim())}&limit=12`)
        const data = await res.json()
        if (data.success && Array.isArray(data.accounts)) {
          setSearchResults(data.accounts)
        } else {
          // Fallback to global search
          const gRes = await fetch(`/api/global-search?q=${encodeURIComponent(searchQuery.trim())}`)
          const gData = await gRes.json()
          if (gData.results && Array.isArray(gData.results.accounts)) {
            setSearchResults(gData.results.accounts)
          }
        }
      } catch (err) {
        console.error("Account search error:", err)
      } finally {
        setIsSearching(false)
      }
    }, 250)

    return () => clearTimeout(timeout)
  }, [searchQuery])

  // 6. Fetch Recent Accounts for calling queue
  useEffect(() => {
    setLoadingRecents(true)
    fetch("/api/get-accounts?limit=8&sort=recent")
      .then(async res => {
        const data = await res.json()
        if (data.success && Array.isArray(data.accounts)) {
          setRecentAccounts(data.accounts)
        }
      })
      .catch(err => console.error("Failed to load recents", err))
      .finally(() => setLoadingRecents(false))
  }, [])

  // 7. Click outside search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelectAccount = (accId: string) => {
    setActiveAccountId(accId)
    setShowSearchDropdown(false)
    setSearchQuery("")
    toast.success("Loaded account in Communicator")
  }

  const handleDialerCall = (numberToCall: string) => {
    const clean = numberToCall.replace(/[^0-9+]/g, "")
    if (!clean) {
      toast.error("Please enter a valid phone number")
      return
    }
    window.dispatchEvent(new CustomEvent("inAppDial", { detail: { phone: clean } }))
    setShowDialer(false)
    toast.success(`Dialing ${clean}...`)
  }

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch { /* User gesture restrictions */ }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#07090d] text-white font-sans">
      {/* ─── Top Global Communicator Header & Account Switcher ─── */}
      <header className="flex-none bg-[#0a0d14] border-b border-white/10 px-4 py-2.5 z-50 shadow-md">
        <div className="flex items-center justify-between gap-3">
          
          {/* Left Brand & Connection Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
                <FiPhoneCall className="text-white text-base" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-400">Titan Hub</div>
                <div className="text-sm font-black tracking-tight text-white leading-tight">Sales Communicator</div>
              </div>
            </div>

            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              connected
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}>
              {connected ? <FiWifi className="text-emerald-400" /> : <FiWifiOff />}
              <span>{connected ? "Screen 1 Linked" : "Standalone"}</span>
            </div>
          </div>

          {/* Center Account Lookup Bar */}
          <div ref={searchRef} className="relative flex-1 max-w-xl mx-2">
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  setShowSearchDropdown(true)
                }}
                onFocus={() => setShowSearchDropdown(true)}
                placeholder="Lookup account to call or message (name, phone, contact, city)..."
                className="w-full rounded-xl border border-white/15 bg-black/40 py-2 pl-9 pr-8 text-xs text-white placeholder-neutral-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                >
                  <FiX size={14} />
                </button>
              )}
            </div>

            {/* Search Dropdown Results */}
            {showSearchDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-white/15 bg-[#0b0e14] shadow-2xl z-[100] custom-scrollbar divide-y divide-white/5">
                {isSearching ? (
                  <div className="p-4 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                    <FiRefreshCw className="animate-spin text-cyan-400" /> Searching customer catalog...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(acc => {
                    const primary = acc.contacts?.find(c => c.isPrimary) || acc.contacts?.[0]
                    const phone = primary?.phone || primary?.mobilePhone || acc.phone || ""
                    const contactName = [primary?.firstName, primary?.lastName].filter(Boolean).join(" ")

                    return (
                      <div
                        key={acc.id}
                        onClick={() => handleSelectAccount(acc.id)}
                        className={`p-3 hover:bg-cyan-500/10 cursor-pointer flex items-center justify-between gap-3 transition ${
                          acc.id === activeAccountId ? "bg-cyan-500/15 border-l-2 border-cyan-400" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate flex items-center gap-2">
                            <span>{acc.name}</span>
                            {acc.billingState && (
                              <span className="text-[10px] font-mono text-neutral-400 bg-white/5 px-1 rounded">
                                {acc.billingCity ? `${acc.billingCity}, ` : ""}{acc.billingState}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-400 flex items-center gap-3 mt-0.5">
                            {contactName && <span className="text-neutral-300 font-medium">Contact: {contactName}</span>}
                            {phone && <span className="font-mono text-cyan-300 flex items-center gap-1"><FiPhone size={10} />{phone}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {acc.balance != null && (
                            <div className="text-xs font-mono font-bold text-emerald-400">
                              ${Number(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-end gap-1">
                            Select <FiChevronRight />
                          </span>
                        </div>
                      </div>
                    )
                  })
                ) : searchQuery.length >= 2 ? (
                  <div className="p-4 text-center text-xs text-neutral-500">
                    No accounts matching "{searchQuery}"
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">Recent Accounts</div>
                    <div className="space-y-1">
                      {recentAccounts.slice(0, 5).map(acc => (
                        <div
                          key={acc.id}
                          onClick={() => handleSelectAccount(acc.id)}
                          className="px-2.5 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs flex justify-between items-center text-neutral-300 hover:text-white"
                        >
                          <span className="font-semibold truncate">{acc.name}</span>
                          <span className="text-[10px] font-mono text-cyan-400">Select</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDialer(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-900/20 transition cursor-pointer"
              title="Open direct phone dialer"
            >
              <FiPhone size={12} />
              <span className="hidden sm:inline">Quick Dial</span>
            </button>

            <button
              onClick={handleFullscreen}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition"
              title="Fullscreen Mode"
            >
              <FiMaximize size={14} />
            </button>
          </div>
        </div>

        {/* Banner if Screen 1 switched to a different account */}
        {controllerAccountSuggestion && controllerAccountSuggestion.id !== activeAccountId && (
          <div className="mt-2 py-1.5 px-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <FiActivity className="text-cyan-400" />
              <span>Screen 1 navigated to <strong>{controllerAccountSuggestion.name || "another account"}</strong>.</span>
            </div>
            <button
              onClick={() => handleSelectAccount(controllerAccountSuggestion.id)}
              className="px-2.5 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow"
            >
              Switch Communicator
            </button>
          </div>
        )}
      </header>

      {/* ─── Main Communicator Workspace ─── */}
      <main className="min-h-0 flex-1 overflow-hidden relative">
        {loadingAccount ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3 text-neutral-400">
            <FiRefreshCw className="animate-spin text-cyan-400 text-3xl" />
            <div className="text-sm font-bold text-white">Loading Customer Communications & Calling Hub...</div>
            <div className="text-xs text-neutral-500">Preparing live call log, scripts, phone links, and sales tools</div>
          </div>
        ) : accountError ? (
          <div className="m-8 max-w-lg mx-auto rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center space-y-4 shadow-xl">
            <FiAlertCircle className="text-red-400 text-3xl mx-auto" />
            <h3 className="text-lg font-bold text-white">Unable to Load Account</h3>
            <p className="text-xs text-red-200 leading-relaxed">{accountError}</p>
            <div className="pt-2">
              <button
                onClick={() => { setActiveAccountId(""); setAccountError(""); }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow cursor-pointer"
              >
                Return to Account Lookup
              </button>
            </div>
          </div>
        ) : account ? (
          /* Loaded Account: Render Full Communicator Hub */
          <AccountSecondScreenWorkspace accountId={account.id} account={account} />
        ) : (
          /* Empty / Launchpad Calling Hub */
          <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto flex flex-col justify-center space-y-8">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-2">
                <FiMonitor /> Standalone Sales Communicator
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">Sales Calling & Communications Center</h2>
              <p className="text-sm text-neutral-400 max-w-xl mx-auto leading-relaxed">
                Lookup any account above or select from your calling queue below to start calling, sending SMS, reviewing pitch scripts, and taking orders.
              </p>
            </div>

            {/* Quick Calling Queue */}
            <div className="bg-[#0b0e14] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <FiLayers className="text-cyan-400" /> Calling Queue & Recent Accounts
                </div>
                <span className="text-xs font-mono text-neutral-500">1-click to communicate</span>
              </div>

              {loadingRecents ? (
                <div className="py-12 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
                  <FiRefreshCw className="animate-spin text-cyan-400" /> Loading calling list...
                </div>
              ) : recentAccounts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recentAccounts.map(acc => {
                    const primary = acc.contacts?.find(c => c.isPrimary) || acc.contacts?.[0]
                    const phone = primary?.phone || primary?.mobilePhone || acc.phone || ""
                    const contactName = [primary?.firstName, primary?.lastName].filter(Boolean).join(" ")

                    return (
                      <div
                        key={acc.id}
                        onClick={() => handleSelectAccount(acc.id)}
                        className="bg-black/40 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/40 rounded-xl p-4 flex items-center justify-between gap-3 transition cursor-pointer group shadow-sm"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white group-hover:text-cyan-300 transition truncate">
                            {acc.name}
                          </div>
                          <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                            {contactName && <span>{contactName}</span>}
                            {phone && <span className="font-mono text-cyan-400">{phone}</span>}
                          </div>
                        </div>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 group-hover:bg-cyan-500 text-white text-xs font-bold shadow whitespace-nowrap">
                          <FiPhoneCall size={12} /> Call
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-neutral-500">
                  Search an account using the search bar above to launch communications.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── Direct Phone Dialer Keypad Modal ─── */}
      {showDialer && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowDialer(false)}>
          <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-[#0b0e14] p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                <FiPhone /> Direct Phone Dialer
              </div>
              <button onClick={() => setShowDialer(false)} className="text-neutral-500 hover:text-white">
                <FiX size={16} />
              </button>
            </div>

            <input
              type="tel"
              value={dialerNumber}
              onChange={e => setDialerNumber(e.target.value)}
              placeholder="Enter phone number..."
              className="w-full rounded-xl border border-white/20 bg-black/60 px-3 py-3 text-center text-lg font-mono font-bold text-white tracking-widest focus:outline-none focus:border-emerald-500"
            />

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(digit => (
                <button
                  key={digit}
                  onClick={() => setDialerNumber(prev => prev + digit)}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-base font-bold font-mono transition"
                >
                  {digit}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDialerNumber("")}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-neutral-400 hover:text-white text-xs font-bold"
              >
                Clear
              </button>
              <button
                onClick={() => handleDialerCall(dialerNumber)}
                disabled={!dialerNumber}
                className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 disabled:opacity-40"
              >
                <FiPhoneCall size={14} /> Call Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SecondDisplayPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-dvh bg-[#07090d] text-cyan-400 text-sm font-bold">
        Loading Titan Communicator...
      </div>
    }>
      <CommunicatorContent />
    </Suspense>
  )
}
