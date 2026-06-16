"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { FiSettings, FiSave, FiAlertTriangle, FiShield, FiCheckCircle, FiX, FiActivity, FiArrowLeft } from "react-icons/fi"

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

export default function AdminHolidaysPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  const [apiError, setApiError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const fetchConfig = useCallback(async () => {
    try {
      setApiError(null)
      const res = await fetch("/api/get-update-config")
      const data = await res.json()
      if (data.success) {
        setConfig(data.config)
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
        setSuccessMsg("Holidays saved successfully!")
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

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-neutral-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Holidays...</p>
        </div>
      </div>
    )
  }

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
            <button 
              onClick={() => router.push('/admin')}
              className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition"
            >
              <FiArrowLeft size={20} className="text-neutral-400" />
            </button>
            <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30">
              <FiActivity size={20} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Holiday Management</h1>
              <p className="text-xs text-neutral-500">Exclude holidays from the workday target calculations</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold shadow-lg shadow-purple-900/20 flex items-center gap-2 transition-all"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FiSave size={16} />
            )}
            Save Changes
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

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
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

      </main>
    </div>
  )
}
