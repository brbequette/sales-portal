"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import {
  FiHome, FiPhoneCall, FiDollarSign, FiTool, FiTrendingUp,
  FiX, FiFileText, FiLogOut, FiBarChart2, FiSettings, FiBookOpen,
  FiMessageSquare, FiArrowLeft, FiCheckSquare, FiClock, FiGrid,
  FiTruck, FiAward, FiUsers, FiTarget, FiPackage, FiAlertTriangle,
  FiActivity, FiSliders, FiDatabase, FiCloud, FiCreditCard, FiCalendar,
  FiMapPin, FiZap, FiSearch
} from "react-icons/fi"
import { GlobalTopBar } from "@/components/GlobalTopBar"
import { UserSettingsModal } from "@/components/UserSettingsModal"
import { CommandPalette } from "@/components/CommandPalette"

// ─── Nav Item Types ───────────────────────────────────────────────────────────

type NavItem = {
  href: string
  icon: React.ElementType
  label: string
  color: string
  adminOnly?: boolean
}

type NavGroup = {
  label: string
  items: NavItem[]
}

// ─── Navigation Structure ─────────────────────────────────────────────────────

const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { href: "/",            icon: FiHome,          label: "Dashboard",       color: "text-orange-400" },
      { href: "/sales",       icon: FiTrendingUp,    label: "Sales Pipeline",  color: "text-emerald-400" },
      { href: "/tasks",       icon: FiCheckSquare,   label: "Task Hub",        color: "text-violet-400" },
      { href: "/docs",        icon: FiFileText,      label: "Documents",       color: "text-sky-400" },
    ]
  },
  {
    label: "Communication",
    items: [
      { href: "/messages",    icon: FiMessageSquare, label: "Messages",        color: "text-cyan-400" },
      { href: "/collections", icon: FiPhoneCall,     label: "Collections",     color: "text-rose-400" },
    ]
  },
  {
    label: "Finance",
    items: [
      { href: "/commissions", icon: FiDollarSign,    label: "Commissions",     color: "text-green-400" },
      { href: "/stats",       icon: FiAward,         label: "Rep Stats",       color: "text-yellow-400" },
      { href: "/shipping",    icon: FiTruck,         label: "Shipping",        color: "text-amber-400" },
    ]
  },
  {
    label: "Resources",
    items: [
      { href: "/tools",       icon: FiTool,          label: "Tools & Media",   color: "text-indigo-400" },
      { href: "/training",    icon: FiBookOpen,      label: "Training Hub",    color: "text-teal-400" },
      { href: "/timeclock",   icon: FiClock,         label: "Timeclock",       color: "text-lime-400" },
    ]
  },
  {
    label: "Admin",
    items: [
      { href: "/admin",                    icon: FiGrid,          label: "Admin Hub",           color: "text-purple-400",  adminOnly: true },
      { href: "/admin/users",              icon: FiUsers,         label: "Users",               color: "text-blue-400",    adminOnly: true },
      { href: "/admin/rep-stats",          icon: FiBarChart2,     label: "Rep Stats (Admin)",   color: "text-orange-400",  adminOnly: true },
      { href: "/admin/timeclock",          icon: FiClock,         label: "Timeclock (Admin)",   color: "text-emerald-400", adminOnly: true },
      { href: "/admin/payouts",            icon: FiDollarSign,    label: "Payouts",             color: "text-amber-400",   adminOnly: true },
      { href: "/admin/payroll",            icon: FiCreditCard,    label: "Payroll",             color: "text-yellow-400",  adminOnly: true },
      { href: "/admin/goals-bonuses",      icon: FiAward,         label: "Goals & Bonuses",     color: "text-pink-400",    adminOnly: true },
      { href: "/admin/invoices",           icon: FiFileText,      label: "Invoice Mgmt",        color: "text-sky-400",     adminOnly: true },
      { href: "/admin/vig",                icon: FiSliders,       label: "VIG Management",      color: "text-violet-400",  adminOnly: true },
      { href: "/admin/vendors",            icon: FiTruck,         label: "Vendors",             color: "text-lime-400",    adminOnly: true },
      { href: "/admin/sales-stages",       icon: FiTrendingUp,    label: "Sales Stages",        color: "text-emerald-400", adminOnly: true },
      { href: "/admin/update-accounts",    icon: FiTarget,        label: "Update Accounts",     color: "text-blue-400",    adminOnly: true },
      { href: "/admin/update-config",      icon: FiSettings,      label: "Configurations",      color: "text-neutral-400", adminOnly: true },
      { href: "/admin/campaigns",          icon: FiMessageSquare, label: "Campaigns",           color: "text-cyan-400",    adminOnly: true },
      { href: "/admin/scripts",            icon: FiFileText,      label: "Scripts",             color: "text-orange-400",  adminOnly: true },
      { href: "/admin/communications",     icon: FiActivity,      label: "Comm Log",            color: "text-teal-400",    adminOnly: true },
      { href: "/admin/notification-templates", icon: FiMessageSquare, label: "Notification Rules", color: "text-cyan-400", adminOnly: true },
      { href: "/admin/shipping-audit",     icon: FiPackage,       label: "Shipping Audit",      color: "text-blue-400",    adminOnly: true },
      { href: "/admin/lead-discrepancies", icon: FiAlertTriangle, label: "Lead Discrepancies",  color: "text-red-400",     adminOnly: true },
      { href: "/admin/orphaned-records",   icon: FiAlertTriangle, label: "Orphaned Records",    color: "text-red-400",     adminOnly: true },
      { href: "/admin/geofences",          icon: FiMapPin,        label: "Geofences",           color: "text-rose-400",    adminOnly: true },
      { href: "/admin/holidays",           icon: FiCalendar,      label: "Holidays",            color: "text-red-400",     adminOnly: true },
      { href: "/admin/intro-offer",        icon: FiZap,           label: "Intro Offer",         color: "text-amber-400",   adminOnly: true },
      { href: "/admin/books-scripts",      icon: FiCloud,         label: "Books Scripts",       color: "text-amber-400",   adminOnly: true },
      { href: "/admin/custom-fields",      icon: FiDatabase,      label: "Custom Fields",       color: "text-sky-400",     adminOnly: true },
      { href: "/admin/backfill",           icon: FiDatabase,      label: "Data Backfill",       color: "text-sky-400",     adminOnly: true },
      { href: "/admin/settings",           icon: FiSettings,      label: "System Settings",     color: "text-neutral-400", adminOnly: true },
    ]
  }
]

