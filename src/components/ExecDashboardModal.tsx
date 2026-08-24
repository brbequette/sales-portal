"use client"

import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { FiX, FiEye, FiTrendingUp } from "react-icons/fi"
import { ExecutiveRepStats } from "@/components/ExecutiveRepStats"
import { usePreferences } from "@/components/PreferencesProvider"

interface ExecDashboardModalProps {
  isOpen: boolean
  onClose: () => void
  allDbUsers: any[]
}

export function ExecDashboardModal({ isOpen, onClose, allDbUsers }: ExecDashboardModalProps) {
  const { preferences, updatePreferences } = usePreferences()
  const [mounted, setMounted] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Escape key close
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  // Prevent body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

  if (!mounted || !isOpen) return null

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9990] flex flex-col"
      style={{ background: "rgba(5,5,7,0.96)", backdropFilter: "blur(6px)" }}
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-surface border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center">
            <FiTrendingUp className="text-orange-400" size={16} />
          </div>
          <div>
            <h2 className="text-lg font-black text-white leading-tight">Executive Dashboard</h2>
            <p className="text-xs text-neutral-500">Company-wide revenue, rep performance &amp; leaderboard</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {allDbUsers.length > 0 && (
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5">
              <FiEye size={13} className="text-neutral-500 shrink-0" />
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider hidden sm:inline">View as:</span>
              <select
                value={preferences.impersonatedUser?.id || ""}
                onChange={e => {
                  const id = e.target.value
                  if (!id) {
                    updatePreferences({ impersonatedUser: null })
                  } else {
                    const u = allDbUsers.find(u => u.id === id)
                    if (u) updatePreferences({ impersonatedUser: { id: u.id, name: u.name, email: u.email, role: u.role } })
                  }
                }}
                className="bg-transparent border-none text-xs font-bold text-white focus:outline-none cursor-pointer max-w-[160px]"
              >
                <option value="">🏢 Company Totals</option>
                {allDbUsers
                  .filter(u => u.name && !u.email?.includes("dummy.titandiamond.com") && !u.email?.includes("example.com"))
                  .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.role?.toLowerCase().includes("admin") ? " (Admin)" : ""}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-colors border border-white/10"
          >
            <FiX size={18} />
          </button>
        </div>
      </div>

      {/* Modal Body */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <ExecutiveRepStats
          repName={preferences.impersonatedUser?.name || null}
          repEmail={preferences.impersonatedUser?.email || null}
        />
      </div>
    </div>,
    document.body
  )
}
