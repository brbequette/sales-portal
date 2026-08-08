"use client"

import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import { DashboardView } from "@/components/DashboardView"
import { useState, useEffect } from "react"
import { FiEye, FiTarget, FiSliders, FiUser } from "react-icons/fi"

export default function HomeDashboard() {
  const { zohoContext: currentUser } = useZoho()
  const { preferences, updatePreferences } = usePreferences()
  const [allDbUsers, setAllDbUsers] = useState<any[]>([])
  const [customizeTrigger, setCustomizeTrigger] = useState(0)

  const effectiveRole = preferences.impersonatedUser ? preferences.impersonatedUser.role : (currentUser?.role || "")
  const normalizedRole = effectiveRole.toLowerCase()
  const isAdminUser = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const displayRepName = preferences.impersonatedUser
    ? preferences.impersonatedUser.name
    : (currentUser?.name || null)

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/get-users")
      const d = await res.json()
      if (d.users) setAllDbUsers(d.users)
    } catch (e) {}
  }

  return (
    <div className="page-content">

      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center shrink-0">
            <FiTarget className="text-orange-400" size={17} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title">Executive Dashboard</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 text-[10px] font-bold">
                <FiUser size={9} />
                {isAdminUser && !preferences.impersonatedUser
                  ? "Company — All Reps"
                  : (displayRepName || "My View")}
              </span>
            </div>
            <p className="page-subtitle">Live revenue, MTD profit, commission goals &amp; leaderboard</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            onClick={() => setCustomizeTrigger(prev => prev + 1)}
            className="td-btn td-btn-ghost td-btn-sm"
          >
            <FiSliders size={13} />
            Customize
          </button>

          {isAdminUser && allDbUsers.length > 0 && (
            <div className="flex items-center gap-2 glass-panel rounded-xl px-3 py-1.5">
              <FiEye size={13} className="text-neutral-500 shrink-0" />
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider hidden sm:inline">View as:</span>
              <select
                value={preferences.impersonatedUser?.id || ""}
                onChange={e => {
                  const id = e.target.value
                  if (!id) {
                    updatePreferences({ impersonatedUser: null })
                  } else {
                    const u = allDbUsers.find(user => user.id === id)
                    if (u) updatePreferences({ impersonatedUser: { id: u.id, name: u.name, email: u.email, role: u.role } })
                  }
                }}
                className="bg-transparent border-none text-xs font-bold text-white focus:outline-none cursor-pointer max-w-[160px]"
              >
                <option value="">🏢 Company Totals</option>
                {allDbUsers
                  .filter(u => u.name && !u.email?.includes("dummy.titandiamond.com") && !u.email?.includes("example.com"))
                  .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.role?.toLowerCase().includes('admin') ? ' (Admin)' : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ─── Dashboard Body ─────────────────────────────────────── */}
      <div className="page-body animate-fade-in">
        <DashboardView
          repName={preferences.impersonatedUser ? preferences.impersonatedUser.name : (currentUser?.name || null)}
          isAdmin={isAdminUser}
          repEmail={preferences.impersonatedUser ? preferences.impersonatedUser.email : currentUser?.email || null}
          triggerCustomize={customizeTrigger}
        />
      </div>
    </div>
  )
}
