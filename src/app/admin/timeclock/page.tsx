"use client"

import React, { useState, useEffect } from "react"
import { FiClock, FiCheckCircle, FiXCircle, FiEdit2, FiAlertCircle } from "react-icons/fi"

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
  ipAddress: string | null
  user: { id: string; name: string; email: string }
  changeRequests: TimeChangeRequest[]
  inactivityPeriods?: any[]
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

  // Add Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [users, setUsers] = useState<{id: string, name: string}[]>([])
  const [addUserId, setAddUserId] = useState("")
  const [addIn, setAddIn] = useState("")
  const [addOut, setAddOut] = useState("")

  const fetchEntries = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/timeclock/admin?month=${monthFilter}`, { cache: 'no-store' })
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

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/get-users")
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
        if (data.users.length > 0) {
          setAddUserId(data.users[0].id)
        }
      }
    } catch (err) {
      console.error("Failed to fetch users", err)
    }
  }

  useEffect(() => {
    fetchEntries()
    fetchUsers()
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

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addUserId || !addIn || !addOut) return
    setSaving(true)
    try {
      const res = await fetch("/api/timeclock/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: addUserId,
          manualClockIn: new Date(addIn).toISOString(),
          manualClockOut: new Date(addOut).toISOString()
        })
      })
      if ((await res.json()).success) {
        fetchEntries()
        setShowAddModal(false)
        setAddIn("")
        setAddOut("")
      } else {
        alert("Failed to add entry")
      }
    } catch (err) {
      console.error(err)
      alert("Error saving manual time entry")
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
    
    let inactivityMinutes = 0
    if (entry.inactivityPeriods && Array.isArray(entry.inactivityPeriods)) {
      entry.inactivityPeriods.forEach((p: any) => {
        const pStart = new Date(p.start)
        const pEnd = new Date(p.end)
        const overlapStart = new Date(Math.max(start.getTime(), pStart.getTime()))
        const overlapEnd = new Date(Math.min(end.getTime(), pEnd.getTime()))
        
        if (overlapEnd > overlapStart) {
          inactivityMinutes += (overlapEnd.getTime() - overlapStart.getTime()) / 60000
        }
      })
    }
    
    const diffHours = ((end.getTime() - start.getTime()) / (1000 * 60 * 60)) - (inactivityMinutes / 60)
    return Math.max(0, diffHours).toFixed(2)
  }

  function getWeekRange(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay() || 7;
    const diff = d.getDate() - day + 1;
    const monday = new Date(d);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
    return `${formatter.format(monday)} - ${formatter.format(sunday)}`;
  }

  // Group entries by user, then by week
  const userGroups = entries.reduce((acc, entry) => {
    const key = entry.user.id
    if (!acc[key]) acc[key] = { user: entry.user, weeks: {} as Record<string, { entries: TimeEntry[], totalHours: number }>, totalMonthHours: 0 }
    
    const weekKey = getWeekRange(entry.date)
    if (!acc[key].weeks[weekKey]) {
      acc[key].weeks[weekKey] = { entries: [], totalHours: 0 }
    }

    const hours = parseFloat(calculateHours(entry))
    acc[key].weeks[weekKey].entries.push(entry)
    acc[key].weeks[weekKey].totalHours += hours
    acc[key].totalMonthHours += hours

    return acc
  }, {} as Record<string, { user: any, weeks: Record<string, { entries: TimeEntry[], totalHours: number }>, totalMonthHours: number }>)

  if (loading) return <div className="p-8 text-neutral-400">Loading Timeclock...</div>

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto safe-bottom">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Timeclock Admin</h1>
            <p className="text-xs text-neutral-500 mt-1">Review clock entries, adjust times, and manage requests.</p>
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="month" 
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors"
            >
              + Add Entry
            </button>
          </div>
        </div>

      {Object.values(userGroups).length === 0 ? (
        <div className="text-neutral-500">No time entries found for this month.</div>
      ) : (
        <div className="space-y-6">
          {Object.values(userGroups).map(group => (
            <div key={group.user.id} className="bg-[#151618] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                <h3 className="font-bold text-lg text-white">{group.user.name || group.user.email}</h3>
                <div className="text-sm font-semibold text-emerald-400">
                  Total Month: {group.totalMonthHours.toFixed(2)} hrs
                </div>
              </div>
              <div className="p-4 space-y-4">
                {Object.entries(group.weeks).sort(([a],[b]) => b.localeCompare(a)).map(([weekName, weekData]) => (
                  <div key={weekName} className="border border-white/5 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-neutral-900/50 border-b border-white/5 flex justify-between items-center">
                      <h4 className="font-semibold text-sm text-neutral-300">Week of {weekName}</h4>
                      <span className="text-xs font-bold text-emerald-500">{weekData.totalHours.toFixed(2)} hrs</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-black/20 text-neutral-500 border-b border-white/5 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-2 font-semibold w-32">Date</th>
                            <th className="px-4 py-2 font-semibold">Clock In</th>
                            <th className="px-4 py-2 font-semibold">Clock Out</th>
                            <th className="px-4 py-2 font-semibold">IP Address</th>
                            <th className="px-4 py-2 font-semibold">Hours</th>
                            <th className="px-4 py-2 font-semibold">Requests</th>
                            <th className="px-4 py-2 font-semibold w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {weekData.entries.map(entry => {
                            const pendingRequests = entry.changeRequests.filter(r => r.status === "PENDING")
                            
                            return (
                              <React.Fragment key={entry.id}>
                              <tr className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-2 font-medium">{entry.date}</td>
                                <td className="px-4 py-2">
                                  {formatTime(entry.manualClockIn || entry.clockIn)}
                                  {entry.manualClockIn && <span className="ml-1 text-[10px] text-emerald-500" title="Manually Edited">●</span>}
                                </td>
                                <td className="px-4 py-2">
                                  {formatTime(entry.manualClockOut || entry.clockOut || entry.lastActivity)}
                                  {entry.manualClockOut && <span className="ml-1 text-[10px] text-emerald-500" title="Manually Edited">●</span>}
                                </td>
                                <td className="px-4 py-2">
                                  <span className="font-mono text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-neutral-400">
                                    {entry.ipAddress || "Unknown"}
                                  </span>
                                </td>
                                <td className="px-4 py-2 font-bold text-white">{calculateHours(entry)}</td>
                                <td className="px-4 py-2">
                                  {pendingRequests.map(req => (
                                    <div key={req.id} className="bg-amber-500/10 border border-amber-500/20 rounded p-1.5 mb-1.5 last:mb-0">
                                      <div className="text-[10px] text-amber-400 font-semibold mb-0.5">{req.reason}</div>
                                      <div className="text-[9px] text-neutral-400 mb-1">
                                        Req: {formatTime(req.requestedClockIn)} - {formatTime(req.requestedClockOut)}
                                      </div>
                                      <div className="flex gap-1">
                                        <button onClick={() => handleRequest(entry, req, "APPROVED")} className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-[9px] py-0.5 rounded transition-colors">
                                          Approve
                                        </button>
                                        <button onClick={() => handleRequest(entry, req, "REJECTED")} className="flex-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 text-[9px] py-0.5 rounded transition-colors">
                                          Reject
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {pendingRequests.length === 0 && entry.changeRequests.some(r => r.status === "APPROVED") && (
                                    <span className="text-[10px] text-emerald-500 flex items-center gap-1"><FiCheckCircle size={10} /> Approved</span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  <button onClick={() => handleOpenEdit(entry)} className="text-neutral-400 hover:text-white p-1 transition-colors">
                                    <FiEdit2 size={14} />
                                  </button>
                                </td>
                              </tr>
                              {entry.inactivityPeriods && Array.isArray(entry.inactivityPeriods) && entry.inactivityPeriods.length > 0 && (
                                <tr className="bg-red-500/5">
                                   <td colSpan={7} className="px-4 py-1">
                                      <div className="flex flex-col gap-1 pl-4">
                                        {entry.inactivityPeriods.map((lapse: any, idx: number) => (
                                          <div key={lapse.id || idx} className="flex items-center gap-3 text-[11px] text-red-400">
                                             <FiAlertCircle size={12} /> 
                                             <span>Idle: {formatTime(lapse.start)} - {formatTime(lapse.end)} ({lapse.durationMinutes} min)</span>
                                             <button 
                                                onClick={async () => {
                                                  if (!confirm("Remove this idle period? The hours will be added back to the shift.")) return;
                                                  const updatedLapses = entry.inactivityPeriods.filter((l: any) => l.id !== lapse.id)
                                                  try {
                                                    await fetch("/api/timeclock/admin", {
                                                      method: "PATCH",
                                                      headers: { "Content-Type": "application/json" },
                                                      body: JSON.stringify({
                                                        type: "UPDATE_INACTIVITY",
                                                        timeEntryId: entry.id,
                                                        inactivityPeriods: updatedLapses
                                                      })
                                                    })
                                                    fetchData()
                                                  } catch(e) {}
                                                }}
                                                className="text-red-500 hover:text-white ml-2 px-2 py-0.5 bg-red-500/10 hover:bg-red-500/30 rounded transition-colors"
                                             >
                                               Remove
                                             </button>
                                          </div>
                                        ))}
                                      </div>
                                   </td>
                                </tr>
                              )}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
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
      {showAddModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-md bg-[#151618] border border-white/10 rounded-2xl flex flex-col shadow-2xl text-white z-[9999] p-6">
            <h3 className="text-xl font-bold mb-1">Add Manual Time Entry</h3>
            <p className="text-sm text-neutral-400 mb-6">Create a new time entry for an employee</p>
            
            <form onSubmit={handleSaveAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Employee</label>
                <select
                  value={addUserId}
                  onChange={e => setAddUserId(e.target.value)}
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="" disabled>Select an employee</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Clock In Time</label>
                <input 
                  type="datetime-local" 
                  value={addIn}
                  onChange={e => setAddIn(e.target.value)}
                  required
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 invert-[1] hue-rotate-180"
                  style={{ colorScheme: "dark" }}
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Clock Out Time</label>
                <input 
                  type="datetime-local" 
                  value={addOut}
                  onChange={e => setAddOut(e.target.value)}
                  required
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 invert-[1] hue-rotate-180"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-white/10">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving || !addUserId || !addIn || !addOut}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold shadow-lg shadow-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </main>
    </div>
  )
}
