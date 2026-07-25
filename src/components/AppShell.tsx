"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import {
  FiHome, FiPhoneCall, FiDollarSign, FiTool, FiZap,
  FiMenu, FiX, FiFileText, FiLogOut, FiBarChart2, FiSettings, FiBookOpen, FiMessageSquare, FiArrowLeft, FiCheckSquare, FiClock, FiGrid, FiTruck
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
    { href: "/",            icon: FiHome,          label: "Sales Hub",     color: "text-[var(--primary)]" },
    { href: "/intro-offer", icon: FiZap,           label: "Intro Offer",   color: "text-amber-400" },
    { href: "/tasks",       icon: FiCheckSquare,   label: "Task Hub",      color: "text-violet-400" },
    { href: "/sales",       icon: FiFileText,      label: "Sales Docs",    color: "text-[var(--accent)]" },
    { href: "/shipping",    icon: FiTruck,         label: "Shipping",      color: "text-orange-400" },
    { href: "/messages",    icon: FiMessageSquare, label: "Messages",      color: "text-[var(--info)]" },
    { href: "/collections", icon: FiPhoneCall,     label: "Collections",   color: "text-[var(--danger)]" },
    { href: "/commissions", icon: FiDollarSign,    label: "Commissions",   color: "text-[var(--success)]" },
    { href: "/stats",       icon: FiBarChart2,     label: "Rep Stats",     color: "text-neutral-100" },
    { href: "/tools",       icon: FiTool,          label: "Tools & Media", color: "text-[var(--accent)]" },
    { href: "/training",    icon: FiBookOpen,      label: "Training Hub",  color: "text-[var(--primary)]" },
  ]

  if (isAdmin) {
    navItems.push({ href: "/admin", icon: FiSettings, label: "Admin Settings", color: "text-[var(--primary)]" })
  }

  const bottomItems = [
    { href: "/",            icon: FiHome,          label: "Hub",         color: "text-[var(--primary)]" },
    { href: "/tasks",       icon: FiCheckSquare,   label: "Tasks",       color: "text-violet-400" },
    { href: "/messages",    icon: FiMessageSquare, label: "Msgs",        color: "text-[var(--info)]" },
    { href: "/collections", icon: FiPhoneCall,     label: "Collections", color: "text-[var(--danger)]" },
  ]

  if (pathname === "/login" || pathname === "/intro-offer") return <>{children}</>

  const handleLogout = () => {
    try { localStorage.removeItem("sales_portal_user") } catch {}
    window.location.href = "/login"
  }

  return (
    <div className="flex bg-[var(--background)] text-[var(--foreground)]" style={{ height: "100dvh" }}>

      {/* ── Desktop Sidebar (md = 768px+) ──────────────────────────────────
          - overflow-hidden on aside prevents the panel itself from growing
          - min-h-0 + overflow-y-auto on nav lets items scroll on short screens
          - gap-1 keeps items compact; shrink-0 on non-nav sections prevents collapse  */}
      <aside className="hidden md:flex flex-col items-center w-14 glass-panel border-white/10 rounded-2xl shadow-[0_18px_60px_rgba(0,0,0,0.4)] fixed top-3 left-3 bottom-3 py-3 z-40 overflow-hidden">

        {/* Brand mark */}
        <div className="shrink-0 mb-2 flex justify-center w-full">
          <div className="w-9 h-9 bg-[var(--primary)] rounded-xl flex items-center justify-center relative group cursor-pointer shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:shadow-[0_0_25px_rgba(249,115,22,0.6)] transition-all">
            <span className="font-black text-white text-sm">T</span>
            <div className="absolute left-12 bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity border border-white/10 shadow-xl whitespace-nowrap z-50">
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
            <div className="absolute left-12 bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity border border-white/10 shadow-xl whitespace-nowrap z-50">
              Go Back
            </div>
          </button>
        )}

        {/* Nav — scrollable so items never get clipped on short-height screens */}
        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none flex flex-col items-center gap-1 w-full px-1.5">
          {navItems.map(item => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 relative group overflow-hidden ${
                  active
                    ? "bg-white/10 text-white shadow-inner"
                    : "text-neutral-500 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />}
                {active && <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-r-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />}
                <Icon size={16} className={`relative z-10 ${active ? item.color : "opacity-60 group-hover:opacity-100 transition-opacity"}`} />
                {/* Tooltip */}
                <div className="absolute left-12 bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity border border-white/10 shadow-xl whitespace-nowrap z-50">
                  {item.label}
                </div>
              </Link>
            )
          })}
        </nav>

        {/* Bottom: avatar + logout — shrink-0 so they're always visible */}
        <div className="shrink-0 flex flex-col gap-2 items-center border-t border-white/10 pt-2 mt-1 w-full px-1.5">
          {user && (
            <div className="relative group cursor-pointer" onClick={() => setShowSettings(true)}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 border border-white/20 hover:border-[var(--primary)] transition-all flex items-center justify-center shadow-lg">
                <span className="text-xs font-bold text-white">{user.name.charAt(0)}</span>
              </div>
              <div className="absolute left-12 bottom-0 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 w-48">
                <div className="text-sm font-bold text-white truncate">{user.name}</div>
                <div className="text-xs text-neutral-400 truncate mt-0.5">{user.role}</div>
                <div className="text-[10px] text-[var(--primary)] mt-1.5 font-bold uppercase tracking-wider">Click to edit settings</div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-all relative group"
            title="Sign Out"
          >
            <FiLogOut size={15} />
            <div className="absolute left-12 bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity border border-white/10 shadow-xl whitespace-nowrap z-50">
              Sign Out
            </div>
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Bar (below md = <768px) ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 glass-panel border-x-0 border-t-0 px-4 py-3 flex items-center justify-between rounded-none shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-[var(--primary)] to-orange-600 rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,0.5)]">
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
                <div className="w-6 h-6 bg-[var(--primary)] rounded flex items-center justify-center text-xs text-white">T</div>
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
          <FiGrid size={18} className={showMoreMenu ? "text-[var(--primary)]" : ""} />
          <span className="mt-0.5">More</span>
        </button>
        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMoreMenu(false)} />
            <div className="absolute bottom-full right-2 mb-2 z-30 glass-panel/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.5)] p-2 min-w-[200px]">
              {[
                { href: "/timeclock",   icon: FiClock,      label: "Timeclock",    color: "text-emerald-400" },
                { href: "/commissions", icon: FiDollarSign, label: "Commissions",  color: "text-[var(--success)]" },
                { href: "/stats",       icon: FiBarChart2,  label: "Rep Stats",    color: "text-neutral-100" },
                { href: "/sales",       icon: FiFileText,   label: "Sales Docs",   color: "text-[var(--accent)]" },
                { href: "/tools",       icon: FiTool,       label: "Tools & Media",color: "text-[var(--accent)]" },
                { href: "/training",    icon: FiBookOpen,   label: "Training Hub", color: "text-[var(--primary)]" },
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

      {/* ── Main Content ──────────────────────────────────────────────────
          md:pl-[4.25rem] = sidebar (56px w-14) + gap (3px) + spacing     */}
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
