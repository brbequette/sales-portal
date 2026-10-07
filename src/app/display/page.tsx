"use client"
import { USE_ZDIALER } from "@/lib/zdialer"
import { createPortal } from 'react-dom'
import { SmsSenderSelect, useSmsSender } from '@/components/SmsSenderSelect'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import layoutStyles from './display.module.css'
import { CommunicationDock } from '@/components/CommunicationDock'
import { useCommunicationLayout } from '@/lib/communication-layout'
import { ScreenTwoContext } from '@/components/ScreenTwoContext'
import { getCommunicationContext, publishCommunicationContext } from '@/lib/communication-context'
import type { DualScreenState } from '@/lib/dual-screen'
import {
  FiMonitor, FiWifi, FiWifiOff, FiMaximize, FiSearch, FiPhone, FiPhoneCall,
  FiUser, FiMapPin, FiDollarSign, FiClock, FiRefreshCw, FiExternalLink,
  FiChevronRight, FiX, FiActivity, FiLayers, FiAlertCircle, FiMessageSquare,
  FiMail, FiSend, FiUsers, FiBriefcase, FiTrendingUp, FiPackage, FiCheckCircle,
  FiTag, FiArrowLeft, FiFilter, FiSliders, FiShare2, FiPhoneOutgoing, FiCopy, FiZap,
  FiVolume2
} from "react-icons/fi"
import {
  FaWhatsapp, FaLinkedinIn, FaInstagram, FaFacebookF, FaCommentDots
} from "react-icons/fa6"
import { DUAL_SCREEN_CHANNEL, type DualScreenMessage, isDualScreenMessage } from "@/lib/dual-screen"
import { AccountSecondScreenWorkspace } from "@/components/AccountSecondScreenWorkspace"
import { useZoho } from "@/components/ZohoProvider"
import { toast } from "react-hot-toast"

interface AccountContact {
  id: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  mobilePhone?: string | null
  email?: string | null
  title?: string | null
  isPrimary?: boolean
}

interface AccountSearchResult {
  id: string
  name: string
  billingCity?: string | null
  billingState?: string | null
  billingStreet?: string | null
  billingZip?: string | null
  balance?: number | null
  phone?: string | null
  timeZone?: string | null
  status?: string | null
  quality?: string | null
  lastCalledAt?: string | null
  lastPurchaseAt?: string | null
  totalSales?: number | null
  totalProfit?: number | null
  overdueBalance?: number | null
  bladeSizes?: string | null
  materialsCut?: string | null
  currentSupplier?: string | null
  bladesPerOrder?: string | null
  ownerId?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  contacts?: AccountContact[]
}

interface RepOption {
  id: string
  name?: string | null
  email?: string | null
  role?: string | null
}

type PriorityTab = "all" | "reorders" | "shipments" | "overdue" | "slipping" | "vip"

function isDnrAccount(acc: AccountSearchResult): boolean {
  const status = (acc.status || "").toLowerCase().trim()
  const quality = (acc.quality || "").toLowerCase().trim()
  return (
    status === "dnr" ||
    status === "do not contact" ||
    status === "do not call" ||
    status === "inactive" ||
    quality === "do_not_call" ||
    quality === "dnr"
  )
}

function getLocalTimeInfo(timeZone?: string | null) {
  if (!timeZone) return null
  try {
    const now = new Date()
    const timeStr = now.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
    const hour = parseInt(now.toLocaleTimeString("en-US", { timeZone, hour: "numeric", hour12: false }), 10)
    const isBusinessHours = hour >= 7 && hour < 17
    return { timeStr, isBusinessHours }
  } catch {
    return null
  }
}

