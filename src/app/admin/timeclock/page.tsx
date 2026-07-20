"use client"

import React, { useState, useEffect } from "react"
import { FiClock, FiCheckCircle, FiXCircle, FiEdit2, FiAlertCircle, FiMapPin, FiPlus, FiTrash2, FiToggleLeft, FiToggleRight } from "react-icons/fi"

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
  locationStatus?: string | null
  clockInLocation?: string | null
  clockInLat?: number | null
  clockInLng?: number | null
  user: { id: string; name: string; email: string }
  changeRequests: TimeChangeRequest[]
  inactivityPeriods?: any[]
}

interface GeofenceLocation {
  id: string
  name: string
  address?: string | null
  latitude: number
  longitude: number
  radiusMeters: number
  isActive: boolean
  createdAt: string
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

  // Geofence Management State
  const [activeAdminTab, setActiveAdminTab] = useState<"entries" | "geofences">("entries")
  const [geofences, setGeofences] = useState<GeofenceLocation[]>([])
  const [showGeoForm, setShowGeoForm] = useState(false)
  const [editingGeo, setEditingGeo] = useState<GeofenceLocation | null>(null)
  const [geoForm, setGeoForm] = useState({ name: "", address: "", latitude: "", longitude: "", radiusMeters: "150" })
  const [geoSaving, setGeoSaving] = useState(false)

