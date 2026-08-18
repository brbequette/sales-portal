"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { FiClock, FiAlertCircle, FiCheckCircle, FiXCircle, FiMapPin, FiAlertTriangle, FiLock, FiPlay, FiSquare, FiRefreshCw } from "react-icons/fi"
import { calculateHours, formatHours } from "@/lib/timeclock-utils"
import { toast } from 'react-hot-toast'

interface TimeEntry {
  id: string
  date: string
  clockIn: string
  clockOut: string | null
  lastActivity: string
  manualClockIn: string | null
  manualClockOut: string | null
  changeRequests: any[]
  inactivityPeriods?: any[]
  locationStatus?: string
  clockInLocation?: string | null
  active?: boolean
}

export default function UserTimeclockPage() {
  const { zohoContext: currentUser } = useZoho()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [clockActionLoading, setClockActionLoading] = useState(false)
  
  const [showChangeModal, setShowChangeModal] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)
  const [changeReason, setChangeReason] = useState("Forgot to log in")
  const [changeNotes, setChangeNotes] = useState("")
  const [newClockIn, setNewClockIn] = useState("")
  const [newClockOut, setNewClockOut] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const fetchEntries = async () => {
    if (!currentUser?.id && !currentUser?.email) return
    try {
      const res = await fetch(`/api/timeclock/get-entries?userId=${currentUser.id || ''}&email=${encodeURIComponent(currentUser.email || '')}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success) {
        setEntries(data.entries || [])
      }
    } catch (err) {
      console.error("Failed to fetch time entries", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries()
  }, [currentUser])

  // Determine current active shift (today's shift without a clockOut)
  const activeEntry = useMemo(() => {
    return entries.find(e => !e.clockOut && !e.manualClockOut) || null
  }, [entries])

  // Live timer for active shift
  useEffect(() => {
    if (!activeEntry) {
      setElapsedSeconds(0)
      return
    }

    const clockInTime = new Date(activeEntry.manualClockIn || activeEntry.clockIn).getTime()

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - clockInTime) / 1000))
      setElapsedSeconds(diff)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [activeEntry])

  const formatElapsed = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60
    return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
  }

  const handleToggleClock = async (action: 'clockIn' | 'clockOut') => {
    if (!currentUser?.id && !currentUser?.email) {
      toast.error("User session missing")
      return
    }

    setClockActionLoading(true)

    // Request GPS location if available
    let latitude: number | null = null
    let longitude: number | null = null
    let accuracy: number | null = null

    try {
      if ('geolocation' in navigator) {
        const pos: any = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000, enableHighAccuracy: true })
        }).catch(() => null)

        if (pos?.coords) {
          latitude = pos.coords.latitude
          longitude = pos.coords.longitude
          accuracy = pos.coords.accuracy
        }
      }
    } catch {}

    try {
      const res = await fetch("/api/timeclock/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          email: currentUser.email,
          name: currentUser.name,
          action,
          latitude,
          longitude,
          accuracy,
          source: 'manual'
        })
      })

      const data = await res.json()
      if (data.success) {
        if (action === 'clockIn') {
          toast.success("Clocked in successfully!")
        } else {
          toast.success("Clocked out successfully!")
        }
        await fetchEntries()
      } else {
        toast.error(data.error || "Failed to toggle timeclock")
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Network error toggling timeclock")
    } finally {
      setClockActionLoading(false)
    }
  }

  const handleOpenChangeModal = (entry: TimeEntry) => {
    setSelectedEntry(entry)
    const effectiveIn = entry.manualClockIn || entry.clockIn
    const toLocalString = (dateStr: string) => {
      const d = new Date(dateStr)
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
      return d.toISOString().slice(0, 16)
    }
    setNewClockIn(toLocalString(effectiveIn))
    
    let effectiveOut = entry.manualClockOut || entry.clockOut || entry.lastActivity
    setNewClockOut(toLocalString(effectiveOut))
    
    setChangeReason("Forgot to log in")
    setChangeNotes("")
    setShowChangeModal(true)
  }

  const handleOpenMissingShiftModal = () => {
    setSelectedEntry(null)
    setNewClockIn("")
    setNewClockOut("")
    setChangeReason("Forgot to log in")
    setChangeNotes("")
    setShowChangeModal(true)
  }

  const handleSubmitChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser?.id && !currentUser?.email) return
    if (!selectedEntry && (!newClockIn || !newClockOut)) {
      toast.error("Clock In and Clock Out are required to report a missing shift")
      return
    }
    
    setSubmitting(true)
    try {
      const res = await fetch("/api/timeclock/submit-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeEntryId: selectedEntry ? selectedEntry.id : null,
          userId: currentUser.id,
          userEmail: currentUser.email,
          requestedClockIn: newClockIn ? new Date(newClockIn).toISOString() : null,
          requestedClockOut: newClockOut ? new Date(newClockOut).toISOString() : null,
          reason: changeReason,
          notes: changeNotes
        })
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Time change request submitted!")
        await fetchEntries()
        setShowChangeModal(false)
      } else {
        toast.error("Failed to submit request: " + data.error)
      }
    } catch (err) {
      console.error(err)
      toast.error("Error submitting change request")
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "--"
    return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  }

  const getWeeklyHours = () => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(today.getFullYear(), today.getMonth(), diff)
    monday.setHours(0, 0, 0, 0)
    
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    let total = 0
    entries.forEach(entry => {
      const [y, m, d] = entry.date.split("-").map(Number)
      const entryDate = new Date(y, m - 1, d)
      if (entryDate >= monday && entryDate <= sunday) {
        total += calculateHours(entry)
      }
    })
    return total.toFixed(2)
  }

  const groupedEntries = useMemo(() => {
    const groups: Record<string, { weekStart: Date, weekEnd: Date, totalHours: number, entries: TimeEntry[] }> = {}
    
    entries.forEach(entry => {
      const [y, m, d] = entry.date.split("-").map(Number)
      const entryDate = new Date(y, m - 1, d)
      
      const day = entryDate.getDay()
      const diff = entryDate.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(entryDate.getFullYear(), entryDate.getMonth(), diff)
      monday.setHours(0, 0, 0, 0)
      
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      
      const weekKey = monday.toISOString()
      
      if (!groups[weekKey]) {
        groups[weekKey] = {
          weekStart: monday,
          weekEnd: sunday,
          totalHours: 0,
          entries: []
        }
      }
      
      groups[weekKey].entries.push(entry)
      groups[weekKey].totalHours += calculateHours(entry)
    })
    
    const sortedGroups = Object.values(groups).sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
    sortedGroups.forEach(group => {
       group.entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    })

    return sortedGroups
  }, [entries])

  return (
    <div className="page-content">

      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
            <FiClock className="text-emerald-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Employee Timeclock</h1>
            <p className="page-subtitle">Clock in/out, monitor live shift hours & manage timesheets</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenMissingShiftModal}
            className="td-btn td-btn-ghost td-btn-sm"
          >
            + Report Missing Shift
          </button>
          <div className="glass-panel border border-emerald-500/20 rounded-xl px-4 py-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">This Week</div>
            <div className="text-xl font-black text-emerald-400">{getWeeklyHours()}h</div>
          </div>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-4">

        {/* Live Clock-In / Clock-Out Card */}
        <div className="modern-card p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                  activeEntry
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 animate-pulse"
                    : "bg-neutral-800 text-neutral-400 border border-white/10"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${activeEntry ? "bg-emerald-400" : "bg-neutral-500"}`} />
                  {activeEntry ? "Clocked In (Active Shift)" : "Clocked Out"}
                </span>
                {activeEntry?.clockInLocation && (
                  <span className="text-xs text-neutral-400 flex items-center gap-1">
                    <FiMapPin className="text-emerald-400" size={12} /> {activeEntry.clockInLocation}
                  </span>
                )}
              </div>
              {activeEntry ? (
                <div>
                  <div className="text-3xl sm:text-4xl font-black tracking-tight text-white font-mono">
                    {formatElapsed(elapsedSeconds)}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    Clocked in at <span className="text-emerald-400 font-semibold">{formatTime(activeEntry.manualClockIn || activeEntry.clockIn)}</span> on {activeEntry.date}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-xl font-bold text-neutral-300">Ready to start your shift?</div>
                  <p className="text-xs text-neutral-500 mt-1">Click to record your clock-in time and GPS location.</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {activeEntry ? (
                <button
                  onClick={() => handleToggleClock("clockOut")}
                  disabled={clockActionLoading}
                  className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-base font-bold shadow-lg shadow-rose-900/30 transition-all flex items-center gap-3 disabled:opacity-50 w-full sm:w-auto justify-center"
                >
                  {clockActionLoading ? <FiRefreshCw className="animate-spin h-5 w-5" /> : <FiSquare className="h-5 w-5 fill-current" />}
                  Clock Out
                </button>
              ) : (
                <button
                  onClick={() => handleToggleClock("clockIn")}
                  disabled={clockActionLoading}
                  className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-base font-bold shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-3 disabled:opacity-50 w-full sm:w-auto justify-center"
                >
                  {clockActionLoading ? <FiRefreshCw className="animate-spin h-5 w-5" /> : <FiPlay className="h-5 w-5 fill-current" />}
                  Clock In Now
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Timesheet Table */}
        <div className="modern-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
            <FiClock size={14} className="text-neutral-500" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Timesheet History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="td-table">
              <thead>
                <tr>
                  <th className="td-th hidden sm:table-cell">Date</th>
                  <th className="td-th">Clock In</th>
                  <th className="td-th hidden md:table-cell">Clock Out</th>
                  <th className="td-th">Total Hours</th>
                  <th className="td-th hidden md:table-cell">Inactivity</th>
                  <th className="td-th">Status / Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-neutral-500">Loading your timesheet...</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-neutral-500">No timeclock data found.</td></tr>
                ) : (
                  groupedEntries.map(group => (
                    <React.Fragment key={group.weekStart.toISOString()}>
                      {/* Week Group Header Row */}
                      <tr className="bg-neutral-950/60 border-y border-white/[0.06]">
                        <td colSpan={6} className="px-4 py-2.5">
                          <div className="flex items-center justify-between w-full font-semibold text-emerald-400 text-xs">
                            <span>Week of {group.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {group.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                            <span className="bg-white/8 px-2.5 py-1 rounded text-[10px] tracking-widest font-bold text-white">TOTAL: {group.totalHours.toFixed(2)}H</span>
                          </div>
                        </td>
                      </tr>
                      {group.entries.map(entry => {
                        const effectiveIn = entry.manualClockIn || entry.clockIn
                        const effectiveOut = entry.manualClockOut || entry.clockOut
                        const isCurrentActive = !effectiveOut
                        const pendingRequest = entry.changeRequests?.find(r => r.status === "PENDING")
                        const rejectedRequest = entry.changeRequests?.find(r => r.status === "REJECTED")

                        return (
                          <React.Fragment key={entry.id}>
                            <tr className="hover:bg-white/[0.03] transition-colors">
                              <td className="td-td hidden sm:table-cell font-medium text-white">{entry.date}</td>
                              <td className="td-td">
                                <span className="sm:hidden text-[10px] text-neutral-600 block mb-0.5">{entry.date}</span>
                                {formatTime(effectiveIn)}
                                {entry.manualClockIn && <span className="ml-1.5 text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">Edited</span>}
                              </td>
                              <td className="td-td hidden md:table-cell">
                                {isCurrentActive ? (
                                  <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Active Now</span>
                                ) : (
                                  <>
                                    {formatTime(effectiveOut)}
                                    {entry.manualClockOut && <span className="ml-1.5 text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">Edited</span>}
                                  </>
                                )}
                              </td>
                              <td className="td-td font-bold text-emerald-400">
                                <span className="md:hidden text-[10px] text-neutral-500 block mb-0.5">{formatTime(effectiveIn)} – {formatTime(effectiveOut)}</span>
                                {calculateHours(entry).toFixed(2)}h
                                {entry.locationStatus === "VERIFIED" && (
                                  <span className="ml-1.5 text-[9px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold">
                                    <FiMapPin size={9} /> {entry.clockInLocation || "On-Site"}
                                  </span>
                                )}
                                {entry.locationStatus === "OUT_OF_RANGE" && (
                                  <span className="ml-1.5 text-[9px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold">
                                    <FiAlertTriangle size={9} /> Off-Site
                                  </span>
                                )}
                                {entry.locationStatus === "DENIED" && (
                                  <span className="ml-1.5 text-[9px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-neutral-500/15 text-neutral-400 font-bold">
                                    <FiLock size={9} /> No GPS
                                  </span>
                                )}
                              </td>
                              <td className="td-td hidden md:table-cell">
                                {entry.inactivityPeriods && Array.isArray(entry.inactivityPeriods) && entry.inactivityPeriods.length > 0 ? (
                                  <div className="flex flex-col gap-1">
                                    {entry.inactivityPeriods.map((lapse: any, idx: number) => (
                                      <div key={lapse.id || idx} className="flex items-center gap-1.5 text-xs text-red-400">
                                        <FiAlertCircle className="shrink-0" size={11} />
                                        <span>{formatTime(lapse.start)} – {formatTime(lapse.end)} ({lapse.durationMinutes}m)</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-neutral-700">--</span>
                                )}
                              </td>
                              <td className="td-td">
                                {pendingRequest ? (
                                  <span className="flex items-center gap-1.5 text-amber-500 text-xs font-semibold">
                                    <FiAlertCircle size={13} /> Change Pending
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    {rejectedRequest && (
                                      <span className="text-red-400" title="Previous change request was rejected">
                                        <FiXCircle size={13} />
                                      </span>
                                    )}
                                    <button
                                      onClick={() => handleOpenChangeModal(entry)}
                                      className="td-btn td-btn-ghost td-btn-sm"
                                    >
                                      Request Change
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          </React.Fragment>
                        )
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Change Request Modal */}
      {showChangeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowChangeModal(false)} />
          <div className="relative w-full max-w-md glass-panel border border-white/10 rounded-2xl flex flex-col shadow-2xl text-white z-[9999] p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-1">
              {selectedEntry ? "Request Time Change" : "Report Missing Shift"}
            </h3>
            <p className="text-sm text-neutral-400 mb-5">
              {selectedEntry ? `For date: ${selectedEntry.date}` : "Enter the actual times you worked."}
            </p>

            <form onSubmit={handleSubmitChange} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Clock In Time</label>
                <input
                  type="datetime-local"
                  value={newClockIn}
                  onChange={e => setNewClockIn(e.target.value)}
                  className="td-input w-full [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Clock Out Time</label>
                <input
                  type="datetime-local"
                  value={newClockOut}
                  onChange={e => setNewClockOut(e.target.value)}
                  className="td-input w-full [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Reason</label>
                <select
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  className="td-select w-full"
                >
                  <option value="Forgot to log in">Forgot to log in</option>
                  <option value="Forgot to log out">Forgot to log out</option>
                  <option value="Worked outside system">Worked outside system</option>
                  <option value="System error">System error</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Notes (Optional)</label>
                <textarea
                  value={changeNotes}
                  onChange={e => setChangeNotes(e.target.value)}
                  placeholder="Provide any additional context..."
                  rows={3}
                  className="td-input w-full resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-white/8">
                <button type="button" onClick={() => setShowChangeModal(false)} className="td-btn td-btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="td-btn td-btn-primary disabled:opacity-50">
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
