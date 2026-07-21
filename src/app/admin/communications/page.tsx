"use client"

import React, { useEffect, useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { FiPhoneCall, FiMessageSquare, FiSettings, FiChevronDown, FiChevronUp, FiSearch, FiFilter, FiUser, FiClock, FiCheck, FiX, FiCornerUpRight, FiCornerDownLeft, FiDatabase } from "react-icons/fi"
import { toast } from 'react-hot-toast';

export default function CommunicationsDashboard() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()
  
  const [unifiedLogs, setUnifiedLogs] = useState<any[]>([])
  const [zohoNumbers, setZohoNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingNumbers, setSavingNumbers] = useState(false)
  const [syncingVoice, setSyncingVoice] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Filters
  const [searchAccount, setSearchAccount] = useState("")
  const [searchAgent, setSearchAgent] = useState("")
  const [typeFilter, setTypeFilter] = useState<"ALL" | "CALL" | "SMS">("ALL")
  const [directionFilter, setDirectionFilter] = useState<"ALL" | "INBOUND" | "OUTBOUND">("ALL")

  useEffect(() => {
    const role = currentUser?.role?.toUpperCase() || ""

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/admin/communications?role=${encodeURIComponent(role)}`)
        const data = await res.json()
        if (data.success) {
          setUnifiedLogs(data.unifiedLogs || [])
        }

        const numRes = await fetch('/api/manage-zoho-numbers?action=list')
        const numData = await numRes.json()
        if (numData.success) {
          setZohoNumbers(numData.numbers || [])
        }
      } catch (err) {
        console.error("Failed to load communications", err)
      } finally {
        setLoading(false)
      }
    }
    if (isInitialized && currentUser) {
      fetchData()
    }
  }, [isInitialized, currentUser])

  const handleSaveNumbers = async () => {
    try {
      setSavingNumbers(true)
      const numRes = await fetch('/api/manage-zoho-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: zohoNumbers })
      })
      const numData = await numRes.json()

      if (numData.success) {
        toast.success('Numbers saved successfully!')
      } else {
        toast.error('Error saving numbers: ' + numData.error)
      }
    } catch (e) {
      console.error(e)
      toast.error('Error saving numbers.')
    } finally {
      setSavingNumbers(false)
    }
  }

  // Filter Logic
  const filteredLogs = unifiedLogs.filter(log => {
    if (typeFilter !== "ALL" && log.type !== typeFilter) return false
    if (directionFilter !== "ALL" && log.direction?.toUpperCase() !== directionFilter) return false
    if (searchAccount) {
      const accName = log.account?.name?.toLowerCase() || ""
      if (!accName.includes(searchAccount.toLowerCase())) return false
    }
    if (searchAgent) {
      const agentName = log.author?.name?.toLowerCase() || log.author?.email?.toLowerCase() || ""
      if (!agentName.includes(searchAgent.toLowerCase())) return false
    }
    return true
  })

  if (loading) {
    return <div className="p-8 text-neutral-400 flex justify-center items-center h-full">Loading communications...</div>
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full bg-[#0a0a0a]">
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto safe-bottom max-w-6xl mx-auto w-full">
        
        {/* Header & Settings Toggle */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <FiMessageSquare className="text-indigo-500" />
              Communications Center
            </h1>
            <p className="text-sm text-neutral-400 mt-1">Review unified history of calls and SMS messages</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={async () => {
                setSyncingVoice(true)
                try {
                  const res = await fetch('/api/admin/communications/sync-voice', { method: 'POST' })
                  const data = await res.json()
                  if (data.success) {
                    toast.success(`Synced ${data.syncedCount} calls!`)
                    window.location.reload()
                  } else {
                    toast.error('Sync error: ' + data.error)
                  }
                } catch (e: any) {
                  toast.error('Sync failed: ' + e.message)
                }
                setSyncingVoice(false)
              }}
              disabled={syncingVoice}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
            >
              <FiDatabase size={16} className={syncingVoice ? "animate-spin" : ""} />
              {syncingVoice ? "Syncing..." : "Sync Voice Logs"}
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 glass-panel hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-neutral-300 border border-white/10 rounded-lg transition-colors font-medium text-sm"
            >
              <FiSettings size={16} />
              Phone Numbers
              {showSettings ? <FiChevronUp /> : <FiChevronDown />}
            </button>
          </div>
        </div>

        {/* Settings Panel (Collapsible) */}
        {showSettings && (
          <div className="glass-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-top-4 fade-in duration-200">
            <div className="bg-black/20 px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Zoho Phone Numbers</h2>
                <p className="text-sm text-neutral-400">Manage phone numbers used for voice and SMS routing</p>
              </div>
              <button 
                onClick={() => setZohoNumbers([...zohoNumbers, { number: "", name: "", isDefault: false, assignedUserIds: [] }])}
                className="text-xs font-bold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                + Add Number
              </button>
            </div>
            <div className="p-6 space-y-3">
              {zohoNumbers.map((num, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-black/40 p-3 rounded-lg border border-white/10">
                  <div className="flex-1 w-full space-y-2">
                    <input 
                      type="text"
                      placeholder="Phone Number (e.g. +18005550199)"
                      value={num.number}
                      onChange={(e) => {
                        const newNums = [...zohoNumbers]
                        newNums[i].number = e.target.value
                        setZohoNumbers(newNums)
                      }}
                      className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    <input 
                      type="text"
                      placeholder="Friendly Name (e.g. Main Line)"
                      value={num.name}
                      onChange={(e) => {
                        const newNums = [...zohoNumbers]
                        newNums[i].name = e.target.value
                        setZohoNumbers(newNums)
                      }}
                      className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  <div className="flex items-center gap-4 shrink-0 mt-2 sm:mt-0 px-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-neutral-300 cursor-pointer">
                      <input 
                        type="radio"
                        name="default_zoho_number"
                        checked={num.isDefault}
                        onChange={() => {
                          const newNums = zohoNumbers.map((n, idx) => ({ ...n, isDefault: idx === i }))
                          setZohoNumbers(newNums)
                        }}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      Default
                    </label>
                    <button
                      onClick={() => setZohoNumbers(zohoNumbers.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-300 p-2 bg-red-500/10 rounded-md transition-colors"
                      title="Remove Number"
                    >
                      <FiX />
                    </button>
                  </div>
                </div>
              ))}
              {zohoNumbers.length === 0 && (
                <div className="text-center py-8 border border-dashed border-white/10 rounded-lg text-neutral-500 text-sm">
                  No Zoho numbers added yet.
                </div>
              )}
              
              <div className="flex justify-end pt-4 mt-2">
                <button 
                  onClick={handleSaveNumbers}
                  disabled={savingNumbers}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {savingNumbers ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="glass-panel/50 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4 shadow-sm">
          <div className="flex items-center gap-2 text-neutral-400 px-2 font-medium">
            <FiFilter /> Filters:
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input 
                type="text" 
                placeholder="Search Account..." 
                value={searchAccount}
                onChange={e => setSearchAccount(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="relative">
              <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input 
                type="text" 
                placeholder="Search Agent..." 
                value={searchAgent}
                onChange={e => setSearchAgent(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <select 
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none appearance-none"
            >
              <option value="ALL">All Types</option>
              <option value="CALL">Calls</option>
              <option value="SMS">SMS</option>
            </select>
            <select 
              value={directionFilter}
              onChange={e => setDirectionFilter(e.target.value as any)}
              className="bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none appearance-none"
            >
              <option value="ALL">All Directions</option>
              <option value="INBOUND">Inbound</option>
              <option value="OUTBOUND">Outbound</option>
            </select>
          </div>
        </div>

        {/* Unified Timeline Feed */}
        <div className="space-y-4">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-16 glass-panel/20 border border-white/10/50 rounded-xl text-neutral-500">
              <FiMessageSquare size={32} className="mx-auto mb-4 opacity-50" />
              <p>No communications found matching your filters.</p>
            </div>
          ) : (
            filteredLogs.map(log => {
              const isCall = log.type === 'CALL'
              const isInbound = log.direction?.toUpperCase() === 'INBOUND'
              
              return (
                <div key={log.id} className="group relative flex gap-4 p-4 rounded-xl border border-white/10/60 glass-panel/40 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/60 transition-colors">
                  {/* Icon Indicator */}
                  <div className="shrink-0 pt-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-inner ${
                      isCall 
                        ? isInbound ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-sky-500/10 border-sky-500/20 text-sky-400"
                        : isInbound ? "bg-purple-500/10 border-purple-500/20 text-purple-400" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                    }`}>
                      {isCall ? <FiPhoneCall size={18} /> : <FiMessageSquare size={18} />}
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white truncate">
                          {log.account?.name || "Unknown Account"}
                        </span>
                        <span className="text-neutral-500 text-xs px-2 py-0.5 rounded-full bg-neutral-800/50 border border-neutral-700/50 font-medium">
                          {isCall ? 'Voice Call' : 'Text Message'}
                        </span>
                        <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${isInbound ? 'text-emerald-400' : 'text-sky-400'}`}>
                          {isInbound ? <FiCornerDownLeft size={12} /> : <FiCornerUpRight size={12} />}
                          {isInbound ? 'Inbound' : 'Outbound'}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 flex items-center gap-1.5 shrink-0 bg-black/20 px-2.5 py-1 rounded-md border border-white/10">
                        <FiClock className="opacity-70" />
                        {new Date(log.timestamp).toLocaleString(undefined, { 
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                        })}
                      </div>
                    </div>

                    {/* Agent & Numbers */}
                    <div className="text-sm text-neutral-400 mb-3 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 text-neutral-300">
                        <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-white border border-neutral-700">
                          {log.author?.name ? log.author.name.charAt(0).toUpperCase() : "?"}
                        </div>
                        {log.author?.name || log.author?.email || "System"}
                      </span>
                      <span className="text-neutral-600">â€¢</span>
                      <span className="font-mono text-xs opacity-75">{log.fromNumber} &rarr; {log.toNumber}</span>
                    </div>

                    {/* Content / Notes block */}
                    {log.content ? (
                      <div className={`p-3 rounded-lg text-sm leading-relaxed border ${
                        isCall 
                          ? 'bg-black/20/80 border-white/10/80 text-neutral-300 italic' 
                          : 'bg-indigo-500/5 border-indigo-500/10 text-indigo-100'
                      }`}>
                        {isCall && <span className="font-semibold text-neutral-500 block mb-1 not-italic text-xs uppercase tracking-wider">Call Notes</span>}
                        {log.content}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-600 italic">No notes provided for this interaction.</div>
                    )}

                    {/* Status badges */}
                    {(isCall && log.duration != null) && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400">
                          {log.duration} sec
                        </span>
                        {log.status && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400">
                            {log.status}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}

