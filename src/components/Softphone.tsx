"use client"

import React, { useState, useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { FiPhone, FiMessageSquare, FiClock, FiX, FiMinus, FiPhoneCall, FiPhoneOff, FiSave } from "react-icons/fi"

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
          toNumber: dialNumber,
          accountId: contextAccountId
        })
      })
      
      const data = await res.json()
      if (data.success) {
        setCallState("connected")
        setCurrentCallId(data.zohoCallId)
      } else {
        alert("Call failed: " + data.error)
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
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-2xl cursor-pointer hover:bg-blue-700 transition-all z-50 flex items-center justify-center"
        onClick={() => setIsOpen(true)}
        style={{ width: "60px", height: "60px" }}
      >
        <FiPhone size={24} />
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 right-6 w-80 bg-slate-900 border border-slate-700 rounded-t-xl shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300" style={{ height: "650px", maxHeight: "85vh" }}>
      {/* Header */}
      <div className="bg-slate-800 p-3 flex justify-between items-center border-b border-slate-700 cursor-pointer" onClick={() => setIsOpen(false)}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-white font-medium text-sm">Zoho Voice</span>
        </div>
        <div className="flex items-center text-slate-400 gap-3">
          <FiMinus className="hover:text-white transition-colors" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900">
        <button 
          onClick={() => setActiveTab("dialer")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "dialer" ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800" : "text-slate-400 hover:text-slate-300"}`}
        >
          <FiPhone /> Keypad
        </button>
        <button 
          onClick={() => setActiveTab("sms")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "sms" ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800" : "text-slate-400 hover:text-slate-300"}`}
        >
          <FiMessageSquare /> SMS
        </button>
        <button 
          onClick={() => setActiveTab("recent")}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 ${activeTab === "recent" ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800" : "text-slate-400 hover:text-slate-300"}`}
        >
          <FiClock /> Recent
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 bg-slate-950 p-4 flex flex-col relative overflow-y-auto overflow-x-hidden scrollbar-thin">
        
        {activeTab === "dialer" && (
          <div className="flex flex-col h-full min-h-[500px]">
            {callState === "wrapup" ? (
              <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-white font-medium mb-4">Call Wrap-up</h3>
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Outcome</label>
                  <select 
                    value={callStatus}
                    onChange={(e) => setCallStatus(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white"
                  >
                    <option value="completed">Completed</option>
                    <option value="voicemail">Left Voicemail</option>
                    <option value="no_answer">No Answer</option>
                    <option value="busy">Busy</option>
                    <option value="wrong_number">Wrong Number</option>
                  </select>
                </div>
                <div className="mb-4 flex-1 flex flex-col">
                  <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                  <textarea 
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white flex-1 resize-none"
                    placeholder="Type call notes here..."
                  ></textarea>
                </div>
                <button 
                  onClick={handleSaveWrapup}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium flex items-center justify-center gap-2"
                >
                  <FiSave /> Save Log
                </button>
              </div>
            ) : (
              <>
                {/* Number Display */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-6 flex flex-col items-center justify-center min-h-24">
                  <div className="text-3xl text-white font-light tracking-wider overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">
                    {dialNumber || "..."}
                  </div>
                  {contextAccountId && (
                    <div className="text-xs text-blue-400 mt-2 flex items-center gap-1">
                      <span>Linked Context Detected</span>
                    </div>
                  )}
                  {callState === "connected" && (
                    <div className="text-emerald-400 font-mono mt-2 flex items-center gap-2 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      {formatDuration(callDuration)}
                    </div>
                  )}
                  {callState === "calling" && (
                    <div className="text-blue-400 font-mono mt-2 animate-pulse">
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
                      className="aspect-square rounded-full bg-slate-800 hover:bg-slate-700 text-white text-xl font-light flex items-center justify-center transition-colors active:bg-slate-600"
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
                      className="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center disabled:opacity-50"
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
          <div className="flex flex-col h-full items-center justify-center text-slate-500 text-sm text-center">
            <FiMessageSquare size={32} className="mb-4 text-slate-700" />
            <p>SMS interface goes here.</p>
            <p className="mt-2 text-xs">For full SMS capabilities, visit the main Messages page.</p>
          </div>
        )}

        {activeTab === "recent" && (
          <div className="flex flex-col h-full overflow-y-auto">
             <div className="text-xs text-slate-500 text-center py-8">
               Recent calls will appear here.
             </div>
          </div>
        )}

      </div>
    </div>
  )
}
