"use client"

import { useState } from "react"
import { FiChevronDown, FiCheck, FiLoader } from "react-icons/fi"

export const ACCOUNT_STATUSES = [
  { value: "Personal",       color: "bg-emerald-900/40 text-emerald-400 border-emerald-500/30" },
  { value: "Open",           color: "bg-blue-900/40 text-blue-400 border-blue-500/30" },
  { value: "Hot Lead",       color: "bg-red-900/40 text-red-400 border-red-500/30" },
  { value: "New Lead",       color: "bg-purple-900/40 text-purple-400 border-purple-500/30" },
  { value: "VIP",            color: "bg-amber-900/40 text-amber-400 border-amber-500/30" },
  { value: "Update Status",  color: "bg-orange-900/40 text-orange-400 border-orange-500/30" },
  { value: "Inactive",       color: "bg-neutral-800 text-neutral-500 border-neutral-700" },
  { value: "Do Not Contact", color: "bg-red-950 text-red-600 border-red-900/50" },
]

export function statusStyle(status: string) {
  return ACCOUNT_STATUSES.find(s => s.value === status)?.color || "bg-neutral-800 text-neutral-400 border-neutral-700"
}

interface Props {
  accountId?: string
  zohoId?: string
  currentStatus: string
  onUpdated?: (newStatus: string) => void
  compact?: boolean
}

export function StatusPicker({ accountId, zohoId, currentStatus, onUpdated, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(currentStatus)

  const update = async (newStatus: string) => {
    if (newStatus === status) { setOpen(false); return }
    setSaving(true)
    setOpen(false)
    try {
      const res = await fetch("/api/update-account-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, zohoId, status: newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus(newStatus)
        onUpdated?.(newStatus)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const style = statusStyle(status)

  return (
    <div className="relative inline-block">
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        disabled={saving}
        className={`inline-flex items-center gap-1 border rounded-full font-bold transition-all hover:opacity-80 ${style} ${
          compact ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
        }`}
      >
        {saving ? <FiLoader size={10} className="animate-spin" /> : null}
        {status}
        <FiChevronDown size={compact ? 10 : 11} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1 z-50 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden min-w-[170px]">
            <div className="px-3 py-1.5 border-b border-neutral-800">
              <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Set Status</span>
            </div>
            {ACCOUNT_STATUSES.map(s => (
              <button
                key={s.value}
                onClick={() => update(s.value)}
                className={`w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-800 transition-colors text-left`}
              >
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.color}`}>
                  {s.value}
                </span>
                {s.value === status && <FiCheck size={13} className="text-emerald-400 ml-2" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

