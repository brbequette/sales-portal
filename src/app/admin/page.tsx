"use client"

import Link from "next/link"
import { useState } from "react"
import {
  FiUsers, FiClock, FiDollarSign, FiBarChart2,
  FiTarget, FiAward, FiCalendar, FiMessageSquare,
  FiFileText, FiActivity, FiSettings, FiDatabase,
  FiRefreshCw, FiCheckCircle, FiAlertTriangle, FiZap, FiTruck,
  FiArrowRight, FiSliders, FiCreditCard, FiMapPin, FiCloud,
  FiPackage, FiList
} from "react-icons/fi"

const sections = [
  {
    category: "Users & Teams",
    accentColor: "from-blue-500/20 to-indigo-500/10",
    borderColor: "border-blue-500/20",
    dotColor: "bg-blue-500",
    cards: [
      { title: "Manage Users",              desc: "View and edit user roles and permissions.",                                      href: "/admin/users",          icon: FiUsers,     color: "text-blue-400",    bg: "bg-blue-500/10" },
      { title: "Rep Stats & Breakdown",     desc: "Invoice, sales order, and dead profit totals by rep and date range.",           href: "/admin/rep-stats",      icon: FiBarChart2, color: "text-orange-400",  bg: "bg-orange-500/10" },
      { title: "Timeclock",                 desc: "Review and manage team time entries.",                                          href: "/admin/timeclock",      icon: FiClock,     color: "text-emerald-400", bg: "bg-emerald-500/10" },
      { title: "Payouts & Commissions",     desc: "Calculate and approve commission payouts.",                                     href: "/admin/payouts",        icon: FiDollarSign,color: "text-amber-400",   bg: "bg-amber-500/10" },
      { title: "Payroll",                   desc: "Process and review payroll runs.",                                              href: "/admin/payroll",        icon: FiCreditCard,color: "text-yellow-400",  bg: "bg-yellow-500/10" },
      { title: "Goals & Bonuses",           desc: "Set individual & team performance goals and reward bonuses.",                   href: "/admin/goals-bonuses",  icon: FiAward,     color: "text-amber-400",   bg: "bg-amber-500/10" },
    ]
  },
  {
    category: "CRM & Operations",
    accentColor: "from-emerald-500/20 to-teal-500/10",
    borderColor: "border-emerald-500/20",
    dotColor: "bg-emerald-500",
    cards: [
      { title: "Update Accounts",           desc: "Filter and bulk-reassign accounts across the system.",                         href: "/admin/update-accounts",      icon: FiTarget,        color: "text-blue-400",    bg: "bg-blue-500/10" },
      { title: "Configurations",            desc: "Set target sub-totals and distribute group rules.",                            href: "/admin/update-config",        icon: FiSettings,      color: "text-pink-400",    bg: "bg-pink-500/10" },
      { title: "Sales Flow Builder",        desc: "Configure pipeline stages and sort order.",                                    href: "/admin/sales-stages",         icon: FiSliders,       color: "text-emerald-400", bg: "bg-emerald-500/10" },
      { title: "Notification Rules",        desc: "Configure automated SMS & Email notification templates.",                      href: "/admin/notification-templates",icon: FiMessageSquare, color: "text-cyan-400",    bg: "bg-cyan-500/10" },
      { title: "VIG Management",            desc: "Manage Very Important Group exclusions.",                                      href: "/admin/vig",                  icon: FiAward,         color: "text-yellow-400",  bg: "bg-yellow-500/10" },
      { title: "Holidays",                  desc: "Configure working holidays for time calculations.",                            href: "/admin/holidays",             icon: FiCalendar,      color: "text-red-400",     bg: "bg-red-500/10" },
      { title: "Geofences",                 desc: "Manage territory geofence boundaries.",                                        href: "/admin/geofences",            icon: FiMapPin,        color: "text-rose-400",    bg: "bg-rose-500/10" },
      { title: "Intro Offer Page",          desc: "Access the promotional intro offer order page.",                               href: "/admin/intro-offer",          icon: FiZap,           color: "text-amber-400",   bg: "bg-amber-500/10" },
    ]
  },
  {
    category: "Communications",
    accentColor: "from-cyan-500/20 to-sky-500/10",
    borderColor: "border-cyan-500/20",
    dotColor: "bg-cyan-500",
    cards: [
      { title: "Campaigns",                 desc: "Schedule and send bulk SMS/Email blasts.",                                     href: "/admin/campaigns",      icon: FiMessageSquare, color: "text-cyan-400",    bg: "bg-cyan-500/10" },
      { title: "Scripts",                   desc: "Manage pre-written reply scripts and macros.",                                 href: "/admin/scripts",        icon: FiFileText,      color: "text-orange-400",  bg: "bg-orange-500/10" },
      { title: "Comm Log",                  desc: "Review global communication history.",                                        href: "/admin/communications", icon: FiActivity,      color: "text-teal-400",    bg: "bg-teal-500/10" },
    ]
  },
  {
    category: "Finance",
    accentColor: "from-amber-500/20 to-yellow-500/10",
    borderColor: "border-amber-500/20",
    dotColor: "bg-amber-500",
    cards: [
      { title: "Invoice Management",        desc: "Review, approve, and manage all customer invoices.",                           href: "/admin/invoices",       icon: FiFileText,  color: "text-sky-400",    bg: "bg-sky-500/10" },
      { title: "Shipping Audit",            desc: "Audit line-item shipping coverage and parse freight bills.",                   href: "/admin/shipping-audit", icon: FiTruck,     color: "text-blue-400",   bg: "bg-blue-500/10" },
      { title: "Lead Discrepancies",        desc: "Identify and resolve lead assignment conflicts.",                              href: "/admin/lead-discrepancies", icon: FiAlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    ]
  },
  {
    category: "System",
    accentColor: "from-violet-500/20 to-purple-500/10",
    borderColor: "border-violet-500/20",
    dotColor: "bg-violet-500",
    cards: [
      { title: "Orphaned Records",          desc: "POs and Payments not tied to any invoice.",                                   href: "/admin/orphaned-records",  icon: FiList,      color: "text-red-400",       bg: "bg-red-500/10" },
      { title: "Zoho Books Scripts",        desc: "Run batch operations: tariff updates, draft processing, and maintenance.",    href: "/admin/books-scripts",     icon: FiCloud,     color: "text-amber-400",     bg: "bg-amber-500/10" },
      { title: "Custom Fields",             desc: "Manage custom field definitions and mappings.",                               href: "/admin/custom-fields",     icon: FiList,      color: "text-sky-400",       bg: "bg-sky-500/10" },
      { title: "Data Backfill",             desc: "Populate line items for all invoices, SOs, and quotes from Zoho Books.",      href: "/admin/backfill",          icon: FiDatabase,  color: "text-sky-400",       bg: "bg-sky-500/10" },
      { title: "System Settings",           desc: "Push Notifications, API settings, and AI prompts.",                          href: "/admin/settings",          icon: FiSettings,  color: "text-neutral-400",   bg: "bg-neutral-500/10" },
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
      if (page > 100) break
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

  const [processingCosts, setProcessingCosts] = useState(false)
  const [costProgress, setCostProgress] = useState("")
  const [costSuccess, setCostSuccess] = useState<string | null>(null)
  const [costError, setCostError] = useState<string | null>(null)

  const handleRecalculateCosts = async () => {
    setProcessingCosts(true)
    setCostError(null)
    setCostSuccess(null)
    setCostProgress("Starting recalculation of missing costs...")

    try {
      let totalProcessed = 0
      while (true) {
        const res = await fetch("/api/admin/recalculate-missing-costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Server error ${res.status}`)
        }
        const data = await res.json()
        if (!data.success) throw new Error(data.error || "Recalculation failed")

        if (data.processedCount === 0) break
        totalProcessed += data.processedCount
        if (data.remainingCount > 0) {
          setCostProgress(`Processed ${totalProcessed} invoices. Remaining: ${data.remainingCount}...`)
        } else {
          break
        }
      }
      setCostSuccess(`Successfully recalculated and synced costs for all missing invoices (${totalProcessed} processed).`)
    } catch (err: any) {
      setCostError(err.message || "Failed to process costs")
    } finally {
      setProcessingCosts(false)
      setCostProgress("")
    }
  }

  const entityLabels: Record<string, { label: string, color: string, bg: string }> = {
    contacts:    { label: 'Accounts',     color: 'text-emerald-400', bg: 'bg-emerald-600' },
    invoices:    { label: 'Invoices',     color: 'text-blue-400',    bg: 'bg-blue-600' },
    salesorders: { label: 'Sales Orders', color: 'text-sky-400',     bg: 'bg-sky-600' },
    estimates:   { label: 'Quotes',       color: 'text-amber-400',   bg: 'bg-amber-600' },
  }

  return (
    <div className="page-content">

      {/* ─── Page Header ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500/30 to-violet-500/10 border border-purple-500/25 rounded-xl flex items-center justify-center">
            <FiSettings className="text-purple-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Admin Hub</h1>
            <p className="page-subtitle">Manage users, sync data, and configure system settings</p>
          </div>
        </div>
      </div>

      {/* ─── Page Body ───────────────────────────────────────────────────── */}
      <div className="page-body space-y-10">

        {/* Nav sections */}
        {sections.map(section => (
          <div key={section.category}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`w-2 h-2 rounded-full ${section.dotColor}`} />
              <h2 className="section-header">{section.category}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {section.cards.map(card => (
                <Link
                  href={card.href}
                  key={card.title}
                  className="
                    group relative flex items-start gap-3.5 p-4 rounded-xl
                    glass-panel border border-white/8
                    hover:border-white/15 hover:bg-white/[0.04]
                    transition-all duration-200 hover:-translate-y-0.5
                    hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]
                  "
                >
                  <div className={`
                    w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                    ${card.bg} ${card.color}
                    group-hover:scale-110 transition-transform duration-200
                  `}>
                    <card.icon size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white group-hover:text-orange-300 transition-colors leading-tight mb-1">
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-neutral-500 leading-relaxed line-clamp-2">
                      {card.desc}
                    </p>
                  </div>
                  <FiArrowRight
                    size={13}
                    className="shrink-0 text-neutral-700 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all mt-1"
                  />
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* ── Data Sync ──────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <h2 className="section-header">Data Sync</h2>
          </div>

          <div className="glass-panel rounded-2xl p-5 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/10 border border-indigo-500/20">
                <FiRefreshCw size={18} className={`text-indigo-400 ${syncing ? "animate-spin" : ""}`} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white mb-1">Bulk Sync — Zoho Books</h3>
                <p className="text-[11px] text-neutral-400 leading-relaxed mb-4">
                  Pull accounts, invoices, quotes, and sales orders from Zoho Books. Sync individually or all at once.
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(entityLabels).map(([key, { label, bg }]) => (
                    <button
                      key={key}
                      onClick={() => handleSyncEntity(key)}
                      disabled={!!syncing}
                      className={`td-btn td-btn-sm ${bg} text-white border-transparent hover:opacity-90 disabled:opacity-40`}
                    >
                      {syncing === key ? `Syncing ${label}...` : `Sync ${label}`}
                    </button>
                  ))}
                  <button
                    onClick={handleSyncAll}
                    disabled={!!syncing}
                    className="td-btn td-btn-sm bg-indigo-600 hover:bg-indigo-500 text-white border-transparent disabled:opacity-40"
                  >
                    ⚡ Sync All
                  </button>
                </div>
              </div>
            </div>

            {/* Progress */}
            {syncing && (
              <div className="flex items-center gap-2.5 text-indigo-400 text-xs font-medium bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-3">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
                {syncProgress || `Syncing ${entityLabels[syncing]?.label || syncing}...`}
              </div>
            )}

            {/* Results grid */}
            {Object.keys(syncResults).length > 0 && (
              <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                  <FiCheckCircle size={14} />
                  Sync Results
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(syncResults).map(([entity, result]) => (
                    <div key={entity} className={`bg-black/20 rounded-lg p-3 text-center ${result.error ? 'border border-red-500/20' : ''}`}>
                      <div className="text-2xl font-black text-white">{result.synced || 0}</div>
                      <div className="text-[11px] text-neutral-400 font-semibold mt-0.5">{entityLabels[entity]?.label || entity}</div>
                      <div className="text-[10px] text-neutral-600 mt-1">
                        {result.apiCalls || 0} calls · {result.skipped || 0} skipped
                      </div>
                      {result.error && (
                        <div className="text-[10px] text-red-400 mt-1 font-medium">{result.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {syncError && (
              <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-red-400 text-xs font-medium">
                <FiAlertTriangle size={14} className="shrink-0" />
                {syncError}
              </div>
            )}
          </div>
        </div>

        {/* ── Maintenance & Costs ────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <h2 className="section-header">Maintenance & Costs</h2>
          </div>

          <div className="glass-panel rounded-2xl p-5 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10 border border-amber-500/20">
                <FiActivity size={18} className={`text-amber-400 ${processingCosts ? "animate-pulse" : ""}`} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white mb-1">Recalculate Missing Invoice Costs & Commissions</h3>
                <p className="text-[11px] text-neutral-400 leading-relaxed mb-4">
                  Scans all active invoices. For any missing dead costs, profits, or commissions, this automatically recalculates them, pushes updates to Zoho Books, and syncs the local database.
                </p>
                <button
                  onClick={handleRecalculateCosts}
                  disabled={processingCosts}
                  className="td-btn td-btn-sm bg-amber-600 hover:bg-amber-500 text-white border-transparent disabled:opacity-40"
                >
                  {processingCosts ? "Processing..." : "🔄 Recalculate & Sync Missing Invoices"}
                </button>
              </div>
            </div>

            {costProgress && (
              <div className="flex items-center gap-2.5 text-amber-400 text-xs font-medium bg-amber-950/40 border border-amber-500/20 rounded-xl p-3">
                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
                {costProgress}
              </div>
            )}

            {costSuccess && (
              <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <FiCheckCircle size={14} className="shrink-0" />
                {costSuccess}
              </div>
            )}

            {costError && (
              <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-red-400 text-xs font-bold">
                <FiAlertTriangle size={14} className="shrink-0" />
                {costError}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
