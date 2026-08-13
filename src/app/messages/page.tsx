"use client"

import { useState, useEffect, useRef } from "react"
import { FiSend, FiArrowLeft, FiMessageSquare, FiUser, FiSearch, FiZap, FiExternalLink, FiChevronDown, FiChevronRight, FiCheckCircle, FiAlertCircle, FiRefreshCw } from "react-icons/fi"
import { AccountSlideout } from "@/components/AccountSlideout"
import { toast } from 'react-hot-toast';
import { localGet, localSet, TTL } from "@/lib/dataCache"
import { UpdateBanner } from '@/lib/useStaleCheck'

export default function MessagesPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [refreshingAccounts, setRefreshingAccounts] = useState(false)
  const [refreshingMessages, setRefreshingMessages] = useState(false)
  const [textInput, setTextInput] = useState("")
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  
  const [showIncomingOnly, setShowIncomingOnly] = useState(true)
  const [slideoutAccountId, setSlideoutAccountId] = useState<string | null>(null)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({})

  const [includeClosedHistory, setIncludeClosedHistory] = useState(false)
  const [closedMessagesCount, setClosedMessagesCount] = useState(0)
  const [lastClosedCycleAt, setLastClosedCycleAt] = useState<string | null>(null)
  const [closingCycle, setClosingCycle] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncOffset, setSyncOffset] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Campaign & Search States
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "campaigns">("all")
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [zohoNumbers, setOutboundNumbers] = useState<any[]>([])
  const [selectedOutboundNumber, setSelectedOutboundNumber] = useState("")

  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dataSig, setDataSig] = useState<string | null>(null)

  const checkForUpdates = async (currentSig: string, apiUrl: string) => {
    try {
      const separator = apiUrl.includes('?') ? '&' : '?'
      const res = await fetch(`${apiUrl}${separator}checkOnly=true`)
      const data = await res.json()
      if (!data.checkOnly) return
      const remoteSig = `${data.count}|${data.latestUpdatedAt ?? ''}`
      if (remoteSig !== currentSig) setUpdateAvailable(true)
    } catch {}
  }

  // Check URL parameters on mount — only auto-sync if viewing a specific campaign
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const campaignBlastId = params.get("campaignBlastId")
      if (campaignBlastId) {
        setActiveTab("campaigns")
        setSelectedCampaignId(campaignBlastId)
      }
      // No auto-sync on mount — user clicks the sync button when they want fresh data
    }
  }, [])

  // Sync available Zoho numbers (24hr local cache — numbers change rarely)
  useEffect(() => {
    const cached = localGet<{ numbers: any[]; defaultNumber: string }>('zoho-numbers', TTL.ONE_DAY)
    if (cached) {
      setOutboundNumbers(cached.numbers)
      setSelectedOutboundNumber(cached.defaultNumber)
      return
    }
    fetch("/api/manage-zoho-numbers")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.numbers?.length > 0) {
          setOutboundNumbers(d.numbers)
          const def = d.numbers.find((n: any) => n.isDefault)
          const defaultNumber = def ? def.number : d.numbers[0].number
          setSelectedOutboundNumber(defaultNumber)
          localSet('zoho-numbers', { numbers: d.numbers, defaultNumber })
        }
      })
      .catch(console.error)
  }, [])

  // Fetch campaigns list
  useEffect(() => {
    fetchCampaigns()
  }, [])

  // Refetch accounts list whenever activeTab or selectedCampaignId changes
  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignAccounts(selectedCampaignId)
    } else if (activeTab === "all") {
      fetchAccounts()
    }
  }, [selectedCampaignId, activeTab])

  const handleSync = async (offset = 0) => {
    try {
      setSyncing(true)
      const res = await fetch('/api/sync-zoho-sms', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: offset })
      })
      const data = await res.json()
      if (!data.success) {
        console.error('Zoho Sync API Error:', data.error)
        toast.error('Could not sync Zoho SMS: ' + data.error)
      } else {
        setLastSyncedAt(new Date())
      }
    } catch (e) {
      console.error('Failed to sync Zoho SMS', e)
    } finally {
      setSyncing(false)
      if (selectedCampaignId) {
        fetchCampaignAccounts(selectedCampaignId)
      } else {
        fetchAccounts()
      }
    }
  }

  const handleLoadOlder = () => {
    const newOffset = syncOffset + 100
    setSyncOffset(newOffset)
    handleSync(newOffset)
  }

  useEffect(() => {
    if (selectedAccountId) {
      fetchMessages(selectedAccountId, includeClosedHistory)
      setSuggestions([])
    }
  }, [selectedAccountId, includeClosedHistory])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchAccounts = async () => {
    try {
      if (accounts.length === 0) setLoadingAccounts(true)
      else setRefreshingAccounts(true)
      const res = await fetch('/api/messages')
      const data = await res.json()
      if (data.success) {
        const accs = data.accounts || []
        setAccounts(accs)
        const sig = `${accs.length}|${accs[0]?.updatedAt ?? accs[0]?.lastMessageAt ?? ''}`
        setDataSig(sig)
        setUpdateAvailable(false)
        setTimeout(() => checkForUpdates(sig, '/api/messages'), 2000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAccounts(false)
      setRefreshingAccounts(false)
    }
  }

  const fetchCampaigns = async () => {
    try {
      setLoadingCampaigns(true)
      const res = await fetch('/api/messages?getCampaigns=true')
      const data = await res.json()
      if (data.success) {
        setCampaigns(data.campaigns || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingCampaigns(false)
    }
  }

  const fetchCampaignAccounts = async (campaignId: string) => {
    try {
      if (accounts.length === 0) setLoadingAccounts(true)
      else setRefreshingAccounts(true)
      const res = await fetch(`/api/messages?campaignBlastId=${campaignId}`)
      const data = await res.json()
      if (data.success) {
        setAccounts(data.accounts || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAccounts(false)
      setRefreshingAccounts(false)
    }
  }

  const fetchMessages = async (accountId: string, showClosed = includeClosedHistory) => {
    try {
      if (messages.length === 0) setLoadingMessages(true)
      else setRefreshingMessages(true)
      const res = await fetch(`/api/messages/${accountId}?includeClosedHistory=${showClosed}`)
      const data = await res.json()
      if (data.success) {
        setMessages(data.messages || [])
        setClosedMessagesCount(data.closedMessagesCount || 0)
        setLastClosedCycleAt(data.lastClosedCycleAt || null)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMessages(false)
      setRefreshingMessages(false)
    }
  }

  const handleCloseCycle = async () => {
    if (!selectedAccountId) return
    if (!confirm("Are you sure you want to close this sale cycle? All current messages prior to this moment will be hidden from the active text window.")) return

    try {
      setClosingCycle(true)
      const res = await fetch(`/api/messages/${selectedAccountId}/close-cycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Sale cycle closed! Active text thread reset for new cycle.")
        setIncludeClosedHistory(false)
        fetchMessages(selectedAccountId, false)
        if (selectedCampaignId) {
          fetchCampaignAccounts(selectedCampaignId)
        } else {
          fetchAccounts()
        }
      } else {
        toast.error("Failed to close sale cycle: " + data.error)
      }
    } catch (e: any) {
      toast.error("Error closing sale cycle: " + e.message)
    } finally {
      setClosingCycle(false)
    }
  }

  const [attachVCard, setAttachVCard] = useState(false)
  const [showVCardModal, setShowVCardModal] = useState(false)
  const [vcardFields, setVCardFields] = useState({
    name: "",
    title: "Sales Representative",
    phone: "",
    email: "",
    company: "Titan Diamond USA",
    website: "https://tdusales.com",
    photoUrl: ""
  })

  const handleSend = async () => {
    if (!textInput.trim() || !selectedAccountId) return
    
    const lastOurMsg = [...messages].reverse().find(m => m.direction === 'OUTBOUND')
    const fromNumber = selectedOutboundNumber || lastOurMsg?.fromNumber || ''
    
    if (!fromNumber) {
      toast.error('Could not determine which number to send from. Please select a sender phone number.')
      return
    }

    try {
      setSending(true)
      const res = await fetch(`/api/messages/${selectedAccountId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textInput,
          fromNumber,
          attachVCard,
          vcardCustomFields: attachVCard ? vcardFields : null
        })
      })
      const data = await res.json()
      if (data.success) {
        setTextInput('')
        setSuggestions([])
        fetchMessages(selectedAccountId)
      } else {
        toast.error('Error sending message: ' + data.error)
      }
    } catch (e) {
      console.error(e)
      toast.error('Error sending message.')
    } finally {
      setSending(false)
    }
  }

  const handleAiSuggest = async () => {
    if (!selectedAccountId || messages.length === 0) return
    try {
      setSuggesting(true)
      const res = await fetch('/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedAccountId, messages: messages.slice(-10) })
      })
      const data = await res.json()
      if (data.success) {
        setSuggestions(data.suggestions)
      } else {
        toast.error('AI Suggestion failed: ' + data.error)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSuggesting(false)
    }
  }

  const activeAccount = accounts.find(a => a.id === selectedAccountId)
  const activeCampaign = campaigns.find(c => c.id === selectedCampaignId)

  // Filter accounts list based on search and active tab
  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = searchQuery
      ? account.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        account.zohoId?.toLowerCase().includes(searchQuery.toLowerCase())
      : true

    if (activeTab === "all" && showIncomingOnly) {
      const lastMsg = account.smsMessages?.[0]
      return matchesSearch && lastMsg && lastMsg.direction === 'INBOUND'
    }
    return matchesSearch
  })

  // Group direct inbox chats by campaign name for All Chats
  const groupedByCampaign = activeTab === "all" ? filteredAccounts.reduce((acc, account) => {
    const lastMsg = account.smsMessages?.[0]
    const campaignName = lastMsg?.campaignBlast?.name || "Direct / Organic"
    if (!acc[campaignName]) acc[campaignName] = []
    acc[campaignName].push(account)
    return acc
  }, {} as Record<string, any[]>) : {}

  return (
    <div className="flex h-full bg-[#0a0a0a] overflow-hidden text-neutral-200">
      
      {/* LEFT PANE - Account List */}
      <div className={`w-full md:w-80 flex-shrink-0 flex flex-col border-r border-white/10 ${selectedAccountId ? 'hidden md:flex' : 'flex'}`}>
        <UpdateBanner show={updateAvailable} onUpdate={() => { setUpdateAvailable(false); fetchAccounts() }} accentColor="sky" label="New messages available" />
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <FiMessageSquare className="text-emerald-500" /> Messages
            </h1>
            {syncing
              ? <div className="text-xs text-emerald-500 animate-pulse flex items-center gap-1"><FiZap /> Syncing...</div>
              : <button
                  onClick={() => handleSync(0)}
                  title="Sync latest messages from Zoho"
                  className="flex items-center gap-1 text-xs text-neutral-500 hover:text-emerald-400 transition-colors"
                >
                  <FiRefreshCw size={12} />
                  <span>{lastSyncedAt ? `Synced ${Math.round((Date.now() - lastSyncedAt.getTime()) / 60000)}m ago` : 'Sync'}</span>
                </button>
            }
          </div>

          {/* Segmented Control Selector Tabs */}
          <div className="flex bg-neutral-900/60 p-1 rounded-lg border border-white/10 mb-4 select-none">
            <button
              onClick={() => {
                setActiveTab("all")
                setSelectedCampaignId(null)
              }}
              className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === "all"
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 font-extrabold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              All Chats
            </button>
            <button
              onClick={() => {
                setActiveTab("campaigns")
                fetchCampaigns()
              }}
              className={`flex-1 text-center py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === "campaigns"
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 font-extrabold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Campaigns
            </button>
          </div>

          <div className="relative mb-3">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text"
              placeholder={activeTab === "campaigns" && !selectedCampaignId ? "Search campaigns..." : "Search accounts..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="td-input pl-9 focus:border-emerald-500"
            />
          </div>

          {activeTab === "all" && (
            <div className="flex items-center gap-2 select-none">
              <input 
                type="checkbox" 
                id="incomingFilter"
                checked={showIncomingOnly}
                onChange={(e) => setShowIncomingOnly(e.target.checked)}
                className="rounded border-white/10 bg-black/40 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-neutral-900"
              />
              <label htmlFor="incomingFilter" className="text-xs text-neutral-400 cursor-pointer font-bold">
                Only show incoming messages
              </label>
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto relative">
          {refreshingAccounts && <div className="sticky top-0 left-0 right-0 h-0.5 bg-indigo-500/60 animate-pulse z-20" />}
          {activeTab === "all" ? (
            /* ALL CHATS LIST */
            loadingAccounts ? (
              <div className="p-8 text-center text-neutral-500 text-sm">Loading conversations...</div>
            ) : Object.keys(groupedByCampaign).length === 0 && !refreshingAccounts ? (
              <div className="p-8 text-center text-neutral-500 text-sm italic">No active conversations found.</div>
            ) : (
              (Object.entries(groupedByCampaign) as [string, any[]][]).map(([campaignName, campaignAccounts]) => (
                <div key={campaignName} className="mb-4">
                  <div 
                    className="px-4 py-2 bg-neutral-900/60 text-[10px] font-black text-neutral-400 uppercase tracking-wider sticky top-0 backdrop-blur z-10 border-y border-white/10 flex justify-between items-center cursor-pointer hover:text-neutral-300 transition-colors"
                    onClick={() => setExpandedCampaigns(prev => ({ ...prev, [campaignName]: prev[campaignName] === false ? true : false }))}
                  >
                    <span>{campaignName} ({campaignAccounts.length})</span>
                    {expandedCampaigns[campaignName] === false ? <FiChevronRight size={14} /> : <FiChevronDown size={14} />}
                  </div>
                  {expandedCampaigns[campaignName] !== false && campaignAccounts.map(account => {
                    const lastMsg = account.smsMessages?.[0]
                    return (
                      <div 
                        key={account.id}
                        onClick={() => setSelectedAccountId(account.id)}
                        className={`p-4 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-all ${selectedAccountId === account.id ? 'bg-neutral-800' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-white text-sm truncate">{account.name}</h3>
                          {lastMsg && (
                            <span className="text-xs text-neutral-500 flex-shrink-0 ml-2">
                              {new Date(lastMsg.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        {lastMsg && (
                          <p className="text-xs text-neutral-400 truncate">
                            {lastMsg.direction === 'OUTBOUND' ? 'You: ' : ''}{lastMsg.body}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )
          ) : (
            /* CAMPAIGNS TAB CHATS LIST */
            selectedCampaignId === null ? (
              /* LIST ALL CAMPAIGNS */
              loadingCampaigns ? (
                <div className="p-8 text-center text-neutral-500 text-sm">Loading campaigns...</div>
              ) : campaigns.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-sm italic">No campaigns found.</div>
              ) : (
                campaigns
                  .filter(c => searchQuery ? c.name?.toLowerCase().includes(searchQuery.toLowerCase()) : true)
                  .map(c => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCampaignId(c.id)
                        setSearchQuery("")
                      }}
                      className="p-4 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-all"
                    >
                      <h3 className="font-bold text-white text-sm truncate">{c.name}</h3>
                      <p className="text-[10px] text-neutral-500 mt-1">
                        Sent by {c.author?.name || "System"} on {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                      <div className="flex gap-2 mt-2.5">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {c.sentCount} Sent
                        </span>
                        {c.failedCount > 0 && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                            {c.failedCount} Failed
                          </span>
                        )}
                      </div>
                    </div>
                  ))
              )
            ) : (
              /* LIST ACCOUNTS IN SELECTED CAMPAIGN */
              <div>
                <div className="px-3 py-2 bg-neutral-900 border-b border-white/10 flex items-center">
                  <button
                    onClick={() => {
                      setSelectedCampaignId(null)
                      setSelectedAccountId(null)
                    }}
                    className="flex items-center gap-1.5 text-neutral-400 hover:text-white text-xs font-black"
                  >
                    <FiArrowLeft size={14} className="text-emerald-400" /> BACK TO CAMPAIGNS
                  </button>
                </div>
                <div className="p-3 bg-black/30 border-b border-white/10 text-center">
                  <h4 className="font-black text-xs text-white uppercase tracking-wider truncate" title={activeCampaign?.name}>{activeCampaign?.name}</h4>
                  <p className="text-[9px] text-neutral-500 font-bold mt-0.5">RECIPIENTS LIST</p>
                </div>
                {loadingAccounts ? (
                  <div className="p-8 text-center text-neutral-500 text-sm">Loading recipients...</div>
                ) : filteredAccounts.length === 0 ? (
                  <div className="p-8 text-center text-neutral-500 text-sm italic">No targeted recipients found.</div>
                ) : (
                  filteredAccounts.map(account => {
                    const lastMsg = account.smsMessages?.[0]
                    return (
                      <div
                        key={account.id}
                        onClick={() => setSelectedAccountId(account.id)}
                        className={`p-4 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-all ${selectedAccountId === account.id ? 'bg-neutral-800' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-white text-sm truncate">{account.name}</h3>
                          {lastMsg && (
                            <span className="text-[10px] text-neutral-500 shrink-0 ml-2">
                              {new Date(lastMsg.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2 gap-2">
                          {account.hasReplied ? (
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1 shrink-0">
                              <FiMessageSquare size={10} className="animate-pulse" /> Replied
                            </span>
                          ) : account.campaignStatus === 'SUCCESS' ? (
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                              <FiCheckCircle size={10} /> Sent
                            </span>
                          ) : (
                            <span 
                              className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 shrink-0"
                              title={account.campaignErrorMessage || "Sending failed"}
                            >
                              <FiAlertCircle size={10} /> Failed
                            </span>
                          )}
                          {lastMsg && (
                            <p className="text-xs text-neutral-500 truncate text-right flex-1">
                              {lastMsg.body}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )
          )}
          
          {/* Sync / Load older */}
          {activeTab === "all" && !loadingAccounts && (
            <div className="p-4 border-t border-white/10 flex justify-center">
              <button 
                onClick={handleLoadOlder}
                disabled={syncing}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold rounded-lg transition-colors border border-white/10 disabled:opacity-50"
              >
                {syncing ? 'Loading...' : 'Load Older Messages (Zoho)'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANE - Chat View */}
      <div className={`flex-1 flex flex-col min-w-0 ${!selectedAccountId ? 'hidden md:flex' : 'flex'}`}>
        {!selectedAccountId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 bg-[#06070a]">
            <FiMessageSquare size={54} className="mb-4 opacity-10 text-emerald-400" />
            <p className="text-sm font-bold tracking-wide uppercase text-neutral-600">Select a conversation to start messaging</p>
          </div>
        ) : (
          <>
            {/* Chat View Header */}
            <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 shrink-0 bg-[#0a0a0c]">
              <div className="flex items-center gap-3">
                <button 
                  className="md:hidden p-2 mr-1 text-neutral-400 hover:text-white"
                  onClick={() => setSelectedAccountId(null)}
                >
                  <FiArrowLeft size={20} />
                </button>
                <div className="w-8 h-8 rounded-full bg-emerald-900/30 text-emerald-400 flex items-center justify-center font-bold">
                  <FiUser size={16} />
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm tracking-tight">{activeAccount?.name}</h2>
                  <p className="text-neutral-500 text-[10px] font-bold">{activeAccount?.zohoId}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeAccount?.zohoId && (
                  <button onClick={() => setSlideoutAccountId(activeAccount.zohoId)} className="flex items-center gap-1 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-emerald-400 text-xs font-bold rounded-lg border border-white/10 transition-colors">
                    <FiExternalLink size={13} /> Account
                  </button>
                )}
                <button
                  onClick={handleCloseCycle}
                  disabled={closingCycle}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 border border-amber-800/40 text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  title="Close current sale cycle and hide history from active window"
                >
                  <span>{closingCycle ? "Closing..." : "Close Sale Cycle"}</span>
                </button>
              </div>
            </div>

            {/* Campaign Template Content Summary Panel */}
            {selectedCampaignId && activeCampaign && (
              <div className="px-4 py-3 bg-neutral-950 border-b border-white/10 text-xs shrink-0 select-none">
                <div className="flex justify-between items-center mb-1 text-[10px] font-black text-neutral-500 uppercase tracking-wider">
                  <span>CAMPAIGN BLAST SOURCE</span>
                  <span>{new Date(activeCampaign.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="pl-3 border-l-2 border-emerald-500/50 text-neutral-400 italic font-medium whitespace-pre-wrap">{activeCampaign.content}</p>
              </div>
            )}

            {/* Chat Thread */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#06070a]">
              {/* Closed Sale Cycle Banner */}
              {closedMessagesCount > 0 && (
                <div className="p-3.5 bg-neutral-950/80 border border-amber-500/20 rounded-xl text-center text-xs text-neutral-300 space-y-2 mb-2 shadow-md">
                  <p className="text-amber-400/90 font-bold flex items-center justify-center gap-1.5">
                    🔒 {closedMessagesCount} message(s) from prior closed cycles are hidden.
                  </p>
                  <button
                    onClick={() => setIncludeClosedHistory(!includeClosedHistory)}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-black rounded-lg border border-white/10 text-[10px] transition-colors uppercase tracking-wider"
                  >
                    {includeClosedHistory ? "Hide Closed Cycle History" : `Show ${closedMessagesCount} Previous Messages`}
                  </button>
                </div>
              )}

              {refreshingMessages && <div className="h-0.5 bg-emerald-500/50 animate-pulse w-full mb-2 rounded" />}
              {loadingMessages ? (
                <div className="text-center text-neutral-500 text-sm mt-8">Loading thread...</div>
              ) : messages.length === 0 && !refreshingMessages ? (
                <div className="text-center text-neutral-500 text-sm mt-8 italic">No active messages in this cycle.</div>
              ) : (
                messages.map((msg, idx) => {
                  const isMine = msg.direction === 'OUTBOUND'
                  return (
                    <div key={msg.id || idx} className={`flex flex-col max-w-[80%] ${isMine ? 'self-end items-end' : 'self-start items-start'}`}>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMine ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-neutral-900 text-neutral-200 rounded-bl-sm border border-white/10'}`}>
                        {msg.mediaUrl && (
                          <img src={msg.mediaUrl} alt="Attachment" className="max-w-full rounded-lg mb-2 max-h-48 object-cover border border-white/10" />
                        )}
                        {msg.body}
                      </div>
                      <span className="text-[9px] font-bold text-neutral-500 mt-1.5 px-1 flex items-center gap-1">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.campaignBlast?.name && (
                          <span className="text-neutral-600 font-extrabold uppercase tracking-wider text-[8px] bg-white/5 border border-white/10 px-1 rounded">
                            📢 {msg.campaignBlast.name}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Suggestions Box */}
            {suggestions.length > 0 && (
              <div className="px-4 py-3 bg-[#0a0a0c] border-t border-white/10 shrink-0">
                <div className="text-[10px] font-black text-emerald-400 mb-2 flex items-center gap-1 uppercase tracking-wider select-none">
                  <FiZap className="animate-pulse" /> AI Suggestions
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((sug, i) => (
                    <button
                      key={i}
                      onClick={() => setTextInput(sug)}
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 rounded-full border border-white/10 transition-colors text-left max-w-full truncate"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reply Input Box */}
            <div className="p-4 bg-[#0a0a0c] border-t border-white/10 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between text-xs text-neutral-400 font-semibold px-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-neutral-300 hover:text-white transition-colors">
                    <input
                      type="checkbox"
                      checked={attachVCard}
                      onChange={e => setAttachVCard(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 text-orange-500 focus:ring-orange-500 cursor-pointer"
                    />
                    <span>🎴 Attach my vCard contact card link</span>
                  </label>
                  {attachVCard && (
                    <button
                      type="button"
                      onClick={() => setShowVCardModal(true)}
                      className="text-[11px] text-orange-400 hover:text-orange-300 font-bold underline flex items-center gap-1 cursor-pointer"
                    >
                      ✏️ Edit vCard Fields & Photo
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-end gap-2">
                <button 
                  onClick={handleAiSuggest}
                  disabled={suggesting || messages.length === 0}
                  className="p-3 rounded-xl bg-neutral-900 text-emerald-400 hover:bg-neutral-800 border border-white/10 transition-colors disabled:opacity-50 shrink-0"
                  title="AI Suggest Reply"
                >
                  {suggesting ? <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : <FiZap size={20} />}
                </button>

                {zohoNumbers.length > 0 && (
                  <select
                    value={selectedOutboundNumber}
                    onChange={e => setSelectedOutboundNumber(e.target.value)}
                    className="bg-neutral-900 border border-white/10 rounded-xl px-2 py-3.5 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 shrink-0 select-none"
                    title="Sender phone number"
                  >
                    {zohoNumbers.map(n => (
                      <option key={n.number} value={n.number}>
                        {n.name || n.number}
                      </option>
                    ))}
                  </select>
                )}

                <textarea
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none placeholder:text-neutral-600"
                  rows={1}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <button 
                  onClick={handleSend}
                  disabled={!textInput.trim() || sending}
                  className="p-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 shrink-0"
                >
                  {sending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSend size={20} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit vCard Modal */}
      {showVCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                🎴 Customize vCard Contact Card & Profile Photo
              </h3>
              <button onClick={() => setShowVCardModal(false)} className="p-1 text-neutral-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={vcardFields.name}
                  onChange={e => setVCardFields(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Full Name"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1">Job Title / Role</label>
                <input
                  type="text"
                  value={vcardFields.title}
                  onChange={e => setVCardFields(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Senior Sales Specialist"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1">Direct Phone Number</label>
                <input
                  type="text"
                  value={vcardFields.phone}
                  onChange={e => setVCardFields(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g. (800) 555-0199"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1">Email Address</label>
                <input
                  type="email"
                  value={vcardFields.email}
                  onChange={e => setVCardFields(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="e.g. rep@company.com"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1">Company / Organization</label>
                <input
                  type="text"
                  value={vcardFields.company}
                  onChange={e => setVCardFields(prev => ({ ...prev, company: e.target.value }))}
                  placeholder="e.g. Titan Diamond USA"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1">Website URL</label>
                <input
                  type="text"
                  value={vcardFields.website}
                  onChange={e => setVCardFields(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="e.g. https://tdusales.com"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Profile Photo Section */}
            <div className="p-3 bg-black/40 rounded-xl border border-white/10 space-y-2">
              <label className="text-[10px] font-bold text-neutral-400 block">Profile Photo Image URL or Upload</label>
              <div className="flex gap-2 items-center">
                {vcardFields.photoUrl ? (
                  <img src={vcardFields.photoUrl} alt="Preview" className="w-10 h-10 rounded-full object-cover border border-orange-500/50 flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500 font-bold text-xs flex-shrink-0">📷</div>
                )}
                <input
                  type="text"
                  value={vcardFields.photoUrl}
                  onChange={e => setVCardFields(prev => ({ ...prev, photoUrl: e.target.value }))}
                  placeholder="https://domain.com/photo.jpg or paste base64..."
                  className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowVCardModal(false)}
                className="px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl hover:bg-orange-500 transition-colors shadow-md"
              >
                Done / Apply to SMS
              </button>
            </div>
          </div>
        </div>
      )}

      {slideoutAccountId && (
        <AccountSlideout 
          accountId={slideoutAccountId} 
          onClose={() => setSlideoutAccountId(null)} 
        />
      )}
    </div>
  )
}
