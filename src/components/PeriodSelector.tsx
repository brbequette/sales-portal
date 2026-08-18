"use client"

import { useState } from "react"
import { FiCalendar, FiChevronDown, FiChevronUp } from "react-icons/fi"

export type PeriodValue =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "last_year"
  | "all"
  | "custom"

export interface PeriodOption {
  id: PeriodValue
  label: string
  shortLabel?: string
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { id: "today",        label: "Today",           shortLabel: "Day"   },
  { id: "this_week",    label: "This Week",        shortLabel: "Week"  },
  { id: "this_month",   label: "This Month",       shortLabel: "Month" },
  { id: "last_month",   label: "Last Month",       shortLabel: "Last Mo" },
  { id: "this_quarter", label: "This Quarter",     shortLabel: "Qtr"   },
  { id: "this_year",    label: "This Year (YTD)",  shortLabel: "Annual" },
  { id: "last_year",    label: "Last Year",        shortLabel: "Prev Yr" },
  { id: "all",          label: "All Time",         shortLabel: "All"   },
  { id: "custom",       label: "Custom Range",     shortLabel: "Custom" },
]

/** Return the [start, end] Date range for a given period string. */
export function getPeriodRange(period: PeriodValue, customStart?: string, customEnd?: string): [Date, Date] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

  switch (period) {
    case "today":
      return [today, tomorrow]
    case "this_week": {
      const dow = today.getDay() // 0=Sun
      const mon = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7))
      const sun = new Date(mon); sun.setDate(mon.getDate() + 7)
      return [mon, sun]
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return [start, end]
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end   = new Date(now.getFullYear(), now.getMonth(), 1)
      return [start, end]
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3, 1)
      const end   = new Date(now.getFullYear(), q * 3 + 3, 1)
      return [start, end]
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1)
      const end   = new Date(now.getFullYear() + 1, 0, 1)
      return [start, end]
    }
    case "last_year": {
      const start = new Date(now.getFullYear() - 1, 0, 1)
      const end   = new Date(now.getFullYear(), 0, 1)
      return [start, end]
    }
    case "custom":
      if (customStart && customEnd) {
        return [new Date(customStart + "T00:00:00"), new Date(customEnd + "T23:59:59")]
      }
      // Fall through to all
      return [new Date(0), new Date(8640000000000000)]
    case "all":
    default:
      return [new Date(0), new Date(8640000000000000)]
  }
}

/** Returns true if the given date falls within the period range. */
export function isInPeriod(dateVal: string | Date | null | undefined, period: PeriodValue, customStart?: string, customEnd?: string): boolean {
  if (!dateVal) return period === "all"
  const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal
  if (isNaN(d.getTime())) return period === "all"
  const [start, end] = getPeriodRange(period, customStart, customEnd)
  return d >= start && d < end
}

interface PeriodSelectorProps {
  value: PeriodValue
  onChange: (val: PeriodValue) => void
  options?: PeriodValue[]
  accentColor?: "sky" | "indigo" | "red" | "orange" | "violet" | "emerald" | "amber"
  customStart?: string
  customEnd?: string
  onCustomStartChange?: (v: string) => void
  onCustomEndChange?: (v: string) => void
  className?: string
  compact?: boolean          // Use shortLabel on small screens
}

const ACCENT: Record<string, string> = {
  sky:     "bg-sky-600 text-white shadow-sky-500/20",
  indigo:  "bg-indigo-600 text-white shadow-indigo-500/20",
  red:     "bg-red-600 text-white shadow-red-500/20",
  orange:  "bg-orange-500 text-white shadow-orange-500/20",
  violet:  "bg-violet-600 text-white shadow-violet-500/20",
  emerald: "bg-emerald-600 text-white shadow-emerald-500/20",
  amber:   "bg-amber-500 text-white shadow-amber-500/20",
}

const DEFAULT_OPTIONS: PeriodValue[] = ["today", "this_week", "this_month", "this_year", "all"]

export function PeriodSelector({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  accentColor = "sky",
  customStart = "",
  customEnd = "",
  onCustomStartChange,
  onCustomEndChange,
  className = "",
  compact = false,
}: PeriodSelectorProps) {
  const [showCustom, setShowCustom] = useState(false)

  const visibleOptions = PERIOD_OPTIONS.filter(o => options.includes(o.id))
  const activeAccent = ACCENT[accentColor] || ACCENT.sky

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <FiCalendar size={12} className="text-neutral-500 shrink-0" />
        <div className="glass-panel rounded-xl p-0.5 flex border border-white/10 text-xs font-bold gap-0.5 overflow-x-auto scrollbar-hide">
          {visibleOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                onChange(opt.id)
                if (opt.id === "custom") setShowCustom(true)
                else setShowCustom(false)
              }}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap uppercase tracking-wide transition-all duration-150 ${
                value === opt.id
                  ? `${activeAccent} shadow-md`
                  : "text-neutral-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {compact && opt.shortLabel ? opt.shortLabel : opt.label}
            </button>
          ))}
        </div>
      </div>

      {(value === "custom" || showCustom) && onCustomStartChange && onCustomEndChange && (
        <div className="flex items-center gap-2 pl-5 flex-wrap">
          <input
            type="date"
            value={customStart}
            onChange={e => onCustomStartChange(e.target.value)}
            className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-current transition-colors"
          />
          <span className="text-xs text-neutral-500">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => onCustomEndChange(e.target.value)}
            className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-current transition-colors"
          />
        </div>
      )}
    </div>
  )
}
