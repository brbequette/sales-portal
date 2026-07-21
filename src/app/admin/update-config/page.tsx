"use client"


import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { usePagination, Pagination } from "@/components/Pagination"
import {
  FiSettings, FiUsers, FiRefreshCw, FiSave, FiAlertTriangle,
  FiShield, FiCheckCircle, FiX, FiChevronDown, FiActivity, FiTarget, FiDollarSign, FiClock, FiMessageSquare, FiPieChart
} from "react-icons/fi"

interface User {
  id: string
  name: string
  email: string
  role: string
}

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
  collectionsManagerId: string
}

interface ReassignmentResult {
  success: boolean
  markedInactive: number
  totalUpdateAccounts: number
  reassignedCount: number
  reassignedDetails: any[]
}



export default function AdminSettingsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [rebalancing, setRebalancing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showRebalanceConfirm, setShowRebalanceConfirm] = useState(false)

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
    collectionsManagerId: "",
  })

  const [users, setUsers] = useState<User[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})

  const [apiError, setApiError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [reassignResult, setReassignResult] = useState<ReassignmentResult | null>(null)

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const detailsPagination = usePagination(reassignResult?.reassignedDetails || [])

  const fetchConfig = useCallback(async () => {
    try {
      setApiError(null)
      const res = await fetch("/api/get-update-config")
      const data = await res.json()
      if (data.success) {
        setConfig(data.config)
        setUsers(data.users || [])
        setCounts(data.counts || {})
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
    fetchConfig()
  }, [fetchConfig])

  // Auto-dismiss success messages
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
        setSuccessMsg("Configuration saved successfully!")
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

  const handleReassign = async (rebalanceAll: boolean) => {
    if (rebalanceAll) setRebalancing(true)
    else setReassigning(true)
    setApiError(null)
    setSuccessMsg(null)
    setReassignResult(null)
    setShowRebalanceConfirm(false)
    try {
      const res = await fetch("/api/trigger-reassignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rebalanceAll }),
      })
      const data = await res.json()
      if (data.success) {
        setReassignResult(data)
        setSuccessMsg(
          rebalanceAll
            ? `Rebalance complete! ${data.reassignedCount} accounts reassigned.`
            : `Reassignment complete! ${data.markedInactive} marked inactive, ${data.reassignedCount} reassigned.`
        )
        fetchConfig()
      } else {
        setApiError(data.error || "Reassignment failed")
      }
    } catch (err: any) {
      setApiError(err.message || "Network error")
    } finally {
      setReassigning(false)
      setRebalancing(false)
    }
  }

  const handleRefreshProducts = async () => {
    setRefreshing(true)
    setApiError(null)
    setSuccessMsg(null)
    try {
      let page = 1
      let hasMore = true
      
      while (hasMore) {
        const res = await fetch(`/api/get-products?reseed=true&page=${page}`)
        const text = await res.text()
        
        if (!text) {
          throw new Error("Empty response from server (Timeout)")
        }
        
        let data
        try {
          data = JSON.parse(text)
        } catch (e) {
          throw new Error("Invalid response format from server")
        }
        
        if (!data.success) {
          throw new Error(data.error || data.message || "Failed to refresh products")
        }
        
        hasMore = data.hasMore
        page = data.nextPage
      }
      
      setSuccessMsg("Product catalog fully synchronized!")
    } catch (err: any) {
      setApiError(err.message || "Network error")
    } finally {
      setRefreshing(false)
    }
  }

  const groupKeys: (keyof Config)[] = [
    "group1RepId",
    "group2RepId",
    "group3RepId",
    "group4RepId",
  ]
  const groupLabels = ["Group 1", "Group 2", "Group 3", "Group 4"]
  const groupColors = [
    { border: "border-purple-500/30", bg: "bg-purple-950/20", text: "text-purple-400", badge: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    { border: "border-blue-500/30", bg: "bg-blue-950/20", text: "text-blue-400", badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    { border: "border-sky-500/30", bg: "bg-sky-950/20", text: "text-sky-400", badge: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
    { border: "border-teal-500/30", bg: "bg-teal-950/20", text: "text-teal-400", badge: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
  ]

  return (
    <div className="flex flex-col text-neutral-100 font-sans overflow-y-auto" style={{ height: "100%" }}>
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-5 overflow-y-auto safe-bottom">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30">
              <FiSettings size={20} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Update Configuration</h1>
              <p className="text-xs text-neutral-500">Manage update account configuration &amp; assignments</p>
            </div>
          </div>
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

        {/* Inactivity Timeframe Card */}
        <div className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FiActivity size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Inactivity Timeframe</h2>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Accounts with no purchases within this timeframe will be marked as inactive during reassignment.
          </p>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="number"
                min={1}
                max={120}
                value={config.timeframeMonths}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    timeframeMonths: parseInt(e.target.value) || 12,
                  }))
                }
                className="w-24 bg-black/20 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold text-center focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <span className="text-sm text-neutral-400 font-medium">months</span>
          </div>
        </div>

        {/* Update Groups Grid */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FiUsers size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Update Groups</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groupKeys.map((key, idx) => {
              const selectedRepId = config[key] as string
              const selectedUser = users.find((u) => u.id === selectedRepId)
              const count = selectedRepId ? (counts[selectedRepId] || 0) : 0

              return (
                <div
                  key={key}
                  className={`glass-panel border border-white/10 rounded-2xl p-4 shadow-lg hover:border-neutral-700 transition-all duration-200`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold uppercase tracking-wider ${groupColors[idx].text}`}>
                      {groupLabels[idx]}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${groupColors[idx].badge}`}
                    >
                      {count} accounts
                    </span>
                  </div>

                  <div className="relative">
                    <select
                      value={selectedRepId}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, [key]: e.target.value }))
                      }
                      className="w-full bg-black/20 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-purple-500 transition-colors appearance-none cursor-pointer pr-8"
                    >
                      <option value="">â€” Select Rep â€”</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                    <FiChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
                    />
                  </div>

                  {selectedUser && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-300">
                        {selectedUser.name?.charAt(0) || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{selectedUser.name}</p>
                        <p className="text-[10px] text-neutral-500 truncate">{selectedUser.role}</p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div 
            onClick={() => router.push('/admin/users')}
            className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg hover:border-purple-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-purple-950/40 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <FiUsers size={18} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Users</h2>
            </div>
            <p className="text-xs text-neutral-400">
              Manage user permissions and campaign access.
            </p>
          </div>

          <div 
            onClick={() => router.push('/admin/campaigns')}
            className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg hover:border-purple-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-purple-950/40 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <FiTarget size={18} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Campaigns</h2>
            </div>
            <p className="text-xs text-neutral-400">
              Manage blast templates and view historical logs.
            </p>
          </div>

          <div 
            onClick={() => router.push('/admin/scripts')}
            className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg hover:border-purple-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-purple-950/40 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <FiMessageSquare size={18} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Call Scripts</h2>
            </div>
            <p className="text-xs text-neutral-400">
              Manage call scripts and merge data fields.
            </p>
          </div>

          <div 
            onClick={() => router.push('/admin/communications')}
            className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg hover:border-purple-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-purple-950/40 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <FiMessageSquare size={18} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Communications</h2>
            </div>
            <p className="text-xs text-neutral-400">
              Manage authorized Zoho Voice phone numbers.
            </p>
          </div>

          <div 
            onClick={() => router.push('/admin/holidays')}
            className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg hover:border-purple-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-purple-950/40 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <FiActivity size={18} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Holiday Exclusions</h2>
            </div>
            <p className="text-xs text-neutral-400">
              Manage dates excluded from workday target calculations.
            </p>
          </div>

          <div 
            onClick={() => router.push('/admin/update-accounts')}
            className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg hover:border-purple-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-purple-950/40 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <FiTarget size={18} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Update Accounts</h2>
            </div>
            <p className="text-xs text-neutral-400">
              View and manually reassign accounts in Update Status.
            </p>
          </div>

          <div 
            onClick={() => router.push('/admin/payouts')}
            className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg hover:border-purple-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-purple-950/40 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <FiDollarSign size={18} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Payouts & Ledger</h2>
            </div>
            <p className="text-xs text-neutral-400">
              Manage sales rep payouts, running balances, and commissions.
            </p>
          </div>

          <div 
            onClick={() => router.push('/?tab=dashboard')}
            className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg hover:border-emerald-500/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-emerald-950/40 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <FiPieChart size={18} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Sales Dashboard</h2>
            </div>
            <p className="text-xs text-neutral-400">
              View the live Titan Diamond Sales Monitor application.
            </p>
          </div>
        </div>

        {/* Visible Sales Reps Card */}
        <div className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FiUsers size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Visible Sales Reps</h2>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Select the sales representatives that should be displayed across the portal (Sales Hub, Stats, Commissions).
            Unselected users will still exist in the database but their historic data won't clutter the UI.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {users.map((u) => {
              const isVisible = config.visibleReps?.includes(u.id) || false
              return (
                <label 
                  key={u.id} 
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isVisible ? "bg-purple-900/20 border-purple-500/30" : "bg-black/20 border-white/10 hover:border-neutral-700"}`}
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={(e) => {
                      setConfig(c => {
                        const newSet = new Set(c.visibleReps || [])
                        if (e.target.checked) newSet.add(u.id)
                        else newSet.delete(u.id)
                        return { ...c, visibleReps: Array.from(newSet) }
                      })
                    }}
                    className="mt-0.5 w-4 h-4 rounded border-neutral-700 glass-panel text-purple-600 focus:ring-purple-500"
                  />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold truncate ${isVisible ? "text-purple-100" : "text-white"}`}>{u.name}</p>
                    <p className="text-[10px] text-neutral-500 truncate">{u.email}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Collections Manager Card */}
        <div className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FiDollarSign size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Collections Manager Role</h2>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Assign the Collections Manager. This user receives a commission bonus on total incoming company payments for each week starting after June 8, 2026.
          </p>
          <div className="space-y-3">
            <select
              value={config.collectionsManagerId || ""}
              onChange={(e) => setConfig(c => ({ ...c, collectionsManagerId: e.target.value }))}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
            >
              <option value="">-- None --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Rep Targets Card */}
        <div className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <FiTarget size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Representative Daily Sales Targets</h2>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Set individual daily sales targets (profit and subtotal goals) for each rep.
          </p>
          <div className="space-y-3">
            {users.map((u) => {
              const currentVal = config.salesTargets[u.id] ?? 0
              return (
                <div key={u.id} className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{u.name}</p>
                    <p className="text-[10px] text-neutral-500 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500 text-xs">Profit $</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={currentVal || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setConfig((c) => ({
                            ...c,
                            salesTargets: { ...c.salesTargets, [u.id]: val }
                          }))
                        }}
                        className="w-24 bg-black/20 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 text-right font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500 text-xs">Subtotal $</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={config.subtotalTargets?.[u.id] || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setConfig((c) => ({
                            ...c,
                            subtotalTargets: { ...(c.subtotalTargets || {}), [u.id]: val }
                          }))
                        }}
                        className="w-24 bg-black/20 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 text-right font-mono"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20 hover:shadow-purple-900/40"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiSave size={16} />
              )}
              {saving ? "Saving..." : "Save Settings"}
            </button>

            {/* Run Reassignment */}
            <button
              onClick={() => handleReassign(false)}
              disabled={reassigning}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reassigning ? (
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiRefreshCw size={16} className="text-purple-400" />
              )}
              {reassigning ? "Running..." : "Run Reassignment"}
            </button>

            {/* Refresh Products */}
            <button
              onClick={handleRefreshProducts}
              disabled={refreshing}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? (
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiRefreshCw size={16} className="text-emerald-400" />
              )}
              {refreshing ? "Refreshing..." : "Refresh Products"}
            </button>

            {/* Rebalance All */}
            <button
              onClick={() => setShowRebalanceConfirm(true)}
              disabled={rebalancing}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-amber-950/30 hover:bg-amber-950/50 border border-amber-500/30 text-amber-400 font-bold text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rebalancing ? (
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiAlertTriangle size={16} />
              )}
              {rebalancing ? "Rebalancing..." : "Rebalance All"}
            </button>
          </div>
        </div>

        {/* Reassignment Results */}
        {reassignResult && (
          <div className="glass-panel border border-white/10 rounded-2xl p-5 shadow-lg animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 mb-4">
              <FiCheckCircle size={16} className="text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Reassignment Results</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-black/20 rounded-xl p-3 border border-white/10 text-center">
                <p className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider mb-1">Marked Inactive</p>
                <p className="text-xl font-bold text-amber-400">{reassignResult.markedInactive}</p>
              </div>
              <div className="bg-black/20 rounded-xl p-3 border border-white/10 text-center">
                <p className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider mb-1">Total Update</p>
                <p className="text-xl font-bold text-purple-400">{reassignResult.totalUpdateAccounts}</p>
              </div>
              <div className="bg-black/20 rounded-xl p-3 border border-white/10 text-center">
                <p className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider mb-1">Reassigned</p>
                <p className="text-xl font-bold text-emerald-400">{reassignResult.reassignedCount}</p>
              </div>
              <div className="bg-black/20 rounded-xl p-3 border border-white/10 text-center">
                <p className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider mb-1">Unchanged</p>
                <p className="text-xl font-bold text-neutral-400">
                  {reassignResult.totalUpdateAccounts - reassignResult.reassignedCount}
                </p>
              </div>
            </div>

            {reassignResult.reassignedDetails && reassignResult.reassignedDetails.length > 0 && (
              <div className="bg-black/20 rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/10">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Reassignment Details</p>
                </div>
                <div className="overflow-y-auto divide-y divide-neutral-800">
                  {detailsPagination.paginatedItems.map((detail: any, idx: number) => (
                    <div key={idx} className="px-4 py-2.5 flex items-center justify-between text-xs">
                      <span className="text-white font-medium truncate mr-2">{detail.accountName || detail.accountId}</span>
                      <span className="text-purple-400 font-bold whitespace-nowrap">â†’ {detail.newRepName || detail.newRepId}</span>
                    </div>
                  ))}
                </div>
                {detailsPagination.pageSize !== "All" && reassignResult.reassignedDetails.length > (detailsPagination.pageSize as number) && (
                  <div className="border-t border-white/10">
                    <Pagination
                      currentPage={detailsPagination.currentPage}
                      pageSize={detailsPagination.pageSize}
                      totalItems={reassignResult.reassignedDetails.length}
                      onPageChange={detailsPagination.setCurrentPage}
                      onPageSizeChange={detailsPagination.setPageSize}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Rebalance Confirmation Modal */}
      {showRebalanceConfirm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowRebalanceConfirm(false)}>
          <div
            className="glass-panel border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-center">
                <FiAlertTriangle size={22} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Rebalance All Accounts</h3>
                <p className="text-xs text-neutral-500 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-neutral-300 mb-6 leading-relaxed">
              This will redistribute <strong className="text-white">all</strong> update accounts evenly across the
              configured groups. Existing assignments will be overwritten.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRebalanceConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold text-sm rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReassign(true)}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-amber-900/20"
              >
                Yes, Rebalance All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