// Mobile bottom + More items
const bottomPrimary = [
  { href: "/",       icon: FiHome,          label: "Home",     color: "text-orange-400" },
  { href: "/sales",  icon: FiTrendingUp,    label: "Sales",    color: "text-emerald-400" },
  { href: "/docs",   icon: FiFileText,      label: "Docs",     color: "text-sky-400" },
  { href: "/tasks",  icon: FiCheckSquare,   label: "Tasks",    color: "text-violet-400" },
]

// ─── Helper: group color stripe ───────────────────────────────────────────────
const groupAccent: Record<string, string> = {
  "Core":         "bg-orange-500",
  "Communication":"bg-cyan-500",
  "Finance":      "bg-green-500",
  "Resources":    "bg-indigo-500",
  "Admin":        "bg-purple-500",
}

// ─── NavLink (desktop sidebar icon) ──────────────────────────────────────────
function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      title={item.label}
      className={`
        relative flex items-center justify-center w-10 h-10 rounded-xl
        transition-all duration-200 group shrink-0
        ${active
          ? "bg-white/15 text-white shadow-lg border border-white/15"
          : "text-neutral-500 hover:bg-white/8 hover:text-white border border-transparent"
        }
      `}
    >
      {active && (
        <span className="absolute left-0 top-1/4 bottom-1/4 w-[3px] rounded-r-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
      )}
      <Icon size={16} className={`relative z-10 ${active ? item.color : "opacity-70 group-hover:opacity-100 transition-opacity"}`} />

      {/* Floating tooltip */}
      <span className="
        pointer-events-none absolute left-[3.25rem] top-1/2 -translate-y-1/2
        bg-[#111214]/95 backdrop-blur-xl border border-white/15
        text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
        shadow-[0_8px_24px_rgba(0,0,0,0.7)]
        opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-1
        transition-all duration-150 whitespace-nowrap z-[9999]
        flex items-center gap-1.5
      ">
        <span className={`w-1.5 h-1.5 rounded-full ${item.color.replace("text-", "bg-")}`} />
        {item.label}
      </span>
    </Link>
  )
}

