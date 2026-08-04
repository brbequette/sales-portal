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
  // Incrementing this triggers the customizer modal inside DashboardView
  const [customizeTrigger, setCustomizeTrigger] = useState(0)

  const effectiveRole = preferences.impersonatedUser ? preferences.impersonatedUser.role : (currentUser?.role || "")
  const normalizedRole = effectiveRole.toLowerCase()
  const isAdminUser = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  // Derive the display name shown in the header badge
  const displayRepName = preferences.impersonatedUser
    ? preferences.impersonatedUser.name
    : (currentUser?.name || null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/get-users")
      const d = await res.json()
      if (d.users) setAllDbUsers(d.users)
    } catch (e) {}
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header Row ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">

        {/* Left: title + subtitle + rep badge */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 shrink-0">
            <FiTarget className="text-orange-500" size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight text-white">
                Executive Dashboard &amp; KPIs
              </h1>
              {/* Rep name pill — always visible */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/25 text-orange-300 text-[11px] font-bold tracking-wide">
                <FiUser size={10} />
                {isAdminUser && !preferences.impersonatedUser
                  ? "Company — All Reps"
                  : (displayRepName || "My View")}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 font-medium">
              Live revenue totals, MTD profit, commission goals, win/loss breakdown, and sales leaderboard.
            </p>
          </div>
        </div>

        {/* Right: Customize Layout button + Admin "View as Rep" dropdown */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">

          {/* ⚙️ Customize Layout — always visible */}
          <button
            onClick={() => setCustomizeTrigger(prev => prev + 1)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-bold border border-white/10 hover:border-white/20 transition-all shadow"
          >
            <FiSliders size={13} />
            Customize Layout
          </button>

          {/* Impersonation dropdown — Admin only */}
          {isAdminUser && allDbUsers.length > 0 && (
            <div className="flex items-center gap-2 bg-neutral-900 border border-white/10 rounded-xl px-3.5 py-2 shadow-lg">
              <FiEye size={14} className="text-neutral-400" />
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">View as Rep:</span>
              <select
                value={preferences.impersonatedUser?.id || ""}
                onChange={e => {
                  const id = e.target.value;
                  if (!id) {
                    updatePreferences({ impersonatedUser: null });
                  } else {
                    const u = allDbUsers.find(user => user.id === id);
                    if (u) {
                      updatePreferences({ impersonatedUser: { id: u.id, name: u.name, email: u.email, role: u.role } });
                    }
                  }
                }}
                className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="">🏢 Company Totals (All Reps)</option>
                {allDbUsers
                  .filter(u => u.name && !u.email?.includes("dummy.titandiamond.com") && !u.email?.includes("example.com"))
                  .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.role?.toLowerCase().includes('admin') ? '(Admin)' : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Dashboard Content ───────────────────────────────────────────── */}
      <DashboardView
        repName={preferences.impersonatedUser
          ? preferences.impersonatedUser.name
          : (currentUser?.name || null)
        }
        isAdmin={isAdminUser}
        repEmail={preferences.impersonatedUser
          ? preferences.impersonatedUser.email
          : currentUser?.email || null
        }
        triggerCustomize={customizeTrigger}
      />
    </div>
  )
}
