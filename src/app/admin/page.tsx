"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { usePagination, Pagination } from "@/components/Pagination"
import {
  FiSettings, FiUsers, FiRefreshCw, FiSave, FiAlertTriangle,
  FiShield, FiCheckCircle, FiX, FiChevronDown, FiActivity, FiTarget
} from "react-icons/fi"

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface Config {
  timeframeMonths: number
  group1RepId: string
  group2RepId: string
  group3RepId: string
  group4RepId: string
  holidays: { date: string, name: string }[]
  salesTargets: Record<string, number>
  subtotalTargets: Record<string, number>
  visibleReps: string[]
}

interface ReassignmentResult {
  success: boolean
  markedInactive: number
  totalUpdateAccounts: number
  reassignedCount: number
  reassignedDetails: any[]
}

const STANDARD_HOLIDAYS = [
  { id: "new_year", name: "New Year's Day" },
  { id: "mlk", name: "Martin Luther King Jr. Day" },
  { id: "washington", name: "Washington's Birthday" },
  { id: "memorial", name: "Memorial Day" },
  { id: "juneteenth", name: "Juneteenth" },
  { id: "independence", name: "Independence Day" },
  { id: "labor", name: "Labor Day" },
  { id: "columbus", name: "Columbus Day" },
  { id: "veterans", name: "Veterans Day" },
  { id: "thanksgiving", name: "Thanksgiving Day" },
  { id: "christmas", name: "Christmas Day" }
]

function getNthDayOfMonth(year: number, month: number, dayOfWeek: number, n: number) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() === dayOfWeek) {
      count++;
      if (count === n) return date;
    }
  }
  return null;
}

function getLastDayOfMonth(year: number, month: number, dayOfWeek: number) {
  let last = null;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() === dayOfWeek) last = date;
  }
  return last;
}

