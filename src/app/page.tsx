"use client"

import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import { DashboardView } from "@/components/DashboardView"
import { useState, useEffect } from "react"
import { FiEye, FiTarget } from "react-icons/fi"

export default function HomeDashboard() {
  const { zohoContext: currentUser } = useZoho()
  const { preferences, updatePreferences } = usePreferences()
  const [allDbUsers, setAllDbUsers] = useState<any[]>([])

  const effectiveRole = preferences.impersonatedUser ? preferences.impersonatedUser.role : (currentUser?.role || "")
  const normalizedRole = effectiveRole.toLowerCase()
  const isAdminUser = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

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
      {/* Header & Impersonation Control */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <FiTarget className="text-orange-500" /> Executive Dashboard & KPIs
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-medium">
            Live revenue totals, MTD profit, commission goals, win/loss breakdown, and sales leaderboard.
          </p>
        </div>

        {/* Impersonation dropdown for Admin */}
        {isAdminUser && allDbUsers.length > 0 && (
          <div className="flex items-center gap-2 bg-neutral-900 border border-white/10 rounded-xl px-3.5 py-2 shrink-0 shadow-lg">
            <FiEye size={15} className="text-neutral-400" />
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
              <option value="">Myself (Admin)</option>
              {allDbUsers.filter(u => u.name && !u.email?.includes("dummy.titandiamond.com") && !u.email?.includes("example.com") && u.email?.toLowerCase() !== currentUser?.email?.toLowerCase()).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} {u.role?.toLowerCase().includes('admin') ? '(Admin)' : ''}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Full Dashboard View */}
      <div>
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
        />
      </div>
    </div>
  )
}