function CommunicatorContent() {
  const [workspaceView, setWorkspaceView] = useState<'tools' | 'details'>('tools')
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isInitialized, zohoContext: currentUser } = useZoho()

  useEffect(() => {
    const showTools = () => setWorkspaceView('tools')
    const events = ['inAppDial', 'openTitanAi', 'titan:open-messages']
    events.forEach(event => window.addEventListener(event, showTools))
    return () => events.forEach(event => window.removeEventListener(event, showTools))
  }, [])

  const returnToQueue = () => {
    setActiveAccountId('')
    setFollowing(false)
    publishCommunicationContext(null)
    localStorage.removeItem('titan-communicator-active-account-id')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('accountId'); params.delete('id')
    router.replace(`${window.location.pathname}${params.size ? `?${params}` : ''}`)
  }

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
  const [screenOneState, setScreenOneState] = useState<DualScreenState | null>(null)
  const [followScreenOne, setFollowScreenOne] = useState(true)
  const followScreenOneRef = useRef(true)
  const setFollowing = (value: boolean) => { followScreenOneRef.current = value; setFollowScreenOne(value) }
  const [controllerAccountSuggestion, setControllerAccountSuggestion] = useState<{ id: string; name?: string } | null>(null)

  // Account Second-Screen Workspace State
  const initialAccountId = searchParams.get("accountId") || searchParams.get("id") || ""
  const [activeAccountId, setActiveAccountId] = useState<string>(initialAccountId)
  const [account, setAccount] = useState<any>(null)
  const [loadingAccount, setLoadingAccount] = useState<boolean>(false)
  const [accountError, setAccountError] = useState<string>("")

  // Quick Direct Phone Dialer Keypad Modal
  const [showDialer, setShowDialer] = useState(false)
  const [dialerNumber, setDialerNumber] = useState("")

  // Quick SMS Drawer / Modal State
  const [smsModalAccount, setSmsModalAccount] = useState<AccountSearchResult | null>(null)
  const smsSender = useSmsSender(!!smsModalAccount)
  const smsRequest = useRef<{ fingerprint: string; id: string } | null>(null)
  const [smsContactId, setSmsContactId] = useState<string>("")
  const [smsMessage, setSmsMessage] = useState<string>("")
  const [isSendingSms, setIsSendingSms] = useState<boolean>(false)

  // Top Search Dropdown State
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<AccountSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Calling Hub Queue State
  const [reps, setReps] = useState<RepOption[]>([])
  const [repScope, setRepScope] = useState<string>("my") // "my" | "all" | repId
  const [callingAccounts, setCallingAccounts] = useState<AccountSearchResult[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [activeTab, setActiveTab] = useState<PriorityTab>("all")
  const [inListSearch, setInListSearch] = useState("")
  const [reorderPredictions, setReorderPredictions] = useState<Record<string, any>>({})
  const [loadingPredictions, setLoadingPredictions] = useState(false)

  const normalizedRole = (currentUser?.role || "").toLowerCase()
  const isAdminOrManager =
    normalizedRole.includes("admin") ||
    normalizedRole.includes("manager") ||
    normalizedRole.includes("director") ||
    normalizedRole.includes("administrator") ||
    normalizedRole.includes("exec")

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
    if (!targetControllerId.current || !("BroadcastChannel" in window)) return

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

      if (message.type === 'DISPLAY_FOCUS') window.focus()
      if (message.type === 'COMMUNICATION_ACTION' && message.action && ['inAppDial', 'openTitanAi', 'titan:open-messages'].includes(message.action.event)) {
        setWorkspaceView('tools')
        window.dispatchEvent(new CustomEvent(message.action.event, { detail: message.action.detail }))
      }
      const newController = controllerSourceId.current !== message.sourceId
      if (message.type === "CONTROLLER_STATE" && message.state && (newController || message.sequence > lastControllerSequence.current)) {
        controllerSourceId.current = message.sourceId
        lastControllerSequence.current = message.sequence
        setConnected(true)
        lastControllerAt.current = Date.now()
        post("DISPLAY_ACK", { acknowledgedId: message.id })
        setScreenOneState(message.state)
        publishCommunicationContext(message.state.communication || null)
        const communicationAccount = message.state.communication?.accountId
        if (communicationAccount) {
          setActiveAccountId(previous => {
            if (followScreenOneRef.current || !previous || previous === communicationAccount) return communicationAccount
            setControllerAccountSuggestion({ id: communicationAccount, name: message.state?.communication?.title })
            return previous
          })
        }

        const cPath = message.state.controllerPath || ""
        if (!communicationAccount && !cPath.startsWith('/account?') && followScreenOneRef.current) setActiveAccountId('')
        if (cPath.includes("/account")) {
          try {
            const url = new URL(cPath, "http://titan.local")
            const cAccId = url.searchParams.get("id")
            if (cAccId) {
              setActiveAccountId(prev => {
                if (followScreenOneRef.current || !prev) return cAccId
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
  }, [post, searchParams])

  // 3. Keep activeAccountId in sync with URL search params if provided
  useEffect(() => {
    const paramId = searchParams.get("accountId") || searchParams.get("id") || ""
    if (paramId) {
      setActiveAccountId(paramId)
    }
  }, [searchParams])

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
        if (!getCommunicationContext()?.accountId) publishCommunicationContext({ kind: 'account', accountId: acc.id, title: acc.name })
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

  // 5. Fetch Sales Reps List for Rep Selector
  useEffect(() => {
    fetch("/api/get-users")
      .then(res => res.json())
      .then(data => {
        if (data.users && Array.isArray(data.users)) {
          setReps(data.users)
        }
      })
      .catch(() => {
        fetch("/api/admin/users")
          .then(res => res.json())
          .then(data => {
            if (data.users && Array.isArray(data.users)) {
              setReps(data.users)
            }
          })
          .catch(e => console.warn("Could not load reps list:", e))
      })
  }, [])

  // 6. Fetch Accounts for Communicator Calling Hub Queue
  const fetchCallingQueue = useCallback(async () => {
    setLoadingQueue(true)
    try {
      let ownerFilter = ""
      if (repScope === "my") {
        ownerFilter = currentUser?.id || currentUser?.email || ""
      } else if (repScope === "all") {
        ownerFilter = "all"
      } else {
        ownerFilter = repScope
      }

      const params = new URLSearchParams()
      params.set("limit", "200")
      if (ownerFilter && ownerFilter !== "all") {
        params.set("ownerIdFilter", ownerFilter)
      } else if (ownerFilter === "all") {
        params.set("ownerIdFilter", "all")
      }

      const res = await fetch(`/api/get-accounts?${params.toString()}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.accounts)) {
        // Enforce STRICT NO DNR rule!
        const cleanAccounts = data.accounts.filter((acc: AccountSearchResult) => !isDnrAccount(acc))
        setCallingAccounts(cleanAccounts)
      }
    } catch (err) {
      console.error("Failed to load communicator queue:", err)
      toast.error("Failed to load calling queue")
    } finally {
      setLoadingQueue(false)
    }
  }, [repScope, currentUser])

  const fetchPredictions = useCallback(async () => {
    try {
      setLoadingPredictions(true)
      const res = await fetch("/api/sales/reorder-predictions")
      const data = await res.json()
      if (data.success && Array.isArray(data.predictions)) {
        const map: Record<string, any> = {}
        data.predictions.forEach((p: any) => {
          map[p.accountId] = p
        })
        setReorderPredictions(map)
      }
    } catch (err) {
      console.warn("Failed to load reorder predictions:", err)
    } finally {
      setLoadingPredictions(false)
    }
  }, [])

  useEffect(() => {
    if (isInitialized) {
      fetchCallingQueue()
      fetchPredictions()
    }
  }, [isInitialized, fetchCallingQueue, fetchPredictions])

  // 7. Global Top Account Search logic
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/get-accounts?search=${encodeURIComponent(searchQuery.trim())}&limit=16`)
        const data = await res.json()
        if (data.success && Array.isArray(data.accounts)) {
          // Exclude DNRs
          setSearchResults(data.accounts.filter((acc: AccountSearchResult) => !isDnrAccount(acc)))
        } else {
          const gRes = await fetch(`/api/global-search?q=${encodeURIComponent(searchQuery.trim())}`)
          const gData = await gRes.json()
          if (gData.results && Array.isArray(gData.results.accounts)) {
            setSearchResults(gData.results.accounts.filter((acc: AccountSearchResult) => !isDnrAccount(acc)))
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

  // 8. Click outside dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Filtered Accounts by Priority Tab and Search
  const filteredQueue = useMemo(() => {
    return callingAccounts.filter(acc => {
      // In-list quick search
      if (inListSearch.trim()) {
        const needle = inListSearch.toLowerCase().trim()
        const matchName = (acc.name || "").toLowerCase().includes(needle)
        const matchCity = (acc.billingCity || "").toLowerCase().includes(needle)
        const matchState = (acc.billingState || "").toLowerCase().includes(needle)
        const matchPhone = (acc.phone || "").includes(needle)
        const matchContact = acc.contacts?.some(c =>
          `${c.firstName || ""} ${c.lastName || ""}`.toLowerCase().includes(needle) ||
          (c.phone || "").includes(needle) ||
          (c.mobilePhone || "").includes(needle) ||
          (c.email || "").toLowerCase().includes(needle)
        )
        const matchBlade = (acc.bladeSizes || "").toLowerCase().includes(needle) || (acc.materialsCut || "").toLowerCase().includes(needle)
        if (!matchName && !matchCity && !matchState && !matchPhone && !matchContact && !matchBlade) {
          return false
        }
      }

      // Priority Tabs
      if (activeTab === "reorders") {
        if (reorderPredictions[acc.id]) return true
        if (!acc.lastPurchaseAt) return false
        const days = (Date.now() - new Date(acc.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24)
        return days >= 25 && days <= 120
      }
      if (activeTab === "shipments") {
        if (!acc.lastPurchaseAt) return false
        const days = (Date.now() - new Date(acc.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24)
        return days < 25
      }
      if (activeTab === "overdue") {
        return Number(acc.overdueBalance || 0) > 0
      }
      if (activeTab === "slipping") {
        if (!acc.lastCalledAt) return true
        const days = (Date.now() - new Date(acc.lastCalledAt).getTime()) / (1000 * 60 * 60 * 24)
        return days >= 30
      }
      if (activeTab === "vip") {
        return Number(acc.totalSales || 0) >= 5000
      }
      return true
    })
  }, [callingAccounts, activeTab, inListSearch, reorderPredictions])

  // Category counts
  const categoryCounts = useMemo(() => {
    let reorders = 0
    let shipments = 0
    let overdue = 0
    let slipping = 0
    let vip = 0
    let totalBalance = 0

    callingAccounts.forEach(acc => {
      const overdueBal = Number(acc.overdueBalance || 0)
      if (overdueBal > 0) {
        overdue++
        totalBalance += overdueBal
      }
      if (Number(acc.totalSales || 0) >= 5000) vip++

      if (reorderPredictions[acc.id]) {
        reorders++
      } else if (acc.lastPurchaseAt) {
        const days = (Date.now() - new Date(acc.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24)
        if (days >= 25 && days <= 120) reorders++
        if (days < 25) shipments++
      }

      if (!acc.lastCalledAt) {
        slipping++
      } else {
        const days = (Date.now() - new Date(acc.lastCalledAt).getTime()) / (1000 * 60 * 60 * 24)
        if (days >= 30) slipping++
      }
    })

    return {
      all: callingAccounts.length,
      reorders,
      shipments,
      overdue,
      slipping,
      vip,
      totalBalance
    }
  }, [callingAccounts, reorderPredictions])

  const handleSelectAccount = (accId: string) => {
    setFollowing(false)
    setActiveAccountId(accId)
    publishCommunicationContext({ kind: 'account', accountId: accId })
    setShowSearchDropdown(false)
    setSearchQuery("")
    toast.success("Loaded account into Communicator Workspace")
  }

  const handleDialerCall = (numberToCall: string, contactName?: string, accountId?: string, accountName?: string) => {
    const clean = numberToCall.replace(/[^0-9+]/g, "")
    if (!clean) {
      toast.error("Please enter a valid phone number")
      return
    }
    window.dispatchEvent(new CustomEvent("inAppDial", {
      detail: { phone: clean, contactName, accountId, accountName }
    }))
    setShowDialer(false)
  }

  const handleVoicemailDrop = (acc: AccountSearchResult, contactName: string) => {
    toast.success(`Voicemail drop queued for ${contactName || acc.name}`)
  }

  const handleOpenSmsModal = (acc: AccountSearchResult, customMessage?: string) => {
    setSmsModalAccount(acc)
    const primary = acc.contacts?.find(c => c.isPrimary) || acc.contacts?.[0]
    setSmsContactId(primary?.id || "")
    const firstName = primary?.firstName || acc.name.split(" ")[0] || "there"
    if (customMessage) {
      setSmsMessage(customMessage)
    } else {
      setSmsMessage(`Hey ${firstName}, checking in from Titan Diamond—how are the blades holding up on your current job?`)
    }
  }

  const handleSendQuickSms = async () => {
    if (!smsModalAccount || !smsMessage.trim() || !smsSender.selected || isSendingSms) return
    setIsSendingSms(true)
    try {
      const fingerprint = JSON.stringify([smsModalAccount.id, smsContactId, smsMessage.trim(), smsSender.selected])
      if (smsRequest.current?.fingerprint !== fingerprint) smsRequest.current = { fingerprint, id: crypto.randomUUID() }
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: smsModalAccount.id,
          contactId: smsContactId || undefined,
          message: smsMessage.trim(),
          fromNumber: smsSender.selected,
          requestId: smsRequest.current.id
        })
      })
      const data = await res.json()
      if (res.ok && data.success && data.providerAccepted && data.smsMessage?.id) {
        smsRequest.current = null
        toast.success(`SMS sent to ${smsModalAccount.name}!`)
        setSmsModalAccount(null)
      } else {
        throw new Error(data.error || data.message || "Failed to send SMS")
      }
    } catch (err: any) {
      toast.error(err.message || "Error sending SMS")
    } finally {
      setIsSendingSms(false)
    }
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
    <div className={layoutStyles.layout} data-view={workspaceView}>
    <nav className={layoutStyles.switcher} aria-label="Communicator workspace"><button aria-pressed={workspaceView === 'tools'} onClick={() => setWorkspaceView('tools')}>Communications</button><button aria-pressed={workspaceView === 'details'} onClick={() => setWorkspaceView('details')}>Accounts & work queue</button></nav>
    <div onInputCapture={() => setFollowing(false)} className={`${layoutStyles.details} flex flex-col overflow-hidden bg-[#07090d] text-white font-sans`}>
      {searchParams.get("controller") && <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-xs">
        <span className="text-neutral-400">{followScreenOne ? 'Following the active conversation and screen 1' : 'Account pinned while you work — drafts stay with this customer'}</span>
        <button type="button" aria-pressed={followScreenOne} className="rounded-lg bg-cyan-700 px-3 py-2" onClick={() => {
          if (!followScreenOne && !window.confirm('Resume following screen 1? Unsent work in this account workspace may be cleared.')) return
          setFollowing(!followScreenOne)
          if (!followScreenOne && screenOneState?.communication?.accountId) setActiveAccountId(screenOneState.communication.accountId)
        }}>{followScreenOne ? 'Pin this account' : 'Follow screen 1'}</button>
      </div>}
      <ScreenTwoContext state={screenOneState} />
      {/* ─── Top Global Communicator Header & Account Switcher ─── */}
      <header className="flex-none bg-[#0a0d14] border-b border-white/10 px-4 py-2.5 z-50 shadow-md">
        <div className="flex items-center justify-between gap-3">
          
          {/* Left Brand & Connection Status */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                returnToQueue()
              }}
              className="flex items-center gap-2 group text-left cursor-pointer"
              title="Return to Main Communicator Hub"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-900/30 group-hover:scale-105 transition">
                <FiPhoneCall className="text-white text-base" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-400">Titan Hub</div>
                <div className="text-sm font-black tracking-tight text-white leading-tight flex items-center gap-1.5">
                  Communicator
                  {activeAccountId && (
                    <span className="text-[10px] font-bold text-cyan-300 bg-cyan-900/40 border border-cyan-500/30 px-1.5 py-0.2 rounded">
                      Active
                    </span>
                  )}
                </div>
              </div>
            </button>

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
                            Launch <FiChevronRight />
                          </span>
                        </div>
                      </div>
                    )
                  })
                ) : searchQuery.length >= 2 ? (
                  <div className="p-4 text-center text-xs text-neutral-500">
                    No active accounts matching "{searchQuery}"
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2">
            {activeAccountId && (
              <button
                onClick={() => {
                  returnToQueue()
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 hover:text-white text-xs font-bold transition cursor-pointer"
                title="Return to Communicator Queue"
              >
                <FiArrowLeft size={12} />
                <span className="hidden md:inline">Calling Queue</span>
              </button>
            )}

            <button
              onClick={() => window.dispatchEvent(new CustomEvent("inAppDial", { detail: { phone: "" } }))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-900/20 transition cursor-pointer"
              title="Open phone communicator"
            >
              <FiPhone size={12} />
              <span className="hidden sm:inline">{USE_ZDIALER ? "ZDialer" : "Softphone"}</span>
            </button>

            <button
              onClick={handleFullscreen}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition cursor-pointer"
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

      {/* ─── Main Communicator Workspace / Command Center ─── */}
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
                Return to Communicator Queue
              </button>
            </div>
          </div>
        ) : account ? (
          /* Loaded Account: Render Full Communicator Hub with Back Button */
          <AccountSecondScreenWorkspace
            key={account.id}
            accountId={account.id}
            account={account}
            onBack={() => {
              returnToQueue()
            }}
          />
        ) : (
          /* ─── Reworked Full-Width Ultra-Productivity Calling Center ─── */
          <div className="h-full overflow-y-auto px-4 lg:px-8 py-5 space-y-5 custom-scrollbar">
            
            {/* 1. Header Toolbar: Scope Selector + Quick Metrics Strip */}
            <div className="bg-[#0b0e14] border border-white/10 rounded-2xl p-4 lg:p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                
                {/* Rep Scope Selector: "My Accounts" or specific rep */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5 mr-1">
                    <FiUsers className="text-cyan-400" /> Account Scope:
                  </span>

                  <button
                    onClick={() => setRepScope("my")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      repScope === "my"
                        ? "bg-cyan-600 text-white shadow-lg shadow-cyan-950/50"
                        : "bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white border border-white/10"
                    }`}
                  >
                    <FiUser size={13} />
                    <span>My Accounts</span>
                    {currentUser?.name && <span className="opacity-70 text-[10px]">({currentUser.name})</span>}
                  </button>

                  {/* Dropdown for selecting specific Rep */}
                  <div className="relative inline-flex items-center">
                    <select
                      value={repScope.startsWith("my") || repScope === "all" ? "" : repScope}
                      onChange={e => {
                        if (e.target.value) setRepScope(e.target.value)
                      }}
                      className={`appearance-none bg-white/5 border border-white/15 rounded-xl px-3 py-1.5 pr-7 text-xs font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer ${
                        !repScope.startsWith("my") && repScope !== "all" ? "bg-cyan-900/40 border-cyan-400 text-cyan-200" : ""
                      }`}
                    >
                      <option value="" className="bg-[#0b0e14] text-neutral-400">
                        Select Sales Rep...
                      </option>
                      {reps.map(r => (
                        <option key={r.id} value={r.id} className="bg-[#0b0e14] text-white">
                          Rep: {r.name || r.email || r.id}
                        </option>
                      ))}
                    </select>
                    <FiChevronRight className="pointer-events-none absolute right-2 text-neutral-400 rotate-90 text-xs" />
                  </div>

                  {/* Admin All Rep Accounts Toggle */}
                  {isAdminOrManager && (
                    <button
                      onClick={() => setRepScope("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        repScope === "all"
                          ? "bg-purple-600 text-white shadow-lg shadow-purple-950/50"
                          : "bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white border border-white/10"
                      }`}
                    >
                      <FiLayers size={13} />
                      <span>All Rep Accounts</span>
                    </button>
                  )}

                  <button
                    onClick={fetchCallingQueue}
                    disabled={loadingQueue}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
                    title="Refresh Accounts"
                  >
                    <FiRefreshCw className={loadingQueue ? "animate-spin text-cyan-400" : ""} size={13} />
                  </button>
                </div>

                {/* In-List Search Input */}
                <div className="relative min-w-[240px] max-w-xs flex-1">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs" />
                  <input
                    type="text"
                    value={inListSearch}
                    onChange={e => setInListSearch(e.target.value)}
                    placeholder="Filter by contractor, contact, city, phone..."
                    className="w-full rounded-xl border border-white/15 bg-black/50 py-1.5 pl-8 pr-7 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                  />
                  {inListSearch && (
                    <button onClick={() => setInListSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white">
                      <FiX size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-white/10">
                <div className="bg-white/[.02] border border-white/5 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                    <FiUsers className="text-cyan-400" /> Active In Scope
                  </div>
                  <div className="text-lg font-black text-white mt-1">{categoryCounts.all}</div>
                </div>

                <div className="bg-white/[.02] border border-white/5 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <FiRefreshCw className="text-emerald-400" /> Reorders Due
                  </div>
                  <div className="text-lg font-black text-emerald-300 mt-1">{categoryCounts.reorders}</div>
                </div>

                <div className="bg-white/[.02] border border-white/5 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1">
                    <FiPackage className="text-blue-400" /> Recent Shipments
                  </div>
                  <div className="text-lg font-black text-blue-300 mt-1">{categoryCounts.shipments}</div>
                </div>

                <div className="bg-white/[.02] border border-white/5 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <FiDollarSign className="text-amber-400" /> Unpaid Invoices
                  </div>
                  <div className="text-lg font-black text-amber-300 mt-1">
                    {categoryCounts.overdue}
                    {categoryCounts.totalBalance > 0 && (
                      <span className="text-[10px] font-normal text-amber-400/80 ml-1">
                        (${Math.round(categoryCounts.totalBalance).toLocaleString()})
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-white/[.02] border border-white/5 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                    <FiClock className="text-rose-400" /> Needs Touch
                  </div>
                  <div className="text-lg font-black text-rose-300 mt-1">{categoryCounts.slipping}</div>
                </div>

                <div className="bg-white/[.02] border border-white/5 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                    <FiZap className="text-purple-400" /> VIP Accounts
                  </div>
                  <div className="text-lg font-black text-purple-300 mt-1">{categoryCounts.vip}</div>
                </div>
              </div>
            </div>

            {/* 2. Reasons for Outreach Priority Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
              {[
                { id: "all", label: "All Priority Queue", count: categoryCounts.all, icon: <FiLayers size={13} /> },
                { id: "reorders", label: "🔄 Reorders Due (Wear Cycle)", count: categoryCounts.reorders, icon: null },
                { id: "shipments", label: "📦 Recent Deliveries (Check-in)", count: categoryCounts.shipments, icon: null },
                { id: "overdue", label: "💳 Overdue Balances", count: categoryCounts.overdue, icon: null },
                { id: "slipping", label: "⏳ Needs Call (30+ Days)", count: categoryCounts.slipping, icon: null },
                { id: "vip", label: "🔥 Top VIP Customers", count: categoryCounts.vip, icon: null },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as PriorityTab)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-cyan-600 text-white shadow-md shadow-cyan-950/40"
                      : "bg-[#0b0e14] text-neutral-400 hover:text-white border border-white/10 hover:border-white/20"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    activeTab === tab.id ? "bg-black/30 text-white" : "bg-white/10 text-neutral-300"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* 3. Account Cards Grid with Omnichannel Actions */}
            {loadingQueue ? (
              <div className="py-24 text-center space-y-3">
                <FiRefreshCw className="animate-spin text-cyan-400 text-3xl mx-auto" />
                <div className="text-sm font-bold text-white">Loading your priority communications queue...</div>
                <div className="text-xs text-neutral-500">Checking purchase wear cycles, open orders, and contact details</div>
              </div>
            ) : filteredQueue.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {filteredQueue.map(acc => {
                  const primary = acc.contacts?.find(c => c.isPrimary) || acc.contacts?.[0]
                  const phone = primary?.phone || primary?.mobilePhone || acc.phone || ""
                  const cleanPhone = phone.replace(/[^0-9]/g, "")
                  const email = primary?.email || acc.ownerEmail || ""
                  const contactName = [primary?.firstName, primary?.lastName].filter(Boolean).join(" ")
                  const timeInfo = getLocalTimeInfo(acc.timeZone)
                  const overdue = Number(acc.overdueBalance || 0)
                  const totalSales = Number(acc.totalSales || 0)

                  // Days since last purchase
                  let daysSincePurchase: number | null = null
                  if (acc.lastPurchaseAt) {
                    daysSincePurchase = Math.floor((Date.now() - new Date(acc.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24))
                  }

                  // Days since last call
                  let daysSinceCall: number | null = null
                  if (acc.lastCalledAt) {
                    daysSinceCall = Math.floor((Date.now() - new Date(acc.lastCalledAt).getTime()) / (1000 * 60 * 60 * 24))
                  }

                  // Social URLs
                  const waNumber = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone
                  const waUrl = cleanPhone
                    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
                        `Hi ${primary?.firstName || "there"}, checking in from Titan Diamond USA! How are your jobsites going?`
                      )}`
                    : null

                  const linkedInSearch = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(
                    contactName ? `${contactName} ${acc.name}` : `${acc.name} contractor`
                  )}`

                  const cleanInstaTag = acc.name.toLowerCase().replace(/[^a-z0-9]/g, "")
                  const instagramSearch = `https://www.instagram.com/explore/tags/${cleanInstaTag}/`

                  const fbSearch = `https://www.facebook.com/search/top?q=${encodeURIComponent(acc.name)}`

                  const mailtoUrl = email
                    ? `mailto:${email}?subject=${encodeURIComponent(`Titan Diamond USA Blades Follow-up - ${acc.name}`)}&body=${encodeURIComponent(
                        `Hi ${primary?.firstName || "there"},\n\nFollowing up from Titan Diamond USA regarding your upcoming sawing and drilling projects. Let us know if you need blades, core bits, or custom tooling ready for your crews.\n\nBest regards,\nTitan Diamond USA`
                      )}`
                    : null

                  return (
                    <div
                      key={acc.id}
                      className="bg-[#0b0e14] hover:bg-[#0e121a] border border-white/10 hover:border-cyan-500/40 rounded-2xl p-4 flex flex-col justify-between transition-all duration-150 shadow-lg hover:shadow-cyan-950/20 group"
                    >
                      {/* Top Header & Badges */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3
                              onClick={() => handleSelectAccount(acc.id)}
                              className="text-base font-black text-white group-hover:text-cyan-300 transition truncate cursor-pointer"
                              title={acc.name}
                            >
                              {acc.name}
                            </h3>
                            <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-0.5 truncate">
                              {acc.billingCity && (
                                <span className="flex items-center gap-1 text-neutral-300">
                                  <FiMapPin size={11} className="text-neutral-500" />
                                  {acc.billingCity}, {acc.billingState || ""}
                                </span>
                              )}
                              {timeInfo && (
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                  timeInfo.isBusinessHours
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-neutral-800 text-neutral-400"
                                }`}>
                                  {timeInfo.timeStr}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick Value Badge */}
                          <div className="text-right flex-shrink-0">
                            {overdue > 0 ? (
                              <span className="inline-block text-[10px] font-mono font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-lg">
                                Past Due: ${Math.round(overdue).toLocaleString()}
                              </span>
                            ) : totalSales > 0 ? (
                              <span className="inline-block text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded-lg">
                                ${Math.round(totalSales).toLocaleString()} Sold
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Contact details */}
                        <div className="mt-3 bg-black/40 rounded-xl p-2.5 border border-white/5 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-neutral-200 truncate">
                              {contactName || "Primary Contact"}
                              {primary?.title && <span className="text-[10px] font-normal text-neutral-400 ml-1">({primary.title})</span>}
                            </span>
                            {acc.ownerName && (
                              <span className="text-[10px] text-cyan-400/80 font-semibold truncate max-w-[100px]">
                                Rep: {acc.ownerName}
                              </span>
                            )}
                          </div>

                          {phone ? (
                            <div className="flex items-center justify-between text-xs font-mono text-cyan-300">
                              <span className="flex items-center gap-1.5">
                                <FiPhone size={11} className="text-cyan-400" />
                                {phone}
                              </span>
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  navigator.clipboard.writeText(phone)
                                  toast.success("Phone copied to clipboard")
                                }}
                                className="text-neutral-500 hover:text-cyan-300 p-0.5"
                                title="Copy phone"
                              >
                                <FiCopy size={11} />
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs text-neutral-500 italic">No direct phone listed</div>
                          )}

                          {email && (
                            <div className="text-[11px] text-neutral-400 truncate flex items-center gap-1">
                              <FiMail size={10} className="text-neutral-500" />
                              {email}
                            </div>
                          )}
                        </div>

                        {/* Urgency / Touch Indicators */}
                        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-mono">
                          {daysSincePurchase !== null && (
                            <span className={`px-2 py-0.5 rounded-md ${
                              daysSincePurchase >= 25 && daysSincePurchase <= 90
                                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                : "bg-white/5 text-neutral-400"
                            }`}>
                              Last Order: {daysSincePurchase === 0 ? "Today" : `${daysSincePurchase}d ago`}
                            </span>
                          )}

                          <span className={`px-2 py-0.5 rounded-md ${
                            daysSinceCall === null
                              ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                              : daysSinceCall > 30
                              ? "bg-orange-500/15 text-orange-300 border border-orange-500/30"
                              : "bg-white/5 text-neutral-400"
                          }`}>
                            {daysSinceCall === null ? "Never Called" : `Last Call: ${daysSinceCall}d ago`}
                          </span>

                          {acc.bladeSizes && (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-950/40 text-cyan-300 border border-cyan-500/20 truncate max-w-[130px]" title={acc.bladeSizes}>
                              Blades: {acc.bladeSizes}
                            </span>
                          )}
                        </div>

                        {/* Predictive Blade Depletion & Restock Callout */}
                        {reorderPredictions[acc.id] && (() => {
                          const pred = reorderPredictions[acc.id]
                          return (
                            <div className="mt-3 p-2.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-orange-950/30 to-black border border-amber-500/40 space-y-1.5 shadow-md">
                              <div className="flex items-center justify-between text-[11px] font-black">
                                <span className="flex items-center gap-1.5 text-amber-300">
                                  <FiRefreshCw className="animate-spin text-amber-400" size={12} />
                                  <span>{pred.depletionPercentage}% Depleted ({pred.urgency.toUpperCase()})</span>
                                </span>
                                <span className="text-[10px] font-mono text-neutral-400">~{pred.avgCadenceDays}d cadence</span>
                              </div>
                              <div className="text-[11px] text-neutral-200">
                                Suggested: <strong className="text-white">{pred.recommendedQty}x {pred.recommendedItem}</strong>
                              </div>
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <button
                                  onClick={() => handleOpenSmsModal(acc, pred.suggestedSmsMessage)}
                                  disabled={!phone}
                                  className="flex-1 py-1 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-wider transition flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer shadow"
                                >
                                  <FiZap size={11} />
                                  <span>Restock SMS</span>
                                </button>
                                {pred.email && (
                                  <a
                                    href={`mailto:${pred.email}?subject=${encodeURIComponent(pred.suggestedEmailSubject)}&body=${encodeURIComponent(pred.suggestedSmsMessage)}`}
                                    className="py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white text-[10px] font-bold transition flex items-center justify-center gap-1"
                                    title="Draft Restock Email"
                                  >
                                    <FiMail size={11} />
                                    <span>Email</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      {/* ─── Omnichannel 1-Click Action Ribbon ─── */}
                      <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                        {/* Primary Action Buttons: Call, SMS, Email */}
                        <div className="grid grid-cols-3 gap-1.5">
                          {/* 1-Click Call */}
                          <button
                            onClick={() => handleDialerCall(phone, contactName, acc.id, acc.name)}
                            disabled={!phone}
                            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/30 disabled:opacity-40 cursor-pointer transition"
                            title={`Call ${phone || "number"}`}
                          >
                            <FiPhoneCall size={12} />
                            <span>Call</span>
                          </button>

                          {/* 1-Click SMS */}
                          <button
                            onClick={() => handleOpenSmsModal(acc)}
                            disabled={!phone}
                            className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-950/30 disabled:opacity-40 cursor-pointer transition"
                            title="Send 1-Click SMS"
                          >
                            <FiMessageSquare size={12} />
                            <span>SMS</span>
                          </button>

                          {/* 1-Click Email */}
                          {mailtoUrl ? (
                            <a
                              href={mailtoUrl}
                              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-950/30 cursor-pointer transition"
                              title="Draft 1-Click Email"
                            >
                              <FiMail size={12} />
                              <span>Email</span>
                            </a>
                          ) : (
                            <button
                              disabled
                              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-indigo-600/40 text-neutral-400 text-xs font-bold cursor-not-allowed"
                            >
                              <FiMail size={12} />
                              <span>Email</span>
                            </button>
                          )}
                        </div>

                        {/* Secondary Omnichannel Strip: WhatsApp, LinkedIn, Instagram, Facebook, Voicemail Drop */}
                        <div className="flex items-center justify-between gap-1 pt-1">
                          <div className="flex items-center gap-1">
                            {/* WhatsApp */}
                            {waUrl ? (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-8 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 flex items-center justify-center transition"
                                title="Chat on WhatsApp"
                              >
                                <FaWhatsapp size={14} />
                              </a>
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-white/5 text-neutral-600 flex items-center justify-center cursor-not-allowed">
                                <FaWhatsapp size={14} />
                              </div>
                            )}

                            {/* LinkedIn */}
                            <a
                              href={linkedInSearch}
                              target="_blank"
                              rel="noreferrer"
                              className="w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 flex items-center justify-center transition"
                              title="Search Contractor on LinkedIn"
                            >
                              <FaLinkedinIn size={13} />
                            </a>

                            {/* Instagram */}
                            <a
                              href={instagramSearch}
                              target="_blank"
                              rel="noreferrer"
                              className="w-8 h-8 rounded-lg bg-pink-500/10 hover:bg-pink-500/25 border border-pink-500/30 text-pink-400 flex items-center justify-center transition"
                              title="Explore Jobsite Tag on Instagram"
                            >
                              <FaInstagram size={13} />
                            </a>

                            {/* Facebook */}
                            <a
                              href={fbSearch}
                              target="_blank"
                              rel="noreferrer"
                              className="w-8 h-8 rounded-lg bg-sky-500/10 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 flex items-center justify-center transition"
                              title="Search Company on Facebook"
                            >
                              <FaFacebookF size={12} />
                            </a>

                            {/* Voicemail Drop */}
                            <button
                              onClick={() => handleVoicemailDrop(acc, contactName)}
                              disabled={!phone}
                              className="w-8 h-8 rounded-lg bg-violet-500/10 hover:bg-violet-500/25 border border-violet-500/30 text-violet-400 flex items-center justify-center transition disabled:opacity-40 cursor-pointer"
                              title="Drop Pre-recorded Voicemail"
                            >
                              <FiVolume2 size={13} />
                            </button>
                          </div>

                          {/* Full Script & Workspace Button */}
                          <button
                            onClick={() => handleSelectAccount(acc.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-cyan-600 hover:text-white text-neutral-300 text-[11px] font-bold transition cursor-pointer"
                            title="Open interactive sales pitch & second screen workspace"
                          >
                            <span>Open Hub</span>
                            <FiChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-[#0b0e14] border border-white/10 rounded-2xl p-12 text-center space-y-3 max-w-xl mx-auto">
                <FiUsers className="text-cyan-400 text-4xl mx-auto" />
                <h3 className="text-lg font-bold text-white">No accounts found in this view</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Try switching the priority tab above, clearing your search filter, or selecting a different sales rep scope.
                </p>
                <button
                  onClick={() => { setActiveTab("all"); setInListSearch(""); setRepScope("my"); }}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Reset Filters & View My Accounts
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── 1-Click Quick SMS Modal ─── */}
      {smsModalAccount && createPortal(
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSmsModalAccount(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0b0e14] p-5 shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                <FiMessageSquare /> Quick SMS to {smsModalAccount.name}
              </div>
              <button onClick={() => setSmsModalAccount(null)} className="text-neutral-500 hover:text-white">
                <FiX size={16} />
              </button>
            </div>

            {/* Recipient Contact Selector */}
            <SmsSenderSelect sender={smsSender} />
            {smsModalAccount.contacts && smsModalAccount.contacts.length > 1 && (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                  Recipient Contact
                </label>
                <select
                  value={smsContactId}
                  onChange={e => setSmsContactId(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {smsModalAccount.contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Contact"} — {c.phone || c.mobilePhone || "No Phone"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 1-Click Pre-filled Pitch Templates */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                1-Click Effort Templates
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: "🔄 Blade Wear Check",
                    text: `Hey ${(smsModalAccount.contacts?.[0]?.firstName || "there")}, checking in from Titan Diamond—how are the blades holding up on your current job?`
                  },
                  {
                    label: "📦 Delivery Follow-up",
                    text: `Hi ${(smsModalAccount.contacts?.[0]?.firstName || "there")}, your recent diamond blade shipment has arrived. Everything looking sharp?`
                  },
                  {
                    label: "⚡ Batch Re-stock",
                    text: `Hey ${(smsModalAccount.contacts?.[0]?.firstName || "there")}, we've got fresh asphalt & concrete combo blades ready to ship today. Need anything for this week?`
                  },
                  {
                    label: "📐 Spec & Arbor Question",
                    text: `Hi ${(smsModalAccount.contacts?.[0]?.firstName || "there")}, quick question on your upcoming project—what saw diameter and arbor size are your crews running?`
                  }
                ].map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSmsMessage(tpl.text)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 hover:border-cyan-500/40 border border-white/10 text-[11px] font-medium text-neutral-300 hover:text-cyan-200 transition cursor-pointer text-left"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Body */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                Message Body
              </label>
              <textarea
                value={smsMessage}
                onChange={e => setSmsMessage(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-white/20 bg-black/60 p-3 text-xs text-white focus:outline-none focus:border-cyan-500 placeholder-neutral-500"
                placeholder="Type text message..."
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  handleSelectAccount(smsModalAccount.id)
                  setSmsModalAccount(null)
                }}
                className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
              >
                <span>Open Full Account Communications Hub</span>
                <FiExternalLink size={11} />
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setSmsModalAccount(null)}
                  className="px-3 py-1.5 rounded-xl border border-white/10 text-neutral-400 hover:text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendQuickSms}
                  disabled={isSendingSms || !smsMessage.trim() || !smsSender.selected || smsSender.loading}
                  className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-950/40 disabled:opacity-40 cursor-pointer"
                >
                  {isSendingSms ? <FiRefreshCw className="animate-spin" size={13} /> : <FiSend size={13} />}
                  <span>Send SMS Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* ─── Direct Phone Dialer Keypad Modal ─── */}
      {showDialer && (
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowDialer(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-white/15 bg-[#0b0e14] p-5 shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
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
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-base font-bold font-mono transition cursor-pointer"
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
                className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 disabled:opacity-40 cursor-pointer"
              >
                <FiPhoneCall size={14} /> Call Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    <div className={layoutStyles.tools}><CommunicationDock inline user={currentUser ? { id: currentUser.id, name: currentUser.name || undefined, role: currentUser.role } : undefined} /></div>
    </div>
  )
}

function ResponsiveCommunicator() {
  const { mobile } = useCommunicationLayout()
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const { zohoContext: user } = useZoho()
  if (!mounted) return null
  return mobile ? <div className="h-dvh"><CommunicationDock inline user={user ? { id: user.id, name: user.name || undefined, role: user.role } : undefined} /></div> : <CommunicatorContent />
}

export default function SecondDisplayPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-dvh bg-[#07090d] text-cyan-400 text-sm font-bold">
        Loading Titan Communicator...
      </div>
    }>
      <ResponsiveCommunicator />
    </Suspense>
  )
}
