"use client"

import { useState } from "react"
import { FiChevronDown, FiCheck, FiLoader, FiClock } from "react-icons/fi"

export const TIMEZONES = [
  { value: "EST", label: "EST (Eastern)", color: "bg-blue-900/40 text-blue-400 border-blue-500/30" },
  { value: "CST", label: "CST (Central)", color: "bg-purple-900/40 text-purple-400 border-purple-500/30" },
  { value: "MST", label: "MST (Mountain)", color: "bg-orange-900/40 text-orange-400 border-orange-500/30" },
  { value: "PST", label: "PST (Pacific)", color: "bg-emerald-900/40 text-emerald-400 border-emerald-500/30" },
  { value: "AST", label: "AST (Alaska)", color: "bg-neutral-800 text-neutral-400 border-neutral-700" },
  { value: "HST", label: "HST (Hawaii)", color: "bg-neutral-800 text-neutral-400 border-neutral-700" },
]

export function timezoneStyle(tz: string) {
  return TIMEZONES.find(t => t.value === tz)?.color || "bg-neutral-800 text-neutral-400 border-neutral-700"
}

export function timezoneLabel(tz: string) {
  return TIMEZONES.find(t => t.value === tz)?.label || tz || "Set Timezone"
}

interface Props {
  accountId?: string
  zohoId?: string
  currentTimezone: string | null
  onUpdated?: (newTimezone: string) => void
  compact?: boolean
}

export function TimezonePicker({ accountId, zohoId, currentTimezone, onUpdated, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [timezone, setTimezone] = useState(currentTimezone || "")

  const update = async (newTimezone: string) => {
    if (newTimezone === timezone) { setOpen(false); return }
    setSaving(true)
    setOpen(false)
    try {
      const res = await fetch("/api/update-account-timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, zohoId, timeZone: newTimezone }),
      })
      const data = await res.json()
      if (data.success) {
        setTimezone(newTimezone)
        onUpdated?.(newTimezone)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const style = timezoneStyle(timezone)
  const label = timezoneLabel(timezone)

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        disabled={saving}
        className={`inline-flex items-center gap-1 border rounded-full font-bold transition-all hover:opacity-80 ${style} ${
          compact ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
        }`}
        title={timezone ? `Timezone: ${timezone}` : "No timezone set"}
      >
        {saving ? <FiLoader size={10} className="animate-spin" /> : <FiClock size={10} />}
        <span>{label}</span>
        <FiChevronDown size={compact ? 10 : 11} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1 z-50 glass-panel border border-neutral-700 rounded-xl shadow-2xl overflow-hidden min-w-[150px]">
            <div className="px-3 py-1.5 border-b border-white/10">
              <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Set Timezone</span>
            </div>
            {TIMEZONES.map(t => (
              <button
                key={t.value}
                onClick={(e) => { e.stopPropagation(); update(t.value); }}
                className={`w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 transition-colors text-left`}
              >
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${t.color}`}>
                  {t.label}
                </span>
                {t.value === timezone && <FiCheck size={13} className="text-emerald-400 ml-2" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

