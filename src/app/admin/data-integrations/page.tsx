import Link from "next/link"
import { FiAlertTriangle, FiDatabase, FiRefreshCw, FiSettings, FiTool } from "react-icons/fi"

const areas = [
  { title: "Sync & Financial Processing", description: "Run document sync, cost derivation and targeted maintenance from one tool.", href: "/admin/books-scripts", icon: FiRefreshCw, color: "text-emerald-400" },
  { title: "Custom Fields", description: "Map local computed values to Zoho Books fields.", href: "/admin/custom-fields", icon: FiDatabase, color: "text-cyan-400" },
  { title: "Sync Policy", description: "Configure delta-sync intervals and integration behavior.", href: "/admin/settings?tab=sync", icon: FiSettings, color: "text-violet-400" },
  { title: "Conflicts", description: "Approve the winning version when both systems changed.", href: "/admin/sync-conflicts", icon: FiAlertTriangle, color: "text-amber-400" },
  { title: "Data Quality", description: "Review orphaned and incomplete records requiring repair.", href: "/admin/orphaned-records", icon: FiTool, color: "text-red-400" },
]

export default function DataIntegrationsPage() {
  return <div className="flex-1 overflow-y-auto p-4 md:p-8">
    <div className="mb-6">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">Unified workspace</div>
      <h1 className="text-2xl md:text-3xl font-black text-white">Data & Integrations</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-400">Zoho synchronization, financial derivation, configuration and exception handling are organized here instead of scattered across Admin.</p>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {areas.map(area => <Link key={area.title} href={area.href} className="group min-h-36 rounded-2xl border border-white/10 bg-white/[0.025] p-5 hover:border-emerald-500/30 hover:bg-emerald-500/5">
        <area.icon className={`mb-4 text-xl ${area.color}`} />
        <h2 className="font-black text-white group-hover:text-emerald-300">{area.title}</h2>
        <p className="mt-1 text-sm text-neutral-500">{area.description}</p>
      </Link>)}
    </div>
    <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
      <h2 className="font-black text-white">Operating principle</h2>
      <p className="mt-1 text-sm text-neutral-400">Routine changes should flow automatically through the local database and Zoho. This workspace is primarily for status, approvals, configuration, and exception recovery—not repetitive manual processing.</p>
    </div>
  </div>
}
