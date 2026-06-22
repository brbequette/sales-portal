"use client"

import { useState, useEffect } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { FiClock, FiAlertCircle, FiCheckCircle, FiXCircle } from "react-icons/fi"

interface TimeEntry {
  id: string
  date: string
  clockIn: string
  lastActivity: string
  manualClockIn: string | null
  manualClockOut: string | null
  changeRequests: any[]
}

export default function UserTimeclockPage() {
  const { zohoContext: currentUser } = useZoho()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showChangeModal, setShowChangeModal] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)
  const [changeReason, setChangeReason] = useState("Forgot to log in")
  const [changeNotes, setChangeNotes] = useState("")
  const [newClockIn, setNewClockIn] = useState("")
  const [newClockOut, setNewClockOut] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!currentUser?.id) return
    const fetchEntries = async () => {
      try {
        const res = await fetch(`/api/timeclock/get-entries?userId=${currentUser.id}`)
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
    fetchEntries()
  }, [currentUser])

  const handleOpenChangeModal = (entry: TimeEntry) => {
    setSelectedEntry(entry)
    const effectiveIn = entry.manualClockIn || entry.clockIn
    // For local input datetime-local format: YYYY-MM-DDThh:mm
    const toLocalString = (dateStr: string) => {
      const d = new Date(dateStr)
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
      return d.toISOString().slice(0, 16)
    }
    setNewClockIn(toLocalString(effectiveIn))
    
    // Calculate expected out: lastActivity + 10 mins
    let effectiveOut = entry.manualClockOut
    if (!effectiveOut) {
      const out = new Date(entry.lastActivity)
      out.setMinutes(out.getMinutes() + 10)
      effectiveOut = out.toISOString()
    }
    setNewClockOut(toLocalString(effectiveOut))
    
    setChangeReason("Forgot to log in")
    setChangeNotes("")
    setShowChangeModal(true)
  }

  const handleSubmitChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEntry || !currentUser?.id) return
    
    setSubmitting(true)
    try {
      const res = await fetch("/api/timeclock/submit-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeEntryId: selectedEntry.id,
          userId: currentUser.id,
          requestedClockIn: new Date(newClockIn).toISOString(),
          requestedClockOut: new Date(newClockOut).toISOString(),
          reason: changeReason,
          notes: changeNotes
        })
      })
      const data = await res.json()
      if (data.success) {
        // Refresh entries
        const r = await fetch(`/api/timeclock/get-entries?userId=${currentUser.id}`)
        const d = await r.json()
        if (d.success) setEntries(d.entries)
        setShowChangeModal(false)
      } else {
        alert("Failed to submit request: " + data.error)
      }
    } catch (err) {
      console.error(err)
      alert("Error submitting change request")
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  }

  const calculateHours = (entry: TimeEntry) => {
    const start = new Date(entry.manualClockIn || entry.clockIn)
    let end: Date
    if (entry.manualClockOut) {
      end = new Date(entry.manualClockOut)
    } else {
      end = new Date(entry.lastActivity)
      end.setMinutes(end.getMinutes() + 10)
      
      // If it's today, and they are currently active (last activity within 15 mins), cap at "now"
      const now = new Date()
      if (end > now) end = now
    }
    
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    return Math.max(0, diffHours).toFixed(2)
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black text-white p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <FiClock className="text-emerald-500" /> My Timeclock
            </h1>
            <p className="text-neutral-400 mt-1">Review your automatically logged hours and request corrections.</p>
          </div>
        </div>

        <div className="bg-[#151618] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] border-b border-white/10 text-neutral-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Clock In</th>
                  <th className="px-6 py-4 font-semibold">Clock Out</th>
                  <th className="px-6 py-4 font-semibold">Total Hours</th>
                  <th className="px-6 py-4 font-semibold">Status / Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-neutral-500">Loading your timesheet...</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-neutral-500">No timeclock data found.</td></tr>
                ) : (
                  entries.map(entry => {
                    const effectiveIn = entry.manualClockIn || entry.clockIn
                    let effectiveOut = entry.manualClockOut
                    if (!effectiveOut) {
                      const out = new Date(entry.lastActivity)
                      out.setMinutes(out.getMinutes() + 10)
                      effectiveOut = out.toISOString()
                    }

                    const pendingRequest = entry.changeRequests?.find(r => r.status === "PENDING")
                    const rejectedRequest = entry.changeRequests?.find(r => r.status === "REJECTED")

                    return (
                      <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 font-medium">{entry.date}</td>
                        <td className="px-6 py-4">
                          {formatTime(effectiveIn)}
                          {entry.manualClockIn && <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Edited</span>}
                        </td>
                        <td className="px-6 py-4">
                          {formatTime(effectiveOut)}
                          {entry.manualClockOut && <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Edited</span>}
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-400">{calculateHours(entry)}h</td>
                        <td className="px-6 py-4">
                          {pendingRequest ? (
                            <span className="flex items-center gap-1.5 text-amber-500 text-xs font-semibold">
                              <FiAlertCircle /> Change Pending
                            </span>
                          ) : (
                            <div className="flex items-center gap-3">
                              {rejectedRequest && (
                                <span className="flex items-center gap-1 text-red-400 text-xs" title="A previous change request was rejected">
                                  <FiXCircle />
                                </span>
                              )}
                              <button 
                                onClick={() => handleOpenChangeModal(entry)}
                                className="text-xs bg-white/5 hover:bg-white/10 text-neutral-300 px-3 py-1.5 rounded-lg transition-colors border border-white/10"
                              >
                                Request Change
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showChangeModal && selectedEntry && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowChangeModal(false)} />
          <div className="relative w-full max-w-md bg-[#151618] border border-white/10 rounded-2xl flex flex-col shadow-2xl text-white z-[9999] p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-1">Request Time Change</h3>
            <p className="text-sm text-neutral-400 mb-6">For date: {selectedEntry.date}</p>
            
            <form onSubmit={handleSubmitChange} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">New Clock In Time</label>
                <input 
                  type="datetime-local" 
                  value={newClockIn}
                  onChange={e => setNewClockIn(e.target.value)}
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 invert-[1] hue-rotate-180"
                  style={{ colorScheme: "dark" }}
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">New Clock Out Time</label>
                <input 
                  type="datetime-local" 
                  value={newClockOut}
                  onChange={e => setNewClockOut(e.target.value)}
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 invert-[1] hue-rotate-180"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Reason</label>
                <select 
                  value={changeReason} 
                  onChange={e => setChangeReason(e.target.value)}
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
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
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-white/10">
                <button 
                  type="button" 
                  onClick={() => setShowChangeModal(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold shadow-lg shadow-emerald-500/20 transition-colors disabled:opacity-50"
                >
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
