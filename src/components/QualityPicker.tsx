"use client"
import { useState } from "react"
import { FiChevronDown, FiCheck, FiLoader } from "react-icons/fi"

export const CUSTOMER_QUALITIES = [
  { value: "HOT",         label: "🔥 HOT",         color: "bg-red-900/40 text-red-400 border-red-500/30" },
  { value: "WARM",        label: "☀️ WARM",        color: "bg-amber-900/40 text-amber-400 border-amber-500/30" },
  { value: "COLD",        label: "❄️ COLD",        color: "bg-sky-900/40 text-sky-400 border-sky-500/30" },
  { value: "ON_HOLD",     label: "⏸️ ON HOLD",     color: "bg-neutral-800 text-neutral-400 border-neutral-700" },
  { value: "DO_NOT_CALL", label: "🚫 DO NOT CALL", color: "bg-red-950 text-red-600 border-red-900/50" },
]

export function qualityStyle(quality: string) {
  return CUSTOMER_QUALITIES.find(q => q.value === quality)?.color || "bg-neutral-800 text-neutral-400 border-neutral-700"
}

export function qualityLabel(quality: string) {
  return CUSTOMER_QUALITIES.find(q => q.value === quality)?.label || quality
}

interface Props {
  accountId?: string
  zohoId?: string
  currentQuality: string
  onUpdated?: (newQuality: string) => void
  compact?: boolean
}

export function QualityPicker({ accountId, zohoId, currentQuality, onUpdated, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [quality, setQuality] = useState(currentQuality || "WARM")

  const update = async (newQuality: string) => {
    if (newQuality === quality) { setOpen(false); return }
    setSaving(true)
    setOpen(false)
    try {
      const res = await fetch("/api/update-account-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, zohoId, quality: newQuality }),
      })
      const data = await res.json()
      if (data.success) {
        setQuality(newQuality)
        onUpdated?.(newQuality)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const style = qualityStyle(quality)
  const label = qualityLabel(quality)

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        disabled={saving}
        className={`inline-flex items-center gap-1 border rounded-full font-bold transition-all hover:opacity-80 ${style} ${
          compact ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
        }`}
      >
        {saving ? <FiLoader size={10} className="animate-spin" /> : null}
        <span>{label}</span>
        <FiChevronDown size={compact ? 10 : 11} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1 z-50 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden min-w-[170px]">
            <div className="px-3 py-1.5 border-b border-neutral-800">
              <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Set Customer Quality</span>
            </div>
            {CUSTOMER_QUALITIES.map(q => (
              <button
                key={q.value}
                onClick={() => update(q.value)}
                className={`w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-800 transition-colors text-left`}
              >
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${q.color}`}>
                  {q.label}
                </span>
                {q.value === quality && <FiCheck size={13} className="text-emerald-400 ml-2" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
