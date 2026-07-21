"use client"


import Link from "next/link"
import { useState } from "react"
import { 
  FiUsers, FiClock, FiDollarSign, 
  FiTarget, FiAward, FiCalendar, FiMessageSquare, 
  FiFileText, FiActivity, FiSettings, FiDatabase,
  FiRefreshCw, FiCheckCircle, FiAlertTriangle
} from "react-icons/fi"

const sections = [
  {
    category: "Users & Teams",
    cards: [
      { title: "Manage Users", desc: "View and edit user roles and permissions.", href: "/admin/users", icon: FiUsers, color: "text-blue-400", bg: "bg-blue-500/10" },
      { title: "Timeclock", desc: "Review and manage team time entries.", href: "/admin/timeclock", icon: FiClock, color: "text-emerald-400", bg: "bg-emerald-500/10" },
      { title: "Payouts & Commissions", desc: "Calculate and approve payouts.", href: "/admin/payouts", icon: FiDollarSign, color: "text-amber-400", bg: "bg-amber-500/10" },
    ]
  },
  {
    category: "CRM & Operations",
    cards: [
      { title: "Update Accounts", desc: "Filter and reassign accounts in bulk.", href: "/admin/update-accounts", icon: FiTarget, color: "text-purple-400", bg: "bg-purple-500/10" },
      { title: "Update Configurations", desc: "Set target sub-totals and distribute group rules.", href: "/admin/update-config", icon: FiSettings, color: "text-pink-400", bg: "bg-pink-500/10" },
      { title: "VIG Management", href: "/admin/vig", desc: "Manage Very Important Groups.", icon: FiAward, color: "text-yellow-400", bg: "bg-yellow-500/10" },
      { title: "Holidays", desc: "Configure working holidays for time calculations.", href: "/admin/holidays", icon: FiCalendar, color: "text-red-400", bg: "bg-red-500/10" },
    ]
  },
  {
    category: "Communications",
    cards: [
      { title: "Campaigns", desc: "Schedule and send bulk SMS/Email blasts.", href: "/admin/campaigns", icon: FiMessageSquare, color: "text-cyan-400", bg: "bg-cyan-500/10" },
      { title: "Scripts", desc: "Manage pre-written reply scripts and macros.", href: "/admin/scripts", icon: FiFileText, color: "text-orange-400", bg: "bg-orange-500/10" },
      { title: "Comm Log", desc: "Review global communication history.", href: "/admin/communications", icon: FiActivity, color: "text-teal-400", bg: "bg-teal-500/10" },
    ]
  },
  {
    category: "System",
    cards: [
      { title: "Zoho Books Scripts", desc: "Run batch operations: tariff updates, draft processing, and maintenance.", href: "/admin/books-scripts", icon: FiDatabase, color: "text-amber-400", bg: "bg-amber-500/10" },
      { title: "System Settings", desc: "Configure Push Notifications, API settings, and AI prompts.", href: "/admin/settings", icon: FiSettings, color: "text-neutral-400", bg: "bg-neutral-500/10" },
      { title: "Data Backfill", desc: "Populate line items for all invoices, SOs, and quotes from Zoho Books.", href: "/admin/backfill", icon: FiDatabase, color: "text-sky-400", bg: "bg-sky-500/10" },
    ]
  }
]

