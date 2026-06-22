"use client"

import { useState, useEffect } from "react"
import { FiClock, FiCheckCircle, FiXCircle, FiEdit2 } from "react-icons/fi"

interface TimeChangeRequest {
  id: string
  requestedClockIn: string | null
  requestedClockOut: string | null
  reason: string
  notes: string | null
  status: string
  createdAt: string
}

interface TimeEntry {
  id: string
  date: string
  clockIn: string
  clockOut: string | null
  lastActivity: string
  manualClockIn: string | null
  manualClockOut: string | null
  user: { id: string; name: string; email: string }
  changeRequests: TimeChangeRequest[]
}

export default function AdminTimeclockPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)
  const [editIn, setEditIn] = useState("")
  const [editOut, setEditOut] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchEntries = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/timeclock/admin?month=${monthFilter}`)
      const data = await res.json()
      if (data.success) {
        setEntries(data.entries)
      }
    } catch (err) {
      console.error("Failed to fetch time entries", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries()
  }, [monthFilter])

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  }

  const toLocalString = (dateStr: string) => {
    const d = new Date(dateStr)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }

  const handleOpenEdit = (entry: TimeEntry) => {
    setSelectedEntry(entry)
    const effectiveIn = entry.manualClockIn || entry.clockIn
    setEditIn(toLocalString(effectiveIn))
    
    let effectiveOut = entry.manualClockOut || entry.clockOut || entry.lastActivity
    setEditOut(toLocalString(effectiveOut))
    setShowEditModal(true)
  }

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEntry) return
    setSaving(true)
    try {
      const res = await fetch("/api/timeclock/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MANUAL_OVERRIDE",
          timeEntryId: selectedEntry.id,
          manualClockIn: editIn ? new Date(editIn).toISOString() : null,
          manualClockOut: editOut ? new Date(editOut).toISOString() : null
        })
      })
      if ((await res.json()).success) {
        fetchEntries()
        setShowEditModal(false)
      }
    } catch (err) {
      console.error(err)
      alert("Error saving override")
    } finally {
      setSaving(false)
    }
  }

  const handleRequest = async (entry: TimeEntry, request: TimeChangeRequest, status: "APPROVED" | "REJECTED") => {
    try {
      const res = await fetch("/api/timeclock/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "HANDLE_REQUEST",
          requestId: request.id,
          status,
          timeEntryId: entry.id,
          manualClockIn: request.requestedClockIn,
          manualClockOut: request.requestedClockOut
        })
      })
      if ((await res.json()).success) {
        fetchEntries()
      }
    } catch (err) {
      console.error(err)
      alert("Error handling request")
    }
  }

  const calculateHours = (entry: TimeEntry) => {
    const start = new Date(entry.manualClockIn || entry.clockIn)
    let end: Date
    if (entry.manualClockOut) {
      end = new Date(entry.manualClockOut)
    } else if (entry.clockOut) {
      end = new Date(entry.clockOut)
    } else {
      end = new Date(entry.lastActivity)
      end.setMinutes(end.getMinutes() + 10)
    }
    
    const now = new Date()
    if (end > now) end = now
    
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    return Math.max(0, diffHours).toFixed(2)
  }

  // Group entries by user
  const userGroups = entries.reduce((acc, entry) => {
    const key = entry.user.id
    if (!acc[key]) acc[key] = { user: entry.user, entries: [], totalHours: 0 }
    acc[key].entries.push(entry)
    acc[key].totalHours += parseFloat(calculateHours(entry))
    return acc
  }, {} as Record<string, { user: any, entries: TimeEntry[], totalHours: number }>)

  return (
    <div className="p-4 lg:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <FiClock className="text-emerald-500" /> Team Timeclock
          </h1>
          <p className="text-neutral-400 mt-1">Manage employee hours and time change requests.</p>
        </div>
        <div>
          <input 
            type="month" 
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 invert-[1] hue-rotate-180"
            style={{ colorScheme: "dark" }}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-neutral-500 animate-pulse">Loading timesheets...</div>
      ) : Object.values(userGroups).length === 0 ? (
        <div className="text-neutral-500">No time entries found for this month.</div>
      ) : (
        <div className="space-y-6">
          {Object.values(userGroups).map(group => (
            <div key={group.user.id} className="bg-[#151618] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                <h3 className="font-bold text-lg text-white">{group.user.name || group.user.email}</h3>
                <div className="text-sm font-semibold text-emerald-400">
                  Total Month: {group.totalHours.toFixed(2)} hrs
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900/50 text-neutral-400 border-b border-white/5">
                    <tr>
                      <th className="px-6 py-3 font-semibold w-32">Date</th>
                      <th className="px-6 py-3 font-semibold">Clock In</th>
                      <th className="px-6 py-3 font-semibold">Clock Out</th>
                      <th className="px-6 py-3 font-semibold">Hours</th>
                      <th className="px-6 py-3 font-semibold">Requests</th>
                      <th className="px-6 py-3 font-semibold w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {group.entries.map(entry => {
                      const pendingRequests = entry.changeRequests.filter(r => r.status === "PENDING")
                      
                      return (
                        <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-3 font-medium">{entry.date}</td>
                          <td className="px-6 py-3">
                            {formatTime(entry.manualClockIn || entry.clockIn)}
                            {entry.manualClockIn && <span className="ml-1 text-[10px] text-emerald-500" title="Manually Edited">●</span>}
                          </td>
                          <td className="px-6 py-3">
                            {formatTime(entry.manualClockOut || entry.clockOut || entry.lastActivity)}
                            {entry.manualClockOut && <span className="ml-1 text-[10px] text-emerald-500" title="Manually Edited">●</span>}
                          </td>
                          <td className="px-6 py-3 font-bold text-white">{calculateHours(entry)}</td>
                          <td className="px-6 py-3">
                            {pendingRequests.map(req => (
                              <div key={req.id} className="bg-amber-500/10 border border-amber-500/20 rounded-md p-2 mb-2 last:mb-0">
                                <div className="text-xs text-amber-400 font-semibold mb-1">{req.reason}</div>
                                <div className="text-[10px] text-neutral-400 mb-2">
                                  Requested: {formatTime(req.requestedClockIn)} - {formatTime(req.requestedClockOut)}
                                  {req.notes && <div>Note: {req.notes}</div>}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleRequest(entry, req, "APPROVED")} className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-[10px] py-1 rounded transition-colors flex items-center justify-center gap-1">
                                    <FiCheckCircle /> Approve
                                  </button>
                                  <button onClick={() => handleRequest(entry, req, "REJECTED")} className="flex-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 text-[10px] py-1 rounded transition-colors flex items-center justify-center gap-1">
                                    <FiXCircle /> Reject
                                  </button>
                                </div>
                              </div>
                            ))}
                            {pendingRequests.length === 0 && entry.changeRequests.some(r => r.status === "APPROVED") && (
                              <span className="text-xs text-emerald-500 flex items-center gap-1"><FiCheckCircle /> Change Approved</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <button onClick={() => handleOpenEdit(entry)} className="text-neutral-400 hover:text-white p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                              <FiEdit2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditModal && selectedEntry && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
          <div className="relative w-full max-w-md bg-[#151618] border border-white/10 rounded-2xl flex flex-col shadow-2xl text-white z-[9999] p-6">
            <h3 className="text-xl font-bold mb-1">Edit Time Entry</h3>
            <p className="text-sm text-neutral-400 mb-6">For {selectedEntry.user.name} on {selectedEntry.date}</p>
            
            <form onSubmit={handleSaveOverride} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Clock In Time</label>
                <input 
                  type="datetime-local" 
                  value={editIn}
                  onChange={e => setEditIn(e.target.value)}
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 invert-[1] hue-rotate-180"
                  style={{ colorScheme: "dark" }}
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Clock Out Time</label>
                <input 
                  type="datetime-local" 
                  value={editOut}
                  onChange={e => setEditOut(e.target.value)}
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 invert-[1] hue-rotate-180"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-white/10">
                <button 
                  type="button" 
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold shadow-lg shadow-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Overrides"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
