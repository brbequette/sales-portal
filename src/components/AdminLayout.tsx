"use client"


import { useZoho } from "@/components/ZohoProvider"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import {
  FiShield, FiGrid, FiUsers, FiDollarSign, FiMessageSquare,
  FiSettings, FiChevronLeft, FiTruck, FiMenu, FiX, FiCloud,
  FiSliders, FiTrendingUp, FiCpu,
} from "react-icons/fi"

import { ThemeSettingsModal, loadSavedTheme, applyThemeToCss } from "@/components/ThemeSettingsModal"
import { isAdminRole } from "@/lib/roles"

const adminLinks = [
  { group: "Control", items: [
    { name: "Overview", href: "/admin", icon: FiGrid },
    { name: "Data & Integrations", href: "/admin/data-integrations", icon: FiCloud },
    { name: "Automation & AI", href: "/admin/automation-ai", icon: FiCpu },
    { name: "Sales Configuration", href: "/admin/sales-configuration", icon: FiTrendingUp },
    { name: "Compensation & Payroll", href: "/admin/compensation-center", icon: FiDollarSign },
    { name: "People & Time", href: "/admin/people-time", icon: FiUsers },
    { name: "Communications", href: "/admin/communications-center", icon: FiMessageSquare },
    { name: "Operations", href: "/admin/operations-center", icon: FiTruck },
    { name: "Settings", href: "/admin/settings", icon: FiSettings },
  ]},
]


export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const { status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const displayMode = useSyncExternalStore(
    callback => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback) },
    () => new URLSearchParams(window.location.search).get("display") === "1",
    () => false,
  )
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false)

  const isAdmin = isAdminRole(currentUser?.role)

  useEffect(() => {
    applyThemeToCss(loadSavedTheme())
  }, [])

  useEffect(() => {
    if (!isInitialized || status === "loading") return
    if (!currentUser) {
      router.push("/admin-login")
    }
  }, [isInitialized, currentUser, router, status])

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-surface text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-neutral-400 font-medium text-sm">Loading Admin...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-surface text-white font-sans">
        <div className="text-center max-w-sm mx-auto px-4">
          <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <FiShield size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-neutral-400 text-sm mb-6">
            You need administrator privileges to access this section.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-sm font-bold text-white transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (displayMode) {
    return <div className="h-full min-h-0 overflow-auto" style={{ background: "var(--background)" }}>{children}</div>
  }

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden" style={{ background: "var(--background)" }}>
      
      {/* Mobile Drawer Slideout Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[80vw] bg-[var(--surface)] border-r border-[var(--border)] h-full flex flex-col z-50 overflow-y-auto">
            <div className="p-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <FiShield size={16} />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">Admin Panel</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Titan Hub</div>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close admin menu"
                className="p-2 text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <FiX size={18} />
              </button>
            </div>
            <div className="p-3 space-y-6 flex-1">
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
                          onClick={() => setIsMobileMenuOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                            isActive
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
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
        </div>
      )}

      {/* Desktop Sidebar — full-width text nav for admin area */}
      <div className="hidden md:flex w-56 shrink-0 border-r flex-col h-full overflow-y-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <FiShield size={16} />
            </div>
            <div>
              <div className="font-bold text-white text-sm">Admin Panel</div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Titan Hub</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsThemeModalOpen(true)}
              title="Theme Settings"
              aria-label="Theme Settings"
              className="p-2 rounded-xl text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all border border-transparent hover:border-amber-500/20 cursor-pointer"
            >
              <FiSliders size={16} />
            </button>
            <Link
              href="/dashboard"
              title="Back to Hub"
              aria-label="Back to Hub"
              className="p-2 rounded-xl text-neutral-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all border border-transparent hover:border-emerald-500/20"
            >
              <FiChevronLeft size={16} />
            </Link>
          </div>
        </div>

        <div className="p-3 space-y-5 flex-1">
          {adminLinks.map((group, idx) => (
            <div key={idx}>
              <div className="px-3 mb-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
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
      <div className="flex-1 overflow-hidden relative flex flex-col" style={{ background: "var(--background)" }}>
        {/* Mobile Header Bar */}
        <div className="md:hidden border-b flex items-center justify-between px-4 h-12" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open admin navigation"
            aria-expanded={isMobileMenuOpen}
            className="p-2 text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <FiMenu size={18} />
          </button>
          <span className="text-sm font-bold text-white">Admin Panel</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsThemeModalOpen(true)}
              className="text-xs text-amber-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors"
            >
              <FiSliders size={14} /> Theme
            </button>
            <Link
              href="/dashboard"
              className="text-xs text-emerald-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors min-h-[44px] items-center"
            >
              <FiChevronLeft size={14} /> Hub
            </Link>
          </div>
        </div>
        
        <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col min-h-0">
          {children}
        </div>
      </div>

      {/* Theme Settings Modal */}
      <ThemeSettingsModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />
    </div>
  )
}
