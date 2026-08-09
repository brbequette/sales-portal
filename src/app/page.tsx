"use client"

import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import { DashboardView } from "@/components/DashboardView"
import { ExecDashboardModal } from "@/components/ExecDashboardModal"
import { useState, useEffect } from "react"
import { FiSliders, FiTrendingUp, FiTarget } from "react-icons/fi"

export default function HomeDashboard() {
  const { zohoContext: currentUser } = useZoho()
  const { preferences } = usePreferences()
  const [allDbUsers, setAllDbUsers] = useState<any[]>([])
  const [customizeTrigger, setCustomizeTrigger] = useState(0)
  const [showExecModal, setShowExecModal] = useState(false)

  const effectiveRole = currentUser?.role || ""
  const normalizedRole = effectiveRole.toLowerCase()
  const isAdminUser =
    normalizedRole.includes("admin") ||
    normalizedRole === "administrator" ||
    normalizedRole.includes("collections") ||
    normalizedRole.includes("manager")

  // Always show the personal rep view on the homepage
  const displayRepName = currentUser?.name || null
  const displayRepEmail = currentUser?.email || null

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

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center shrink-0">
            <FiTarget className="text-orange-400" size={17} />
          </div>
          <div className="min-w-0">
            <h1 className="page-title">My Dashboard</h1>
            <p className="page-subtitle">Your personal sales activity, goals &amp; pipeline</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Customize personal view */}
          <button
            onClick={() => setCustomizeTrigger(prev => prev + 1)}
            className="td-btn td-btn-ghost td-btn-sm"
          >
            <FiSliders size={13} />
            <span className="hidden sm:inline">Customize</span>
          </button>

          {/* Admin-only: Open Exec Dashboard modal */}
          {isAdminUser && (
            <button
              onClick={() => setShowExecModal(true)}
              className="td-btn td-btn-sm flex items-center gap-2"
              style={{ background: "linear-gradient(135deg,#c2410c,#ea580c)", color: "#fff", border: "none" }}
            >
              <FiTrendingUp size={13} />
              <span className="hidden sm:inline">Exec View</span>
              <span className="sm:hidden">📊</span>
            </button>
          )}
        </div>
      </div>

      {/* Personal Rep Dashboard — no admin company data */}
      <div className="page-body animate-fade-in">
        <DashboardView
          repName={displayRepName}
          isAdmin={false}
          repEmail={displayRepEmail}
          triggerCustomize={customizeTrigger}
        />
      </div>

      {/* Admin-only: Full Executive Dashboard Modal (portal, rendered outside layout) */}
      {isAdminUser && (
        <ExecDashboardModal
          isOpen={showExecModal}
          onClose={() => setShowExecModal(false)}
          allDbUsers={allDbUsers}
        />
      )}
    </div>
  )
}