  const fetchEntries = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/timeclock/admin?month=${monthFilter}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success) {
        setEntries(data.entries)
        if (data.geofences) setGeofences(data.geofences)
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
            <p className="text-xs text-neutral-500 mt-1">Review clock entries, adjust times, manage geofence locations.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-neutral-800 border border-neutral-700 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setActiveAdminTab("entries")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${activeAdminTab === 'entries' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                <FiClock size={12} className="inline mr-1.5" />Entries
              </button>
              <button
                onClick={() => setActiveAdminTab("geofences")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${activeAdminTab === 'geofences' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                <FiMapPin size={12} className="inline mr-1.5" />Geofences ({geofences.length})
              </button>
            </div>
            {activeAdminTab === 'entries' && (
              <>
                <input 
                  type="month" 
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                />
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  + Add Entry
                </button>
              </>
            )}
            {activeAdminTab === 'geofences' && (
              <button
                onClick={() => {
                  setEditingGeo(null)
                  setGeoForm({ name: "", address: "", latitude: "", longitude: "", radiusMeters: "150" })
                  setShowGeoForm(true)
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5"
              >
                <FiPlus size={14} /> Add Location
              </button>
            )}
          </div>
        </div>

      {activeAdminTab === 'geofences' ? (
        /* ══════════ Geofence Management Tab ══════════ */
        <div className="space-y-4">
          {/* Add/Edit Geofence Form */}
          {showGeoForm && (
            <div className="bg-[#151618] border border-blue-500/30 rounded-2xl shadow-xl p-6">
              <h3 className="text-sm font-bold text-white mb-4">{editingGeo ? 'Edit Geofence Location' : 'Add New Geofence Location'}</h3>
              <form onSubmit={async (e) => {
                e.preventDefault()
                setGeoSaving(true)
                try {
                  const payload = {
                    type: editingGeo ? 'GEOFENCE_UPDATE' : 'GEOFENCE_CREATE',
                    ...(editingGeo && { id: editingGeo.id }),
                    name: geoForm.name,
                    address: geoForm.address || null,
                    latitude: parseFloat(geoForm.latitude),
                    longitude: parseFloat(geoForm.longitude),
                    radiusMeters: parseInt(geoForm.radiusMeters) || 150,
                  }
                  const res = await fetch('/api/timeclock/admin', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  })
                  const data = await res.json()
                  if (data.success) {
                    setShowGeoForm(false)
                    fetchEntries() // Refreshes geofences too
                  }
                } catch (err) { console.error(err) }
                finally { setGeoSaving(false) }
              }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Location Name *</label>
                  <input type="text" required value={geoForm.name} onChange={e => setGeoForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Main Office" className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Address</label>
                  <input type="text" value={geoForm.address} onChange={e => setGeoForm(p => ({ ...p, address: e.target.value }))}
                    placeholder="123 Main St, City, State" className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Latitude *</label>
                  <input type="number" step="any" required value={geoForm.latitude} onChange={e => setGeoForm(p => ({ ...p, latitude: e.target.value }))}
                    placeholder="33.4484" className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Longitude *</label>
                  <input type="number" step="any" required value={geoForm.longitude} onChange={e => setGeoForm(p => ({ ...p, longitude: e.target.value }))}
                    placeholder="-112.0740" className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Radius (meters)</label>
                  <input type="number" value={geoForm.radiusMeters} onChange={e => setGeoForm(p => ({ ...p, radiusMeters: e.target.value }))}
                    placeholder="150" className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono" />
                  <p className="text-[9px] text-neutral-500 mt-1">Default: 150m (~500ft). How far from the pin an employee can clock in.</p>
                </div>
                <div className="flex items-end gap-3">
                  <button type="submit" disabled={geoSaving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
                    {geoSaving ? 'Saving...' : editingGeo ? 'Update Location' : 'Add Location'}
                  </button>
                  <button type="button" onClick={() => setShowGeoForm(false)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
              <p className="text-[10px] text-neutral-500 mt-3">💡 Tip: Right-click a location on Google Maps and copy the coordinates (lat, lng).</p>
            </div>
          )}

          {/* Geofence List */}
          {geofences.length === 0 ? (
            <div className="bg-[#151618] border border-white/10 rounded-2xl p-8 text-center">
              <FiMapPin size={32} className="mx-auto text-neutral-600 mb-3" />
              <p className="text-neutral-400 text-sm font-semibold">No geofence locations configured</p>
              <p className="text-neutral-500 text-xs mt-1">Add your office or warehouse locations to verify employee clock-in/out positions.</p>
              <p className="text-neutral-500 text-xs mt-1">GPS will still be captured without geofences — it just won't be validated.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {geofences.map(geo => (
                <div key={geo.id} className={`bg-[#151618] border rounded-xl p-4 flex items-center justify-between gap-4 transition-colors ${
                  geo.isActive ? 'border-blue-500/30' : 'border-white/5 opacity-60'
                }`}>
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      geo.isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-neutral-800 text-neutral-500'
                    }`}>
                      <FiMapPin size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        {geo.name}
                        {!geo.isActive && <span className="text-[9px] px-1.5 py-0.5 bg-neutral-800 text-neutral-500 rounded-full font-bold">INACTIVE</span>}
                      </div>
                      {geo.address && <div className="text-xs text-neutral-400 truncate">{geo.address}</div>}
                      <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                        {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)} · {geo.radiusMeters}m radius
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        await fetch('/api/timeclock/admin', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ type: 'GEOFENCE_UPDATE', id: geo.id, isActive: !geo.isActive })
                        })
                        fetchEntries()
                      }}
                      className={`p-2 rounded-lg transition-colors ${geo.isActive ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-neutral-500 hover:bg-white/5'}`}
                      title={geo.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {geo.isActive ? <FiToggleRight size={20} /> : <FiToggleLeft size={20} />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingGeo(geo)
                        setGeoForm({
                          name: geo.name,
                          address: geo.address || '',
                          latitude: String(geo.latitude),
                          longitude: String(geo.longitude),
                          radiusMeters: String(geo.radiusMeters),
                        })
                        setShowGeoForm(true)
                      }}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <FiEdit2 size={14} />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete geofence "${geo.name}"?`)) return
                        await fetch('/api/timeclock/admin', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ type: 'GEOFENCE_DELETE', id: geo.id })
                        })
                        fetchEntries()
                      }}
                      className="p-2 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* How it works info */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-300/80 space-y-1">
            <p className="font-bold text-blue-300">📍 How Geolocation Timeclock Works</p>
            <p>• GPS is captured <strong>only</strong> at clock-in and clock-out — not continuously tracked.</p>
            <p>• If geofence locations are configured, clock-in position is validated against the nearest location.</p>
            <p>• Status shows as VERIFIED (within radius), OUT_OF_RANGE, DENIED (no GPS permission), or UNAVAILABLE.</p>
            <p>• Without any geofences, GPS is still captured for audit trail but always shows as VERIFIED.</p>
          </div>
        </div>
      ) : (
      /* ══════════ Entries Tab ══════════ */
      <>
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
                            <th className="px-4 py-2 font-semibold">Location</th>
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
                                  {(entry as any).locationStatus === 'VERIFIED' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold whitespace-nowrap">
                                      📍 {(entry as any).clockInLocation || 'On-Site'}
                                    </span>
                                  )}
                                  {(entry as any).locationStatus === 'OUT_OF_RANGE' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">⚠️ Off-Site</span>
                                  )}
                                  {(entry as any).locationStatus === 'DENIED' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-500/20 text-neutral-400 font-bold">🔒 No GPS</span>
                                  )}
                                  {(entry as any).locationStatus === 'UNAVAILABLE' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-500 font-bold">—</span>
                                  )}
                                  {!(entry as any).locationStatus && (
                                    <span className="text-[10px] text-neutral-600">—</span>
                                  )}
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
                                   <td colSpan={8} className="px-4 py-1">
                                      <div className="flex flex-col gap-1 pl-4">
                                        {entry.inactivityPeriods.map((lapse: any, idx: number) => (
                                          <div key={lapse.id || idx} className="flex items-center gap-3 text-[11px] text-red-400">
                                             <FiAlertCircle size={12} /> 
                                             <span>Idle: {formatTime(lapse.start)} - {formatTime(lapse.end)} ({lapse.durationMinutes} min)</span>
                                             <button 
                                                onClick={async () => {
                                                  if (!confirm("Remove this idle period? The hours will be added back to the shift.")) return;
                                                  const updatedLapses = (entry.inactivityPeriods || []).filter((l: any) => l.id !== lapse.id)
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
                                                    fetchEntries()
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
      </>
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
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Clock Out Time</label>
                <input 
                  type="datetime-local" 
                  value={addOut}
                  onChange={e => setAddOut(e.target.value)}
                  required
                  className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
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
