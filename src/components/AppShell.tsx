"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import {
  FiHome, FiPhoneCall, FiDollarSign, FiTool, FiZap, FiTrendingUp,
  FiMenu, FiX, FiFileText, FiLogOut, FiBarChart2, FiSettings, FiBookOpen, FiMessageSquare, FiArrowLeft, FiCheckSquare, FiClock, FiGrid, FiTruck, FiAward
} from "react-icons/fi"
import { GlobalTopBar } from "@/components/GlobalTopBar"
import { UserSettingsModal } from "@/components/UserSettingsModal"
import { CommandPalette } from "@/components/CommandPalette"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { zohoContext: user } = useZoho()
  const { preferences } = usePreferences()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  const mainPages = ["/", "/login", "/sales", "/shipping", "/messages", "/collections", "/commissions", "/stats", "/tools", "/training", "/catalog", "/timeclock", "/tasks", "/intro-offer"]
  const showBackButton = !mainPages.includes(pathname)

  const effectiveRole = preferences.impersonatedUser ? preferences.impersonatedUser.role : (user?.role || "")
  const normalizedRole = effectiveRole.toLowerCase()
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const navItems = [
    { href: "/",            icon: FiHome,          label: "Dashboard",      color: "text-orange-400" },
    { href: "/sales",       icon: FiTrendingUp,    label: "Sales Pipeline", color: "text-emerald-400" },
    { href: "/tasks",       icon: FiCheckSquare,   label: "Task Hub",       color: "text-violet-400" },
    { href: "/shipping",    icon: FiTruck,         label: "Shipping",       color: "text-amber-400" },
    { href: "/messages",    icon: FiMessageSquare, label: "Messages",       color: "text-sky-400" },
    { href: "/collections", icon: FiPhoneCall,     label: "Collections",    color: "text-rose-400" },
    { href: "/commissions", icon: FiDollarSign,    label: "Commissions",    color: "text-green-400" },
    { href: "/stats",       icon: FiAward,         label: "Rep Stats & Goals", color: "text-yellow-400" },
    { href: "/tools",       icon: FiTool,          label: "Tools & Media",  color: "text-indigo-400" },
    { href: "/training",    icon: FiBookOpen,      label: "Training Hub",   color: "text-cyan-400" },
  ]

  if (isAdmin) {
    navItems.push({ href: "/admin", icon: FiSettings, label: "Admin Settings", color: "text-purple-400" })
  }

  const bottomItems = [
    { href: "/",            icon: FiHome,          label: "Dashboard",   color: "text-orange-400" },
    { href: "/sales",       icon: FiTrendingUp,    label: "Sales",       color: "text-emerald-400" },
    { href: "/tasks",       icon: FiCheckSquare,   label: "Tasks",       color: "text-violet-400" },
    { href: "/messages",    icon: FiMessageSquare, label: "Msgs",        color: "text-sky-400" },
  ]

  if (pathname === "/login" || pathname === "/intro-offer" || pathname.startsWith("/tv")) return <>{children}</>

  const handleLogout = () => {
    try { localStorage.removeItem("sales_portal_user") } catch {}
    window.location.href = "/login"
  }

  return (
    <div className="flex bg-[var(--background)] text-[var(--foreground)]" style={{ height: "100dvh" }}>

      {/* ── Desktop Sidebar (md = 768px+) ────────────────────────────────── */}
      <aside className="hidden md:flex flex-col items-center w-14 glass-panel border-white/10 rounded-2xl shadow-[0_18px_60px_rgba(0,0,0,0.4)] fixed top-3 left-3 bottom-3 py-3 z-40 overflow-visible">

        {/* Brand mark */}
        <div className="shrink-0 mb-2 flex justify-center w-full">
          <div className="w-9 h-9 bg-[var(--primary)] rounded-xl flex items-center justify-center relative group cursor-pointer shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:shadow-[0_0_25px_rgba(249,115,22,0.6)] transition-all">
            <span className="font-black text-white text-sm">T</span>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-neutral-900/95 backdrop-blur-xl border border-white/20 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-150 whitespace-nowrap z-[100] flex items-center gap-1.5">
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              Titan Unified Hub
            </div>
          </div>
        </div>

        {/* Back button */}
        {showBackButton && (
          <button
            onClick={() => router.back()}
            className="shrink-0 w-9 h-9 mb-1 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-all relative group border border-transparent hover:border-white/10"
            title="Go Back"
          >
            <FiArrowLeft size={16} />
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-neutral-900/95 backdrop-blur-xl border border-white/20 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-150 whitespace-nowrap z-[100]">
              Go Back
            </div>
          </button>
        )}

        {/* Nav — scrollable so items never get clipped on short-height screens */}
        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-visible scrollbar-none flex flex-col items-center gap-1.5 w-full px-1.5 py-1">
          {navItems.map(item => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 relative group ${
                  active
                    ? "bg-white/15 text-white shadow-lg border border-white/15"
                    : "text-neutral-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {active && <div className="absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]" />}
                <Icon size={17} className={`relative z-10 ${active ? item.color : "opacity-75 group-hover:opacity-100 transition-opacity"}`} />
                
                {/* Clean Floating Tooltip on Hover */}
                <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-neutral-900/95 backdrop-blur-xl border border-white/20 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-150 whitespace-nowrap z-[100] flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${item.color.replace('text-', 'bg-')}`} />
                  {item.label}
                </div>
              </Link>
            )
          })}
        </nav>

        {/* Bottom: avatar + logout */}
        <div className="shrink-0 flex flex-col gap-2 items-center border-t border-white/10 pt-2 mt-1 w-full px-1.5">
          {user && (
            <div className="relative group cursor-pointer" onClick={() => setShowSettings(true)}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 border border-white/20 hover:border-orange-500 transition-all flex items-center justify-center shadow-lg">
                <span className="text-xs font-bold text-white">{user.name.charAt(0)}</span>
              </div>
              <div className="absolute left-14 bottom-0 bg-neutral-900/95 backdrop-blur-xl border border-white/20 rounded-xl p-3 shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all whitespace-nowrap z-[100] w-48">
                <div className="text-sm font-bold text-white truncate">{user.name}</div>
                <div className="text-xs text-neutral-400 truncate mt-0.5">{user.role}</div>
                <div className="text-[10px] text-orange-400 mt-1.5 font-bold uppercase tracking-wider">Click for Settings</div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-all relative group"
            title="Sign Out"
          >
            <FiLogOut size={16} />
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-neutral-900/95 backdrop-blur-xl border border-white/20 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-150 whitespace-nowrap z-[100]">
              Sign Out
            </div>
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Bar (below md = <768px) ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 glass-panel border-x-0 border-t-0 px-4 py-3 flex items-center justify-between rounded-none shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,0.5)]">
            <span className="font-black text-white text-sm">T</span>
          </div>
          <span className="text-base font-bold text-white">Titan Hub</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-neutral-400 hover:text-white transition-colors p-2.5 -mr-2.5 rounded-lg">
          {sidebarOpen ? <FiX size={22} /> : <FiMenu size={22} />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 glass-panel border-y-0 border-l-0 flex flex-col h-full z-50 rounded-none animate-fade-in">
            <div className="px-5 py-5 border-b border-white/10 shrink-0">
              <div className="text-base font-black text-white flex items-center gap-2">
                <div className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center text-xs text-white">T</div>
                Titan Diamond Hub
              </div>
            </div>
            <nav className="flex-1 min-h-0 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map(item => {
                const Icon = item.icon
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all ${
                      active ? "bg-white/10 text-white border border-white/10 shadow-inner" : "text-neutral-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon size={18} className={active ? item.color : "opacity-70"} />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="shrink-0 px-5 py-4 border-t border-white/10">
              <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-neutral-400 hover:text-red-400 transition-colors font-bold">
                <FiLogOut size={16} /> Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Mobile Bottom Tab Bar (<768px) ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#111214]/95 backdrop-blur border-t border-white/10 flex pb-[env(safe-area-inset-bottom)]">
        {bottomItems.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={`flex-1 flex flex-col items-center py-3 text-[11px] font-semibold transition-colors ${
                active ? "text-white" : "text-neutral-600"
              }`}
            >
              <Icon size={18} className={active ? item.color : ""} />
              <span className="mt-0.5">{item.label}</span>
            </Link>
          )
        })}
        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={`flex-1 flex flex-col items-center py-3 text-[11px] font-semibold transition-colors ${showMoreMenu ? "text-white" : "text-neutral-600"}`}
        >
          <FiGrid size={18} className={showMoreMenu ? "text-orange-500" : ""} />
          <span className="mt-0.5">More</span>
        </button>
        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMoreMenu(false)} />
            <div className="absolute bottom-full right-2 mb-2 z-30 glass-panel/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.5)] p-2 min-w-[200px]">
              {[
                { href: "/timeclock",   icon: FiClock,      label: "Timeclock",    color: "text-emerald-400" },
                { href: "/commissions", icon: FiDollarSign, label: "Commissions",  color: "text-green-400" },
                { href: "/stats",       icon: FiAward,      label: "Rep Stats",    color: "text-yellow-400" },
                { href: "/sales",       icon: FiTrendingUp, label: "Sales Pipeline", color: "text-emerald-400" },
                { href: "/tools",       icon: FiTool,       label: "Tools & Media",color: "text-indigo-400" },
                { href: "/training",    icon: FiBookOpen,   label: "Training Hub", color: "text-cyan-400" },
              ].map(item => {
                const Icon = item.icon
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href} onClick={() => setShowMoreMenu(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      active ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={16} className={active ? item.color : ""} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Main Content (GlobalTopBar rendered ONCE here) ───────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col md:pt-0 pt-12 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-[4.25rem]">
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
