"use client"

import Link from "next/link"
import { 
  FiUsers, FiClock, FiDollarSign, 
  FiTarget, FiAward, FiCalendar, FiMessageSquare, 
  FiFileText, FiActivity, FiSettings, FiDatabase
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
    ]
  }
]

export default function AdminDashboardPage() {
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
                  className="group block p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all"
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
      </div>
    </div>
  )
}
