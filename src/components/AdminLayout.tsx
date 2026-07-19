"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"
import Link from "next/link"
import { 
  FiShield, FiGrid, FiUsers, FiClock, FiDollarSign, 
  FiTarget, FiAward, FiCalendar, FiMessageSquare, 
  FiFileText, FiActivity, FiSettings, FiChevronLeft
} from "react-icons/fi"

const adminLinks = [
  { group: "General", items: [
    { name: "Dashboard", href: "/admin", icon: FiGrid },
  ]},
  { group: "Users & Teams", items: [
    { name: "Users", href: "/admin/users", icon: FiUsers },
    { name: "Timeclock", href: "/admin/timeclock", icon: FiClock },
    { name: "Payouts", href: "/admin/payouts", icon: FiDollarSign },
  ]},
  { group: "CRM & Operations", items: [
    { name: "Vendors", href: "/admin/vendors", icon: FiUsers },
    { name: "Update Accounts", href: "/admin/update-accounts", icon: FiTarget },
    { name: "Update Configs", href: "/admin/update-config", icon: FiSettings },
    { name: "VIG Management", href: "/admin/vig", icon: FiAward },
    { name: "Holidays", href: "/admin/holidays", icon: FiCalendar },
  ]},
  { group: "Communications", items: [
    { name: "Campaigns", href: "/admin/campaigns", icon: FiMessageSquare },
    { name: "Scripts", href: "/admin/scripts", icon: FiFileText },
    { name: "Comm Log", href: "/admin/communications", icon: FiActivity },
  ]},
  { group: "System", items: [
    { name: "Settings", href: "/admin/settings", icon: FiSettings },
  ]}
]

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()
  const pathname = usePathname()

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
    }
  }, [isInitialized, currentUser, router])

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0f1013] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Admin...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0f1013] text-white font-sans">
        <div className="text-center max-w-sm mx-auto px-4">
          <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <FiShield size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-neutral-400 text-sm mb-6">
            You need administrator privileges to access this section.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-sm font-bold text-white transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-[#0f1013]">
      {/* Sidebar */}
      <div className="w-full md:w-64 shrink-0 bg-neutral-900 border-r border-white/5 flex flex-col h-auto md:h-full overflow-y-auto">
        <div className="p-4 flex items-center gap-2 border-b border-white/5">
          <div className="w-8 h-8 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <FiShield size={16} />
          </div>
          <div>
            <div className="font-bold text-white text-sm">Admin Panel</div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Titan Hub</div>
          </div>
        </div>

        <div className="p-3 space-y-6">
          {adminLinks.map((group, idx) => (
            <div key={idx}>
              <div className="px-3 mb-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                {group.group}
              </div>
              <div className="space-y-1">
                {group.items.map(item => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive 
                          ? "bg-emerald-500/10 text-emerald-400" 
                          : "text-neutral-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <item.icon size={16} className={isActive ? "text-emerald-400" : "text-neutral-500"} />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col bg-[#0f1013]">
        {/* Mobile quick return */}
        <div className="md:hidden p-3 border-b border-white/5 bg-neutral-900 flex items-center justify-between">
          <span className="text-sm font-bold text-white">Admin Panel</span>
          <Link href="/" className="text-xs text-emerald-400 flex items-center gap-1">
            <FiChevronLeft /> Back to Hub
          </Link>
        </div>
        
        <div className="flex-1 overflow-y-auto w-full max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