export default function AdminDashboardPage() {
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<string>("")
  const [syncResults, setSyncResults] = useState<Record<string, { synced: number, skipped: number, apiCalls: number, error?: string }>>({})
  const [syncError, setSyncError] = useState<string | null>(null)

  const syncEntityAllPages = async (entity: string) => {
    let page = 1
    let totalSynced = 0
    let totalSkipped = 0
    let totalApiCalls = 0

    while (true) {
      setSyncProgress(`${entity}: page ${page}... (${totalSynced} synced so far)`)

      const res = await fetch('/api/admin/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, page })
      })

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('json')) {
        throw new Error(res.status === 504 ? `Timed out on page ${page}` : `Server error ${res.status} on page ${page}`)
      }

      const data = await res.json()
      if (!data.success) throw new Error(data.error || `Failed on page ${page}`)

      totalSynced += data.synced || 0
      totalSkipped += data.skipped || 0
      totalApiCalls += data.apiCalls || 0

      if (!data.hasMore) break
      page++
      if (page > 100) break // Safety
    }

    return { synced: totalSynced, skipped: totalSkipped, apiCalls: totalApiCalls }
  }

  const handleSyncEntity = async (entity: string) => {
    setSyncing(entity)
    setSyncError(null)
    setSyncProgress("")
    try {
      const result = await syncEntityAllPages(entity)
      setSyncResults(prev => ({ ...prev, [entity]: result }))
    } catch (err: any) {
      setSyncError(`${entity}: ${err.message || 'Failed'}`)
      setSyncResults(prev => ({ ...prev, [entity]: { synced: 0, skipped: 0, apiCalls: 0, error: err.message } }))
    } finally {
      setSyncing(null)
      setSyncProgress("")
    }
  }

  const handleSyncAll = async () => {
    for (const entity of ['contacts', 'invoices', 'salesorders', 'estimates']) {
      setSyncing(entity)
      setSyncError(null)
      try {
        const result = await syncEntityAllPages(entity)
        setSyncResults(prev => ({ ...prev, [entity]: result }))
      } catch (err: any) {
        setSyncResults(prev => ({ ...prev, [entity]: { synced: 0, skipped: 0, apiCalls: 0, error: err.message } }))
      }
    }
    setSyncing(null)
    setSyncProgress("")
  }

  const entityLabels: Record<string, { label: string, color: string, bg: string }> = {
    contacts: { label: 'Accounts', color: 'text-emerald-400', bg: 'bg-emerald-600' },
    invoices: { label: 'Invoices', color: 'text-blue-400', bg: 'bg-blue-600' },
    salesorders: { label: 'Sales Orders', color: 'text-sky-400', bg: 'bg-sky-600' },
    estimates: { label: 'Quotes', color: 'text-amber-400', bg: 'bg-amber-600' },
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-neutral-400 text-sm">Select a module below to manage your system.</p>
      </div>

      <div className="space-y-8">
        {sections.map(section => (
          <div key={section.category}>
            <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-4">
              {section.category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.cards.map(card => (
                <Link 
                  href={card.href} 
                  key={card.title}
                  className="group block p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${card.bg} ${card.color}`}>
                      <card.icon size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-white group-hover:text-emerald-400 transition-colors mb-1">
                        {card.title}
                      </h3>
                      <p className="text-xs text-neutral-400 leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* Bulk Sync Section */}
        <div>
          <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-4">
            Data Sync
          </h2>
          <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-400">
                <FiRefreshCw size={20} className={syncing ? "animate-spin" : ""} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white mb-1">Bulk Sync â€” Zoho Books</h3>
                <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                  Pull accounts, invoices, quotes, and sales orders from Zoho Books. Sync one at a time or all sequentially.
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(entityLabels).map(([key, { label, bg }]) => (
                    <button
                      key={key}
                      onClick={() => handleSyncEntity(key)}
                      disabled={!!syncing}
                      className={`px-4 py-2 ${bg} hover:opacity-90 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {syncing === key ? `Syncing ${label}...` : `Sync ${label}`}
                    </button>
                  ))}
                  <button
                    onClick={handleSyncAll}
                    disabled={!!syncing}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {syncing ? "Syncing..." : "âš¡ Sync All"}
                  </button>
                </div>
              </div>
            </div>

            {syncing && (
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-3">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                {syncProgress || `Syncing ${entityLabels[syncing]?.label || syncing}...`}
              </div>
            )}

            {Object.keys(syncResults).length > 0 && (
              <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                  <FiCheckCircle size={14} />
                  Sync Results
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(syncResults).map(([entity, result]) => (
                    <div key={entity} className={`bg-black/20 rounded p-2 text-center ${result.error ? 'border border-red-500/20' : ''}`}>
                      <div className="text-lg font-black text-white">{result.synced || 0}</div>
                      <div className="text-neutral-500">{entityLabels[entity]?.label || entity}</div>
                      <div className="text-[10px] text-neutral-600">
                        {result.apiCalls || 0} calls Â· {result.skipped || 0} skipped
                      </div>
                      {result.error && (
                        <div className="text-[10px] text-red-400 mt-1">{result.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {syncError && (
              <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-3 flex items-center gap-2 text-red-400 text-xs">
                <FiAlertTriangle size={14} />
                <span>{syncError}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

