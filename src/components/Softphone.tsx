"use client"

import React, { useState, useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { FiPhone, FiMessageSquare, FiClock, FiX, FiMinus, FiPhoneCall, FiPhoneOff, FiSave, FiSearch, FiSend } from "react-icons/fi"

export default function Softphone() {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"dialer" | "sms" | "recent">("dialer")
  
  // Dialer State
  const [dialNumber, setDialNumber] = useState("")
  const [callState, setCallState] = useState<"idle" | "calling" | "connected" | "wrapup">("idle")
  const [callDuration, setCallDuration] = useState(0)
  const [callNotes, setCallNotes] = useState("")
  const [callStatus, setCallStatus] = useState("completed")
  const [currentCallId, setCurrentCallId] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [contextAccountName, setContextAccountName] = useState<string | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // SMS State
  const [smsMessages, setSmsMessages] = useState<any[]>([])
  const [smsInput, setSmsInput] = useState("")
  const [isSendingSms, setIsSendingSms] = useState(false)
  const smsEndRef = useRef<HTMLDivElement>(null)

  // Context State (If we are on an account page, we want to know the account ID)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [contextAccountId, setContextAccountId] = useState<string | null>(null)

  // Try to infer the Account ID from the URL context
  useEffect(() => {
    if (!pathname) return
    let accId = null
    
    // E.g. /account?id=cls...
    if (pathname.includes("/account") && searchParams?.get("id")) {
      accId = searchParams.get("id")
    }
    // E.g. /collections (might need to select row context, but for now we leave it null)
    
    setContextAccountId(accId)
  }, [pathname, searchParams])

  // Call Timer
  useEffect(() => {
    if (callState === "connected") {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callState])

  useEffect(() => {
    if (contextAccountId) {
      fetchSmsHistory(contextAccountId)
    }
  }, [contextAccountId])

  useEffect(() => {
    smsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [smsMessages])

  // Search Debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    const delay = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(`/api/global-search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        if (data.success && data.results?.accounts) {
          setSearchResults(data.results.accounts)
        }
      } catch (e) { }
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(delay)
  }, [searchQuery])

  // Click outside search
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelectAccount = async (acc: any) => {
    setContextAccountId(acc.id)
    setContextAccountName(acc.name)
    setSearchQuery("")
    setSearchResults([])

    // Fetch account details to get phone number
    try {
      const res = await fetch(`/api/get-account-details?id=${acc.id}`)
      const data = await res.json()
      if (data.success && data.account.contacts?.length > 0) {
        const contact = data.account.contacts.find((c:any) => c.isPrimary) || data.account.contacts[0]
        const num = contact.mobilePhone || contact.phone
        if (num) {
          setDialNumber(num.replace(/[^\d+]/g, ''))
        }
      }
    } catch (e) {}
  }

  const fetchSmsHistory = async (accountId: string) => {
    try {
      const res = await fetch(`/api/messages/${accountId}`)
      const data = await res.json()
      if (data.success) {
        setSmsMessages(data.messages)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleSendSms = async () => {
    if (!smsInput.trim() || !contextAccountId) return

    // Guess fromNumber or default
    const lastOurMsg = [...smsMessages].reverse().find(m => m.direction === 'OUTBOUND')
    const fromNumber = lastOurMsg?.fromNumber || '+14804702577' // Default fallback

    try {
      setIsSendingSms(true)
      const res = await fetch(`/api/messages/${contextAccountId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: smsInput, fromNumber })
      })
      const data = await res.json()
      if (data.success) {
        setSmsInput('')
        fetchSmsHistory(contextAccountId)
      } else {
        alert('Error sending message: ' + data.error)
      }
    } catch (e) {
      alert('Error sending message.')
    } finally {
      setIsSendingSms(false)
    }
  }

  // Global Event Listener
  useEffect(() => {
    const handleOpenSoftphone = (e: any) => {
      setIsOpen(true)
      if (e.detail?.number) {
        setDialNumber(e.detail.number)
      }
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab)
      }
    }
    
    window.addEventListener("open-softphone", handleOpenSoftphone)
    return () => window.removeEventListener("open-softphone", handleOpenSoftphone)
  }, [])

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const handleDialClick = (digit: string) => {
    setDialNumber((prev) => prev + digit)
  }

  const handleBackspace = () => {
    setDialNumber((prev) => prev.slice(0, -1))
  }

  const handleInitiateCall = async () => {
    if (!dialNumber) return
    setCallState("calling")
    
    try {
      const res = await fetch("/api/calls/make", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromNumber: "System",
          toNumber: dialNumber,
          accountId: contextAccountId
        })
      })
      
      const data = await res.json()
      if (data.success) {
        setCallState("connected")
        setCurrentCallId(data.zohoCallId || `z_ext_${Date.now()}`)
      } else {
        alert("Failed to initiate call: " + data.error)
        setCallState("idle")
      }
    } catch (err) {
      alert("Error initiating call")
      setCallState("idle")
    }
  }

  const handleEndCall = () => {
    setCallState("wrapup")
  }

  const handleSaveWrapup = async () => {
    if (!contextAccountId && !confirm("No Account context detected. Save log anyway?")) {
       return
    }

    try {
      await fetch("/api/calls/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: contextAccountId || "unknown", // Normally require a real ID
          fromNumber: "System",
          toNumber: dialNumber,
          direction: "OUTBOUND",
          duration: callDuration,
          status: callStatus,
          notes: callNotes,
          zohoCallId: currentCallId
        })
      })
      
      // Reset state
      setCallState("idle")
      setDialNumber("")
      setCallDuration(0)
      setCallNotes("")
      setCurrentCallId(null)
      
    } catch (err) {
      alert("Failed to save call log.")
    }
  }

  if (!isOpen) {
    return (
      <div
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 bg-[var(--primary)] text-[var(--primary-foreground)] p-4 rounded-full shadow-2xl shadow-[rgba(var(--primary-rgb),0.3)] cursor-pointer hover:bg-[var(--primary-hover)] transition-all z-50 flex items-center justify-center"
        onClick={() => setIsOpen(true)}
        style={{ width: "60px", height: "60px" }}
      >
        <FiPhone size={24} />
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 sm:left-auto sm:right-6 w-auto sm:w-80 bg-[var(--surface)] border border-[var(--border)] rounded-t-xl shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300" style={{ height: "650px", maxHeight: "85dvh" }}>
      {/* Header */}
      <div className="bg-[var(--surface-2)] p-3 flex flex-col border-b border-[var(--border)]">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-white font-medium text-sm">Communications Hub</span>
          </div>
          <div className="flex items-center text-[var(--muted)] gap-3">
            <button onClick={() => setIsOpen(false)} className="hover:text-white transition-colors">
              <FiMinus />
            </button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="relative" ref={searchRef}>
          <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 focus-within:border-[var(--primary)] transition-colors">
            <FiSearch className="text-[var(--muted-2)] mr-2" />
            <input 
              type="text" 
              placeholder="Search Accounts..." 
              className="bg-transparent text-sm text-white w-full outline-none placeholder:text-[var(--muted-2)]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if (searchQuery.length >= 2 && searchResults.length === 0) setSearchQuery(searchQuery + ' ') }}
            />
          </div>
          
          {/* Search Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-md shadow-xl z-50 max-h-48 overflow-y-auto">
              {searchResults.map((acc: any) => (
                <div 
                  key={acc.id} 
                  className="p-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-3)] cursor-pointer"
                  onClick={() => handleSelectAccount(acc)}
                >
                  <div className="text-white text-sm">{acc.name}</div>
                  {acc.industry && <div className="text-xs text-[var(--muted)]">{acc.industry}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] bg-[var(--surface)]">
        <button 
          onClick={() => setActiveTab("dialer")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "dialer" ? "text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--surface-2)]" : "text-[var(--muted)] hover:text-neutral-300"}`}
        >
          <FiPhone /> Keypad
        </button>
        <button 
          onClick={() => setActiveTab("sms")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "sms" ? "text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--surface-2)]" : "text-[var(--muted)] hover:text-neutral-300"}`}
        >
          <FiMessageSquare /> SMS
        </button>
        <button 
          onClick={() => setActiveTab("recent")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "recent" ? "text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--surface-2)]" : "text-[var(--muted)] hover:text-neutral-300"}`}
        >
          <FiClock /> Recent
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 bg-[var(--background)] p-4 flex flex-col relative overflow-y-auto overflow-x-hidden scrollbar-thin">
        
        {activeTab === "dialer" && (
          <div className="flex flex-col h-full min-h-[500px]">
            {callState === "wrapup" ? (
              <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-white font-medium mb-4">Call Wrap-up</h3>
                <div className="mb-4">
                  <label className="text-xs text-[var(--muted)] mb-1 block">Outcome</label>
                  <select 
                    value={callStatus}
                    onChange={(e) => setCallStatus(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded p-2 text-sm text-white"
                  >
                    <option value="completed">Completed</option>
                    <option value="voicemail">Left Voicemail</option>
                    <option value="no_answer">No Answer</option>
                    <option value="busy">Busy</option>
                    <option value="wrong_number">Wrong Number</option>
                  </select>
                </div>
                <div className="mb-4 flex-1 flex flex-col">
                  <label className="text-xs text-[var(--muted)] mb-1 block">Notes</label>
                  <textarea 
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded p-2 text-sm text-white flex-1 resize-none"
                    placeholder="Type call notes here..."
                  ></textarea>
                </div>
                <button 
                  onClick={handleSaveWrapup}
                  className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-foreground)] py-2 rounded font-bold flex items-center justify-center gap-2"
                >
                  <FiSave /> Save Log
                </button>
              </div>
            ) : (
              <>
                {/* Number Display */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6 flex flex-col items-center justify-center min-h-24">
                  <div className="text-3xl text-white font-light tracking-wider overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">
                    {dialNumber || "..."}
                  </div>
                  {contextAccountName ? (
                    <div className="text-xs text-[var(--primary)] mt-2 flex items-center gap-1 font-medium">
                      <span>{contextAccountName}</span>
                    </div>
                  ) : contextAccountId ? (
                    <div className="text-xs text-[var(--primary)] mt-2 flex items-center gap-1">
                      <span>Linked Context Detected</span>
                    </div>
                  ) : null}
                  {callState === "connected" && (
                    <div className="text-emerald-400 font-mono mt-2 flex items-center gap-2 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      {formatDuration(callDuration)}
                    </div>
                  )}
                  {callState === "calling" && (
                    <div className="text-[var(--primary)] font-mono mt-2 animate-pulse">
                      Calling...
                    </div>
                  )}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-3 mb-6 px-4">
                  {['1','2','3','4','5','6','7','8','9','*','0','#'].map((digit) => (
                    <button 
                      key={digit}
                      onClick={() => handleDialClick(digit)}
                      className="aspect-square rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-white text-xl font-light flex items-center justify-center transition-colors active:bg-[var(--surface-3)]"
                    >
                      {digit}
                    </button>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-center gap-6 mt-auto pb-6">
                  {callState === "idle" && (
                    <button 
                      onClick={handleInitiateCall}
                      disabled={!dialNumber}
                      className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-transform active:scale-95 disabled:opacity-50"
                    >
                      <FiPhoneCall size={24} />
                    </button>
                  )}
                  {(callState === "calling" || callState === "connected") && (
                    <button 
                      onClick={handleEndCall}
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/20 transition-transform active:scale-95"
                    >
                      <FiPhoneOff size={24} />
                    </button>
                  )}
                  {callState === "idle" && (
                    <button 
                      onClick={handleBackspace}
                      disabled={!dialNumber}
                      className="w-16 h-16 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--muted)] flex items-center justify-center disabled:opacity-50"
                    >
                      <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" height="24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "sms" && (
          <div className="flex flex-col h-full relative">
            {!contextAccountId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted-2)] text-sm text-center">
                <FiSearch size={32} className="mb-4 text-[var(--muted-2)]" />
                <p>Search and select an account above to text them.</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto mb-14 scrollbar-thin pr-2 flex flex-col gap-3">
                  {smsMessages.length === 0 ? (
                    <div className="text-center text-[var(--muted-2)] text-xs py-4">No message history found.</div>
                  ) : (
                    smsMessages.map((msg, i) => {
                      const isMe = msg.direction === 'OUTBOUND'
                      return (
                        <div key={msg.id || i} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end' : 'self-start'}`}>
                          <div className={`p-3 text-sm rounded-lg ${isMe ? 'bg-[var(--primary)] text-[var(--primary-foreground)] rounded-br-none' : 'bg-[var(--surface-2)] text-neutral-200 border border-[var(--border)] rounded-bl-none'}`}>
                            {msg.body}
                          </div>
                          <div className={`text-[10px] text-[var(--muted-2)] mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                            {new Date(msg.createdAt).toLocaleDateString()} {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={smsEndRef} />
                </div>
                
                {/* SMS Input */}
                <div className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] pt-2 flex items-end gap-2">
                  <textarea 
                    value={smsInput}
                    onChange={(e) => setSmsInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendSms()
                      }
                    }}
                    placeholder="Type message..."
                    className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2 text-sm text-white resize-none max-h-24 scrollbar-thin"
                    rows={1}
                  />
                  <button 
                    onClick={handleSendSms}
                    disabled={isSendingSms || !smsInput.trim()}
                    className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50 text-[var(--primary-foreground)] p-2.5 rounded-lg flex-shrink-0 transition-colors"
                  >
                    <FiSend />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "recent" && (
          <div className="flex flex-col h-full overflow-y-auto">
             <div className="text-xs text-[var(--muted-2)] text-center py-8">
               Recent calls will appear here.
             </div>
          </div>
        )}

      </div>
    </div>
  )
}
