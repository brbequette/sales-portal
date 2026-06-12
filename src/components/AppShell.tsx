"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import {
  FiHome, FiPhoneCall, FiDollarSign, FiTool, FiUser,
  FiMenu, FiX, FiFileText, FiLogOut, FiBarChart2, FiSettings
} from "react-icons/fi"
import { GlobalTopBar } from "@/components/GlobalTopBar"

import { UserSettingsModal } from "@/components/UserSettingsModal"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { zohoContext: user } = useZoho()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const normalizedRole = user?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")

  const navItems = [
    { href: "/",            icon: FiHome,      label: "Sales Hub",    color: "text-emerald-400" },
    { href: "/sales",       icon: FiFileText,  label: "Sales Docs",   color: "text-blue-400" },
    { href: "/collections", icon: FiPhoneCall, label: "Collections",  color: "text-red-400" },
    { href: "/commissions", icon: FiDollarSign,label: "Commissions",  color: "text-amber-400" },
    { href: "/stats",       icon: FiBarChart2, label: "Rep Stats",    color: "text-sky-400" },
    { href: "/tools",       icon: FiTool,      label: "Tools & Media",color: "text-blue-400" },
  ]

  if (isAdmin) {
    navItems.push({ href: "/admin", icon: FiSettings, label: "Admin Settings", color: "text-purple-400" })
  }

  // Choose primary items for the bottom navigation bar on mobile
  const bottomItems = [
    { href: "/",            icon: FiHome,      label: "Hub",          color: "text-emerald-400" },
    { href: "/sales",       icon: FiFileText,  label: "Docs",         color: "text-blue-400" },
    { href: "/collections", icon: FiPhoneCall, label: "Collections",  color: "text-red-400" },
    { href: "/stats",       icon: FiBarChart2, label: "Stats",        color: "text-sky-400" },
  ]

  // Don't show nav on login page
  if (pathname === "/login") return <>{children}</>

  const handleLogout = () => {
    try { localStorage.removeItem("sales_portal_user") } catch {}
    window.location.href = "/login"
  }

  return (
    <div className="flex" style={{ height: "100dvh", background: "#0a0f1e" }}>

      {/* ── Desktop Floating Vertical Menu ── */}
      <aside className="hidden lg:flex flex-col items-center w-16 bg-neutral-900/95 backdrop-blur border border-neutral-800 rounded-2xl shadow-2xl fixed top-4 left-4 bottom-4 py-4 z-40">
        {/* Brand */}
        <div className="mb-6 flex justify-center w-full">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-xl flex items-center justify-center relative group cursor-default">
            <span className="font-black text-white text-sm">T</span>
            <div className="absolute left-14 bg-neutral-900 text-white text-xs font-bold px-2 py-1 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity border border-neutral-800 shadow-xl whitespace-nowrap z-50">
              Titan Unified Hub
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col items-center gap-2 w-full px-2">
          {navItems.map(item => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl transition-all relative group ${
                  active
                    ? "bg-neutral-800 text-white border border-neutral-700/60"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                <Icon size={16} className={active ? item.color : ""} />
                
                {/* Tooltip on hover */}
                <div className="absolute left-14 bg-neutral-900 text-white text-xs font-bold px-2 py-1 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity border border-neutral-800 shadow-xl whitespace-nowrap z-50">
                  {item.label}
                </div>
              </Link>
            )
          })}
        </nav>

        {/* User / Signout at bottom */}
        <div className="mt-auto flex flex-col gap-3 items-center border-t border-neutral-800/60 pt-4 w-full px-2">
          {user && (
            <div className="relative group cursor-pointer" onClick={() => setShowSettings(true)}>
              <div className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-750 border border-neutral-750 transition-colors flex items-center justify-center shrink-0">
                <FiUser size={13} className="text-neutral-300 animate-pulse" />
              </div>
              
              {/* User details card on hover */}
              <div className="absolute left-14 bottom-0 bg-neutral-900 border border-neutral-800 rounded-xl p-3 shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 w-44">
                <div className="text-xs font-bold text-white truncate">{user.name}</div>
                <div className="text-[10px] text-neutral-500 truncate mt-0.5">{user.role}</div>
                <div className="text-[9px] text-emerald-400 mt-1 font-bold">Click to edit settings</div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-all relative group"
            title="Sign Out"
          >
            <FiLogOut size={14} />
            <div className="absolute left-14 bg-neutral-900 text-white text-xs font-bold px-2 py-1 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity border border-neutral-800 shadow-xl whitespace-nowrap z-50">
              Sign Out
            </div>
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-md flex items-center justify-center">
            <span className="font-black text-white text-xs">T</span>
          </div>
          <span className="text-sm font-bold text-white">Titan Hub</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-neutral-400 hover:text-white">
          {sidebarOpen ? <FiX size={20} /> : <FiMenu size={20} />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-56 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full z-50">
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="text-sm font-bold text-white">Titan Diamond Hub</div>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5">
              {navItems.map(item => {
                const Icon = item.icon
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      active ? "bg-neutral-700 text-white" : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                    }`}
                  >
                    <Icon size={16} className={active ? item.color : ""} />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="px-4 py-3 border-t border-neutral-800">
              <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-neutral-500 hover:text-red-400">
                <FiLogOut size={12} /> Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Mobile Bottom Tab Bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-neutral-900 border-t border-neutral-800 flex pb-[env(safe-area-inset-bottom)]">
        {bottomItems.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={`flex-1 flex flex-col items-center py-2 text-[10px] font-semibold transition-colors ${
                active ? "text-white" : "text-neutral-600"
              }`}
            >
              <Icon size={18} className={active ? item.color : ""} />
              <span className="mt-0.5">{item.label}</span>
            </Link>
          )
        })}
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-hidden flex flex-col lg:pt-0 pt-12 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-24">
        <GlobalTopBar />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      {/* User Settings Modal */}
      <UserSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