// ─── Main AppShell ────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { zohoContext: user } = useZoho()
  const { preferences } = usePreferences()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [expandedAdminGroup, setExpandedAdminGroup] = useState(false)

  // Auth / layout bypasses
  if (pathname === "/login" || pathname === "/intro-offer" || pathname.startsWith("/tv")) {
    return <>{children}</>
  }

  const effectiveRole = preferences.impersonatedUser?.role ?? user?.role ?? ""
  const normalizedRole = effectiveRole.toLowerCase()
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator"
    || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const mainPages = ["/", "/login", "/sales", "/shipping", "/messages", "/collections",
    "/commissions", "/stats", "/tools", "/training", "/catalog", "/timeclock", "/tasks",
    "/intro-offer", "/docs"]
  const showBackButton = !mainPages.includes(pathname) && !pathname.startsWith("/admin")

  const handleLogout = () => {
    try { localStorage.removeItem("sales_portal_user") } catch { }
    window.location.href = "/login"
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")

  // Desktop sidebar groups — filter adminOnly based on role
  const visibleGroups = navGroups.map(g => ({
    ...g,
    items: g.items.filter(i => !i.adminOnly || isAdmin)
  })).filter(g => g.items.length > 0)

  return (
    <div className="flex bg-[var(--background)] text-[var(--foreground)]" style={{ height: "100dvh" }}>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP SIDEBAR (md+)
      ══════════════════════════════════════════════════════════════════════ */}
      <aside className="
        hidden md:flex flex-col items-center
        w-[3.5rem] shrink-0
        fixed top-3 left-3 bottom-3
        glass-panel rounded-2xl border-white/10
        shadow-[0_20px_60px_rgba(0,0,0,0.5)]
        py-3 z-40 overflow-visible
      ">
        {/* Brand mark */}
        <div className="shrink-0 mb-3 flex justify-center w-full">
          <div className="
            w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl
            flex items-center justify-center cursor-pointer relative group
            shadow-[0_0_18px_rgba(249,115,22,0.4)]
            hover:shadow-[0_0_28px_rgba(249,115,22,0.6)]
            transition-all duration-200
          ">
            <span className="font-black text-white text-sm select-none">T</span>
            <span className="
              pointer-events-none absolute left-[3.25rem] top-1/2 -translate-y-1/2
              bg-[#111214]/95 backdrop-blur-xl border border-white/15
              text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg
              shadow-[0_8px_24px_rgba(0,0,0,0.7)]
              opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-1
              transition-all duration-150 whitespace-nowrap z-[9999]
              flex items-center gap-2
            ">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              Titan Diamond Hub
            </span>
          </div>
        </div>

        {/* Back button */}
        {showBackButton && (
          <button
            onClick={() => router.back()}
            title="Go Back"
            className="
              shrink-0 w-9 h-9 mb-2 rounded-xl flex items-center justify-center
              text-neutral-500 hover:text-white hover:bg-white/8
              transition-all border border-transparent hover:border-white/10 relative group
            "
          >
            <FiArrowLeft size={15} />
            <span className="
              pointer-events-none absolute left-[3.25rem] top-1/2 -translate-y-1/2
              bg-[#111214]/95 backdrop-blur-xl border border-white/15
              text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
              shadow-[0_8px_24px_rgba(0,0,0,0.7)]
              opacity-0 group-hover:opacity-100 group-hover:translate-x-1
              transition-all duration-150 whitespace-nowrap z-[9999]
            ">Go Back</span>
          </button>
        )}

        {/* Scrollable nav groups */}
        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-visible scrollbar-none flex flex-col items-center w-full px-1.5 gap-0.5">
          {visibleGroups.map((group, gi) => (
            <div key={group.label} className="flex flex-col items-center w-full">
              {/* Group divider with accent */}
              {gi > 0 && (
                <div className="flex flex-col items-center my-1.5 w-full">
                  <div className={`w-5 h-[2px] rounded-full ${groupAccent[group.label] || "bg-white/10"} opacity-40`} />
                </div>
              )}
              {group.items.map(item => (
                <div key={item.href} className="mb-0.5 w-full flex justify-center">
                  <SidebarLink item={item} active={isActive(item.href)} />
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom: avatar + sign out */}
        <div className="shrink-0 flex flex-col gap-1.5 items-center border-t border-white/8 pt-2 mt-1 w-full px-1.5">
          {user && (
            <div className="relative group cursor-pointer" onClick={() => setShowSettings(true)}>
              <div className="
                w-8 h-8 rounded-full
                bg-gradient-to-br from-neutral-700 to-neutral-900
                border border-white/15 hover:border-orange-500
                flex items-center justify-center shadow-lg
                transition-all duration-200
              ">
                <span className="text-xs font-bold text-white">{user.name?.charAt(0) ?? "?"}</span>
              </div>
              <div className="
                pointer-events-none absolute left-[3.25rem] bottom-0
                bg-[#111214]/95 backdrop-blur-xl border border-white/15
                rounded-xl p-3 shadow-2xl
                opacity-0 group-hover:opacity-100 transition-all
                whitespace-nowrap z-[9999] min-w-[10rem]
              ">
                <div className="text-sm font-bold text-white truncate">{user.name}</div>
                <div className="text-[11px] text-neutral-400 truncate mt-0.5 capitalize">{user.role}</div>
                <div className="text-[10px] text-orange-400 mt-1.5 font-bold uppercase tracking-wider">Click for Settings</div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="
              w-8 h-8 rounded-xl flex items-center justify-center
              text-neutral-500 hover:text-red-400 hover:bg-red-500/10
              transition-all relative group border border-transparent hover:border-red-500/20
            "
          >
            <FiLogOut size={15} />
            <span className="
              pointer-events-none absolute left-[3.25rem] top-1/2 -translate-y-1/2
              bg-[#111214]/95 backdrop-blur-xl border border-white/15
              text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
              shadow-[0_8px_24px_rgba(0,0,0,0.7)]
              opacity-0 group-hover:opacity-100 group-hover:translate-x-1
              transition-all duration-150 whitespace-nowrap z-[9999]
            ">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE TOP BAR (<md)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/8 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(249,115,22,0.5)]">
            <span className="font-black text-white text-xs">T</span>
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Titan Hub</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 -mr-2 text-neutral-400 hover:text-white transition-colors rounded-lg"
        >
          {mobileOpen ? <FiX size={20} /> : (
            <div className="flex flex-col gap-[5px]">
              <div className="w-5 h-[1.5px] bg-current rounded-full" />
              <div className="w-3.5 h-[1.5px] bg-current rounded-full" />
              <div className="w-5 h-[1.5px] bg-current rounded-full" />
            </div>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE FULL-SCREEN MENU DRAWER
      ══════════════════════════════════════════════════════════════════════ */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="
            relative w-72 max-w-[85vw] bg-[#0d0e11]/98 backdrop-blur-2xl
            border-r border-white/8 h-full flex flex-col z-50
            shadow-[8px_0_40px_rgba(0,0,0,0.6)]
            animate-fade-in
          ">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-[0_0_14px_rgba(249,115,22,0.5)]">
                  <span className="font-black text-white text-sm">T</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Titan Diamond</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">Unified Hub</div>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 text-neutral-500 hover:text-white transition-colors rounded-lg">
                <FiX size={18} />
              </button>
            </div>

            {/* Nav groups */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {visibleGroups.map(group => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 px-3 mb-2">
                    <div className={`w-3 h-[2px] rounded-full ${groupAccent[group.label] || "bg-white/20"}`} />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{group.label}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map(item => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`
                            flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold
                            transition-all duration-150
                            ${active
                              ? "bg-white/10 text-white border border-white/10"
                              : "text-neutral-400 hover:bg-white/5 hover:text-white border border-transparent"
                            }
                          `}
                        >
                          <Icon size={16} className={active ? item.color : "opacity-60"} />
                          <span className="flex-1">{item.label}</span>
                          {active && <div className={`w-1.5 h-1.5 rounded-full ${item.color.replace("text-", "bg-")}`} />}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Drawer footer */}
            <div className="shrink-0 border-t border-white/8 px-4 py-4 space-y-2">
              {user && (
                <button
                  onClick={() => { setMobileOpen(false); setShowSettings(true) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-neutral-400 hover:bg-white/5 hover:text-white transition-all"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 border border-white/15 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {user.name?.charAt(0) ?? "?"}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-white text-xs font-bold">{user.name}</div>
                    <div className="text-neutral-500 text-[10px] capitalize">{user.role}</div>
                  </div>
                  <FiSettings size={14} className="text-neutral-500" />
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-neutral-500 hover:bg-red-500/10 hover:text-red-400 transition-all"
              >
                <FiLogOut size={16} />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE BOTTOM TAB BAR (<md)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/8 flex pb-[env(safe-area-inset-bottom)]">
        {bottomPrimary.map(item => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center pt-2.5 pb-2 gap-1 text-[10px] font-semibold transition-colors ${
                active ? "text-white" : "text-neutral-600 hover:text-neutral-400"
              }`}
            >
              <div className={`relative ${active ? "scale-110" : ""} transition-transform`}>
                <Icon size={19} className={active ? item.color : ""} />
                {active && (
                  <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${item.color.replace("text-", "bg-")}`} />
                )}
              </div>
              <span className={active ? "text-white" : ""}>{item.label}</span>
            </Link>
          )
        })}

        {/* More menu button */}
        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={`flex-1 flex flex-col items-center pt-2.5 pb-2 gap-1 text-[10px] font-semibold transition-colors ${
            showMoreMenu ? "text-white" : "text-neutral-600 hover:text-neutral-400"
          }`}
        >
          <FiGrid size={19} className={showMoreMenu ? "text-orange-400" : ""} />
          <span className={showMoreMenu ? "text-white" : ""}>More</span>
        </button>

        {/* More slide-up sheet */}
        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMoreMenu(false)} />
            <div className="
              absolute bottom-full right-0 left-0 mb-0 z-30
              bg-[#0d0e11]/98 backdrop-blur-2xl
              border-t border-white/10
              rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.6)]
              p-4 max-h-[75vh] overflow-y-auto
              animate-slide-up
            ">
              <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
              <div className="space-y-5">
                {visibleGroups
                  .filter(g => g.label !== "Core") // Core is in the tab bar
                  .map(group => (
                    <div key={group.label}>
                      <div className="flex items-center gap-2 px-1 mb-2">
                        <div className={`w-3 h-[2px] rounded-full ${groupAccent[group.label] || "bg-white/20"}`} />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{group.label}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.items.map(item => {
                          const Icon = item.icon
                          const active = isActive(item.href)
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setShowMoreMenu(false)}
                              className={`
                                flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold
                                transition-all duration-150
                                ${active
                                  ? "bg-white/10 text-white border border-white/10"
                                  : "text-neutral-400 hover:bg-white/5 hover:text-white border border-transparent"
                                }
                              `}
                            >
                              <Icon size={15} className={active ? item.color : "opacity-60"} />
                              <span className="truncate text-xs">{item.label}</span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
      ══════════════════════════════════════════════════════════════════════ */}
      <main className="
        flex-1 overflow-hidden flex flex-col
        md:pt-0 pt-[3.25rem]
        pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0
        md:pl-[3.75rem]
      ">
        <GlobalTopBar />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      <CommandPalette />
      <UserSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