function observeDate(date: Date) {
  const d = new Date(date);
  if (d.getDay() === 0) { // Sunday -> Monday
    d.setDate(d.getDate() + 1);
  } else if (d.getDay() === 6) { // Saturday -> Friday
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function formatHolidayDate(date: Date | null) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateHoliday(id: string, year: number): { date: string, name: string } | null {
  let d: Date | null = null;
  let name = "";
  switch(id) {
    case "new_year": d = observeDate(new Date(year, 0, 1)); name = "New Year's Day"; break;
    case "mlk": d = getNthDayOfMonth(year, 0, 1, 3); name = "Martin Luther King Jr. Day"; break;
    case "washington": d = getNthDayOfMonth(year, 1, 1, 3); name = "Washington's Birthday"; break;
    case "memorial": d = getLastDayOfMonth(year, 4, 1); name = "Memorial Day"; break;
    case "juneteenth": d = observeDate(new Date(year, 5, 19)); name = "Juneteenth"; break;
    case "independence": d = observeDate(new Date(year, 6, 4)); name = "Independence Day"; break;
    case "labor": d = getNthDayOfMonth(year, 8, 1, 1); name = "Labor Day"; break;
    case "columbus": d = getNthDayOfMonth(year, 9, 1, 2); name = "Columbus Day"; break;
    case "veterans": d = observeDate(new Date(year, 10, 11)); name = "Veterans Day"; break;
    case "thanksgiving": d = getNthDayOfMonth(year, 10, 4, 4); name = "Thanksgiving Day"; break;
    case "christmas": d = observeDate(new Date(year, 11, 25)); name = "Christmas Day"; break;
  }
  if (!d) return null;
  return { date: formatHolidayDate(d), name };
}

export default function AdminSettingsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [rebalancing, setRebalancing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showRebalanceConfirm, setShowRebalanceConfirm] = useState(false)

  const [config, setConfig] = useState<Config>({
    timeframeMonths: 12,
    group1RepId: "",
    group2RepId: "",
    group3RepId: "",
    group4RepId: "",
    holidays: [],
    salesTargets: {},
    subtotalTargets: {},
    visibleReps: [],
  })
  const [newHolidayDate, setNewHolidayDate] = useState("")
  const [newHolidayName, setNewHolidayName] = useState("")
  const [holidayStartYear, setHolidayStartYear] = useState(new Date().getFullYear())
  const [holidayEndYear, setHolidayEndYear] = useState(new Date().getFullYear() + 4)
  const [selectedStandardHolidays, setSelectedStandardHolidays] = useState<Set<string>>(new Set(STANDARD_HOLIDAYS.map(h => h.id)))
  const [users, setUsers] = useState<User[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})

  const [apiError, setApiError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [reassignResult, setReassignResult] = useState<ReassignmentResult | null>(null)

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const detailsPagination = usePagination(reassignResult?.reassignedDetails || [])

  const fetchConfig = useCallback(async () => {
    try {
      setApiError(null)
      const res = await fetch("/api/get-update-config")
      const data = await res.json()
      if (data.success) {
        setConfig(data.config)
        setUsers(data.users || [])
        setCounts(data.counts || {})
      } else {
        setApiError(data.error || "Failed to load configuration")
      }
    } catch (err: any) {
      setApiError(err.message || "Network error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }
    if (isAdmin) {
      fetchConfig()
    } else {
      setLoading(false)
    }
  }, [isInitialized, currentUser, router, isAdmin, fetchConfig])

  // Auto-dismiss success messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 5000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  const handleSave = async () => {
    setSaving(true)
    setApiError(null)
    setSuccessMsg(null)
    try {
      const res = await fetch("/api/save-update-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (data.success) {
        setSuccessMsg("Configuration saved successfully!")
        fetchConfig()
      } else {
        setApiError(data.error || "Failed to save configuration")
      }
    } catch (err: any) {
      setApiError(err.message || "Network error")
    } finally {
      setSaving(false)
    }
  }

  const handleReassign = async (rebalanceAll: boolean) => {
    if (rebalanceAll) setRebalancing(true)
    else setReassigning(true)
    setApiError(null)
    setSuccessMsg(null)
    setReassignResult(null)
    setShowRebalanceConfirm(false)
    try {
      const res = await fetch("/api/trigger-reassignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rebalanceAll }),
      })
      const data = await res.json()
      if (data.success) {
        setReassignResult(data)
        setSuccessMsg(
          rebalanceAll
            ? `Rebalance complete! ${data.reassignedCount} accounts reassigned.`
            : `Reassignment complete! ${data.markedInactive} marked inactive, ${data.reassignedCount} reassigned.`
        )
        fetchConfig()
      } else {
        setApiError(data.error || "Reassignment failed")
      }
    } catch (err: any) {
      setApiError(err.message || "Network error")
    } finally {
      setReassigning(false)
      setRebalancing(false)
    }
  }

  const handleRefreshProducts = async () => {
    setRefreshing(true)
    setApiError(null)
    setSuccessMsg(null)
    try {
      let page = 1
      let hasMore = true
      
      while (hasMore) {
        const res = await fetch(`/api/get-products?reseed=true&page=${page}`)
        const text = await res.text()
        
        if (!text) {
          throw new Error("Empty response from server (Timeout)")
        }
        
        let data
        try {
          data = JSON.parse(text)
        } catch (e) {
          throw new Error("Invalid response format from server")
        }
        
        if (!data.success) {
          throw new Error(data.error || data.message || "Failed to refresh products")
        }
        
        hasMore = data.hasMore
        page = data.nextPage
      }
      
      setSuccessMsg("Product catalog fully synchronized!")
    } catch (err: any) {
      setApiError(err.message || "Network error")
    } finally {
      setRefreshing(false)
    }
  }

  const groupKeys: (keyof Config)[] = [
    "group1RepId",
    "group2RepId",
    "group3RepId",
    "group4RepId",
  ]
  const groupLabels = ["Group 1", "Group 2", "Group 3", "Group 4"]
  const groupColors = [
    { border: "border-purple-500/30", bg: "bg-purple-950/20", text: "text-purple-400", badge: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    { border: "border-blue-500/30", bg: "bg-blue-950/20", text: "text-blue-400", badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    { border: "border-sky-500/30", bg: "bg-sky-950/20", text: "text-sky-400", badge: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
    { border: "border-teal-500/30", bg: "bg-teal-950/20", text: "text-teal-400", badge: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
  ]

  // Loading state
  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Admin Settings...</p>
        </div>
      </div>
    )
  }

  // Access denied
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center text-white font-sans" style={{ height: "100%" }}>
        <div className="text-center max-w-sm mx-auto px-4">
          <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <FiShield size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-neutral-400 text-sm mb-6">
            You need administrator privileges to access this page.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-sm font-bold text-white transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans overflow-y-auto" style={{ height: "100%" }}>
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-5 overflow-y-auto safe-bottom">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30">
              <FiSettings size={20} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Admin Settings</h1>
              <p className="text-xs text-neutral-500">Manage update account configuration &amp; assignments</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/admin/vig')}
            className="px-4 py-2 bg-emerald-900/30 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-900/50 rounded-lg text-sm font-bold flex items-center gap-2 transition"
          >
            VIG Management &rarr;
          </button>
        </div>

        {/* Feedback Messages */}
        {apiError && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2 animate-in fade-in">
            <FiAlertTriangle size={16} className="shrink-0" />
            <span><strong>Error:</strong> {apiError}</span>
            <button onClick={() => setApiError(null)} className="ml-auto text-red-500 hover:text-red-300">
              <FiX size={14} />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-3 text-emerald-400 text-sm flex items-center gap-2 animate-in fade-in">
            <FiCheckCircle size={16} className="shrink-0" />
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-500 hover:text-emerald-300">
              <FiX size={14} />
            </button>
          </div>
        )}

        {/* Inactivity Timeframe Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FiActivity size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Inactivity Timeframe</h2>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Accounts with no purchases within this timeframe will be marked as inactive during reassignment.
          </p>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="number"
                min={1}
                max={120}
                value={config.timeframeMonths}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    timeframeMonths: parseInt(e.target.value) || 12,
                  }))
                }
                className="w-24 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold text-center focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <span className="text-sm text-neutral-400 font-medium">months</span>
          </div>
        </div>

        {/* Update Groups Grid */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FiUsers size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Update Groups</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groupKeys.map((key, idx) => {
              const selectedRepId = config[key] as string
              const selectedUser = users.find((u) => u.id === selectedRepId)
              const count = selectedRepId ? (counts[selectedRepId] || 0) : 0

              return (
                <div
                  key={key}
                  className={`bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg hover:border-neutral-700 transition-all duration-200`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold uppercase tracking-wider ${groupColors[idx].text}`}>
                      {groupLabels[idx]}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${groupColors[idx].badge}`}
                    >
                      {count} accounts
                    </span>
                  </div>

                  <div className="relative">
                    <select
                      value={selectedRepId}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, [key]: e.target.value }))
                      }
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-purple-500 transition-colors appearance-none cursor-pointer pr-8"
                    >
                      <option value="">— Select Rep —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                    <FiChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
                    />
                  </div>

                  {selectedUser && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-300">
                        {selectedUser.name?.charAt(0) || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{selectedUser.name}</p>
                        <p className="text-[10px] text-neutral-500 truncate">{selectedUser.role}</p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Holidays Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FiActivity size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Workday Holiday Exclusions</h2>
          </div>
          <p className="text-xs text-neutral-400 mb-6">
            Exclude holidays from the workday target calculations.
          </p>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 mb-6">
            <h3 className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-3">Generate Standard Holidays</h3>
            
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-neutral-400">Generate from</span>
              <input 
                type="number" 
                value={holidayStartYear} 
                onChange={e => setHolidayStartYear(parseInt(e.target.value) || new Date().getFullYear())}
                className="w-20 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-purple-500"
              />
              <span className="text-sm text-neutral-400">to</span>
              <input 
                type="number" 
                value={holidayEndYear} 
                onChange={e => setHolidayEndYear(parseInt(e.target.value) || new Date().getFullYear() + 4)}
                className="w-20 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {STANDARD_HOLIDAYS.map(h => (
                <label key={h.id} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={selectedStandardHolidays.has(h.id)}
                    onChange={(e) => {
                      const newSet = new Set(selectedStandardHolidays)
                      if (e.target.checked) newSet.add(h.id)
                      else newSet.delete(h.id)
                      setSelectedStandardHolidays(newSet)
                    }}
                    className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-purple-600 focus:ring-purple-500 focus:ring-offset-neutral-950"
                  />
                  <span className="text-xs text-neutral-300 group-hover:text-white transition-colors truncate">{h.name}</span>
                </label>
              ))}
            </div>

            <button
              onClick={() => {
                let newHols: {date: string, name: string}[] = []
                for (let y = holidayStartYear; y <= holidayEndYear; y++) {
                  Array.from(selectedStandardHolidays).forEach(hId => {
                    const hd = generateHoliday(hId, y)
                    if (hd) newHols.push(hd)
                  })
                }
                setConfig((c) => {
                  const merged = [...c.holidays]
                  newHols.forEach(nh => {
                    if (!merged.some(m => m.date === nh.date)) merged.push(nh)
                  })
                  merged.sort((a,b) => a.date.localeCompare(b.date))
                  return { ...c, holidays: merged }
                })
              }}
              className="px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30 text-xs font-bold rounded-xl transition-all"
            >
              Generate & Add
            </button>
          </div>

          <div className="flex gap-2 mb-6">
            <input
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              className="bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
            />
            <input
              type="text"
              placeholder="Custom Holiday Name"
              value={newHolidayName}
              onChange={(e) => setNewHolidayName(e.target.value)}
              className="bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 flex-1"
            />
            <button
              onClick={() => {
                if (newHolidayDate && newHolidayName && !config.holidays.some(h => h.date === newHolidayDate)) {
                  setConfig((c) => ({ 
                    ...c, 
                    holidays: [...c.holidays, { date: newHolidayDate, name: newHolidayName }].sort((a,b) => a.date.localeCompare(b.date)) 
                  }))
                  setNewHolidayDate("")
                  setNewHolidayName("")
                }
              }}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-all whitespace-nowrap"
            >
              Add Custom
            </button>
          </div>

          <div className="space-y-4">
            {config.holidays.length === 0 ? (
              <span className="text-xs text-neutral-500">No holidays added yet.</span>
            ) : (
              Object.entries(config.holidays.reduce((acc, h) => {
                const y = h.date.split("-")[0]
                if (!acc[y]) acc[y] = []
                acc[y].push(h)
                return acc
              }, {} as Record<string, {date: string, name: string}[]>))
              .sort(([yearA], [yearB]) => yearB.localeCompare(yearA))
              .map(([year, hols]) => (
                <div key={year} className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
                    <h3 className="text-sm font-bold text-white">{year} <span className="text-[10px] text-neutral-500 font-normal ml-2">({hols.length} days)</span></h3>
                    <button 
                      onClick={() => {
                        setConfig(c => ({ ...c, holidays: c.holidays.filter(h => !h.date.startsWith(year)) }))
                      }}
                      className="text-[10px] uppercase font-bold tracking-wider text-red-500 hover:text-red-400"
                    >
                      Remove Year
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hols.map(h => (
                      <span key={h.date} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded text-xs text-neutral-300">
                        <span className="font-mono text-[10px] text-neutral-500">{h.date.slice(5)}</span>
                        <span>{h.name}</span>
                        <button
                          onClick={() => {
                            setConfig((c) => ({ ...c, holidays: c.holidays.filter((item) => item.date !== h.date) }))
                          }}
                          className="text-red-400/50 hover:text-red-400 font-bold ml-0.5 px-1 rounded hover:bg-red-500/10"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Visible Sales Reps Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FiUsers size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Visible Sales Reps</h2>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Select the sales representatives that should be displayed across the portal (Sales Hub, Stats, Commissions).
            Unselected users will still exist in the database but their historic data won't clutter the UI.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {users.map((u) => {
              const isVisible = config.visibleReps?.includes(u.id) || false
              return (
                <label 
                  key={u.id} 
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isVisible ? "bg-purple-900/20 border-purple-500/30" : "bg-neutral-950 border-neutral-800 hover:border-neutral-700"}`}
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={(e) => {
                      setConfig(c => {
                        const newSet = new Set(c.visibleReps || [])
                        if (e.target.checked) newSet.add(u.id)
                        else newSet.delete(u.id)
                        return { ...c, visibleReps: Array.from(newSet) }
                      })
                    }}
                    className="mt-0.5 w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold truncate ${isVisible ? "text-purple-100" : "text-white"}`}>{u.name}</p>
                    <p className="text-[10px] text-neutral-500 truncate">{u.email}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Rep Targets Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FiTarget size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Representative Daily Sales Targets</h2>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Set individual daily sales targets (profit and subtotal goals) for each rep.
          </p>
          <div className="space-y-3">
            {users.map((u) => {
              const currentVal = config.salesTargets[u.id] ?? 0
              return (
                <div key={u.id} className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{u.name}</p>
                    <p className="text-[10px] text-neutral-500 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500 text-xs">Profit $</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={currentVal || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setConfig((c) => ({
                            ...c,
                            salesTargets: { ...c.salesTargets, [u.id]: val }
                          }))
                        }}
                        className="w-24 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 text-right font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500 text-xs">Subtotal $</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={config.subtotalTargets?.[u.id] || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setConfig((c) => ({
                            ...c,
                            subtotalTargets: { ...(c.subtotalTargets || {}), [u.id]: val }
                          }))
                        }}
                        className="w-24 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 text-right font-mono"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20 hover:shadow-purple-900/40"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiSave size={16} />
              )}
              {saving ? "Saving..." : "Save Settings"}
            </button>

            {/* Run Reassignment */}
            <button
              onClick={() => handleReassign(false)}
              disabled={reassigning}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reassigning ? (
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiRefreshCw size={16} className="text-purple-400" />
              )}
              {reassigning ? "Running..." : "Run Reassignment"}
            </button>

            {/* Refresh Products */}
            <button
              onClick={handleRefreshProducts}
              disabled={refreshing}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? (
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiRefreshCw size={16} className="text-emerald-400" />
              )}
              {refreshing ? "Refreshing..." : "Refresh Products"}
            </button>

            {/* Rebalance All */}
            <button
              onClick={() => setShowRebalanceConfirm(true)}
              disabled={rebalancing}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-amber-950/30 hover:bg-amber-950/50 border border-amber-500/30 text-amber-400 font-bold text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rebalancing ? (
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiAlertTriangle size={16} />
              )}
              {rebalancing ? "Rebalancing..." : "Rebalance All"}
            </button>
          </div>
        </div>

        {/* Reassignment Results */}
        {reassignResult && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 mb-4">
              <FiCheckCircle size={16} className="text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Reassignment Results</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800 text-center">
                <p className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider mb-1">Marked Inactive</p>
                <p className="text-xl font-bold text-amber-400">{reassignResult.markedInactive}</p>
              </div>
              <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800 text-center">
                <p className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider mb-1">Total Update</p>
                <p className="text-xl font-bold text-purple-400">{reassignResult.totalUpdateAccounts}</p>
              </div>
              <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800 text-center">
                <p className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider mb-1">Reassigned</p>
                <p className="text-xl font-bold text-emerald-400">{reassignResult.reassignedCount}</p>
              </div>
              <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800 text-center">
                <p className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider mb-1">Unchanged</p>
                <p className="text-xl font-bold text-neutral-400">
                  {reassignResult.totalUpdateAccounts - reassignResult.reassignedCount}
                </p>
              </div>
            </div>

            {reassignResult.reassignedDetails && reassignResult.reassignedDetails.length > 0 && (
              <div className="bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-neutral-800">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Reassignment Details</p>
                </div>
                <div className="overflow-y-auto divide-y divide-neutral-800">
                  {detailsPagination.paginatedItems.map((detail: any, idx: number) => (
                    <div key={idx} className="px-4 py-2.5 flex items-center justify-between text-xs">
                      <span className="text-white font-medium truncate mr-2">{detail.accountName || detail.accountId}</span>
                      <span className="text-purple-400 font-bold whitespace-nowrap">→ {detail.newRepName || detail.newRepId}</span>
                    </div>
                  ))}
                </div>
                {detailsPagination.pageSize !== "All" && reassignResult.reassignedDetails.length > (detailsPagination.pageSize as number) && (
                  <div className="border-t border-neutral-800">
                    <Pagination
                      currentPage={detailsPagination.currentPage}
                      pageSize={detailsPagination.pageSize}
                      totalItems={reassignResult.reassignedDetails.length}
                      onPageChange={detailsPagination.setCurrentPage}
                      onPageSizeChange={detailsPagination.setPageSize}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Rebalance Confirmation Modal */}
      {showRebalanceConfirm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowRebalanceConfirm(false)}>
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-center">
                <FiAlertTriangle size={22} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Rebalance All Accounts</h3>
                <p className="text-xs text-neutral-500 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-neutral-300 mb-6 leading-relaxed">
              This will redistribute <strong className="text-white">all</strong> update accounts evenly across the
              configured groups. Existing assignments will be overwritten.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRebalanceConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold text-sm rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReassign(true)}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-amber-900/20"
              >
                Yes, Rebalance All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
