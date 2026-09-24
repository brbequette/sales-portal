import Link from "next/link"
import {
  FiActivity, FiCloud, FiCpu, FiDatabase, FiDollarSign, FiMessageSquare,
  FiPackage, FiSettings, FiShoppingBag, FiTool, FiTruck, FiUsers,
} from "react-icons/fi"

const workspaces = [
  { title: "Company Settings", description: "Users, roles, global defaults, holidays and time policies", href: "/admin/company-settings", icon: FiUsers, accent: "text-blue-400" },
  { title: "Sales Configuration", description: "Stages, scripts, account quality, assignment and offers", href: "/admin/sales-configuration", icon: FiShoppingBag, accent: "text-emerald-400" },
  { title: "Compensation & Payroll", description: "VIG, plans, goals, commissions, payouts and payroll", href: "/admin/compensation-center", icon: FiDollarSign, accent: "text-violet-400" },
  { title: "Automation & AI", description: "Automation health, AI routing, campaigns and approval opportunities", href: "/admin/automation-ai", icon: FiCpu, accent: "text-amber-400" },
  { title: "Communications", description: "Campaigns, templates and communication activity", href: "/admin/communications-center", icon: FiMessageSquare, accent: "text-pink-400" },
  { title: "Products & Data", description: "Catalog, imports, product assets, offers and governed data tools", href: "/admin/products-data", icon: FiPackage, accent: "text-cyan-400" },
  { title: "Integrations", description: "Zoho, Voice, email and shipping connection status and policy", href: "/admin/integrations", icon: FiCloud, accent: "text-sky-400" },
  { title: "Operations", description: "Work queues, fulfillment, vendors and operational exceptions", href: "/admin/operations-center", icon: FiTruck, accent: "text-orange-400" },
  { title: "System Health", description: "Sync conflicts, failed jobs, integrity warnings and reconciliation", href: "/admin/system-health", icon: FiActivity, accent: "text-red-400" },
  { title: "Advanced", description: "Restricted backfills, imports, repairs and one-time maintenance", href: "/admin/advanced", icon: FiTool, accent: "text-amber-400" },
]

const priorities = [
  { label: "Resolve sync conflicts", href: "/admin/sync-conflicts", icon: FiActivity },
  { label: "Review data quality", href: "/admin/orphaned-records", icon: FiDatabase },
  { label: "Manage permissions", href: "/admin/users", icon: FiUsers },
  { label: "System settings", href: "/admin/settings", icon: FiSettings },
]

export default function AdminDashboardPage() {
  return <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-7">
    <header>
      <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">Administration</div>
      <h1 className="text-2xl md:text-3xl font-black text-white">System Control Center</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-400">Configure the business, monitor automated work and handle exceptions. Routine synchronization and calculations run automatically.</p>
    </header>

    <section>
      <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-neutral-500">Workspaces</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {workspaces.map(workspace => <Link key={workspace.title} href={workspace.href} className="group min-h-36 rounded-2xl border border-white/10 bg-white/[0.025] p-5 hover:border-emerald-500/30 hover:bg-emerald-500/5">
          <workspace.icon className={`mb-4 text-xl ${workspace.accent}`} />
          <h3 className="font-black text-white group-hover:text-emerald-300">{workspace.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{workspace.description}</p>
        </Link>)}
      </div>
    </section>

    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-neutral-500">Common administration</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {priorities.map(item => <Link key={item.label} href={item.href} className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-neutral-300 hover:border-amber-500/30 hover:text-white"><item.icon className="text-amber-400" />{item.label}</Link>)}
      </div>
    </section>
  </div>
}
