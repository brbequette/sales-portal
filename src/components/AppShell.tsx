"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect, useMemo } from "react"
import { signOut } from "next-auth/react"
import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import {
  FiHome, FiPhoneCall, FiDollarSign, FiTool, FiTrendingUp,
  FiX, FiFileText, FiLogOut, FiSettings, FiBookOpen,
  FiMessageSquare, FiArrowLeft, FiCheckSquare, FiClock, FiGrid,
  FiTruck, FiAward,
} from "react-icons/fi"
import { GlobalTopBar } from "@/components/GlobalTopBar"
import { UserSettingsModal } from "@/components/UserSettingsModal"
import { CommandPalette } from "@/components/CommandPalette"
import { AiAssistant } from "@/components/AiAssistant"
import { isAdminRole } from "@/lib/roles"

// ─── Types ───────────────────────────────────────────────────────────────────

type NavItem = {
  href: string
  icon: React.ElementType
  label: string
  color: string
}

type NavGroup = {
  label: string
  items: NavItem[]
}

// ─── Adaptive bottom nav — all trackable pages ────────────────────────────────
// defaultScore determines the initial ranking before visits accumulate.
// Each visit to a page adds 10 to its effective score, so after ~5 extra
// visits a page will overtake the next-lower default.

const ALL_TRACKABLE: (NavItem & { defaultScore: number })[] = [
  { href: "/dashboard",  icon: FiHome,          label: "Home",        color: "text-orange-400",  defaultScore: 100 },
  { href: "/sales",       icon: FiTrendingUp,    label: "Sales",       color: "text-emerald-400", defaultScore: 90  },
  { href: "/tasks",       icon: FiCheckSquare,   label: "Tasks",       color: "text-violet-400",  defaultScore: 80  },
  { href: "/docs",        icon: FiFileText,      label: "Docs",        color: "text-sky-400",     defaultScore: 70  },
  { href: "/messages",    icon: FiMessageSquare, label: "Messages",    color: "text-cyan-400",    defaultScore: 60  },
  { href: "/collections", icon: FiPhoneCall,     label: "Collections", color: "text-rose-400",    defaultScore: 50  },
  { href: "/commissions", icon: FiDollarSign,    label: "Commissions", color: "text-green-400",   defaultScore: 40  },
  { href: "/stats",       icon: FiAward,         label: "Stats",       color: "text-yellow-400",  defaultScore: 30  },
  { href: "/shipping",    icon: FiTruck,         label: "Shipping",    color: "text-amber-400",   defaultScore: 20  },
  { href: "/tools",       icon: FiTool,          label: "Tools",       color: "text-indigo-400",  defaultScore: 10  },
  { href: "/training",    icon: FiBookOpen,      label: "Training",    color: "text-teal-400",    defaultScore: 9   },
  { href: "/timeclock",   icon: FiClock,         label: "Timeclock",   color: "text-lime-400",    defaultScore: 8   },
]

const NAV_VISITS_KEY = "titan_nav_visits_v1"

function loadVisits(): Record<string, number> {
  try {
    const stored = localStorage.getItem(NAV_VISITS_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch { return {} }
}

function saveVisits(visits: Record<string, number>) {
  try { localStorage.setItem(NAV_VISITS_KEY, JSON.stringify(visits)) } catch {}
}

// ─── Desktop Sidebar Navigation Groups ───────────────────────────────────────
// Admin-only items are removed — admins navigate via /admin and the AdminLayout.
// A single "Admin Hub" link is added at the bottom of the sidebar for admins.

const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { href: "/dashboard",  icon: FiHome,          label: "Dashboard",      color: "text-orange-400"  },
      { href: "/sales",       icon: FiTrendingUp,    label: "Sales Pipeline", color: "text-emerald-400" },
      { href: "/tasks",       icon: FiCheckSquare,   label: "Task Hub",       color: "text-violet-400"  },
      { href: "/docs",        icon: FiFileText,      label: "Documents",      color: "text-sky-400"     },
    ]
  },
  {
    label: "Communication",
    items: [
      { href: "/messages",    icon: FiMessageSquare, label: "Messages",       color: "text-cyan-400"    },
      { href: "/collections", icon: FiPhoneCall,     label: "Collections",    color: "text-rose-400"    },
    ]
  },
  {
    label: "Finance",
    items: [
      { href: "/commissions", icon: FiDollarSign,    label: "Commissions",    color: "text-green-400"   },
      { href: "/stats",       icon: FiAward,         label: "Rep Stats",      color: "text-yellow-400"  },
      { href: "/shipping",    icon: FiTruck,         label: "Shipping",       color: "text-amber-400"   },
    ]
  },
  {
    label: "Resources",
    items: [
      { href: "/catalog",     icon: FiGrid,          label: "Product Catalog",color: "text-amber-400"   },
      { href: "/tools",       icon: FiTool,          label: "Tools & Media",  color: "text-indigo-400"  },
      { href: "/training",    icon: FiBookOpen,      label: "Training Hub",   color: "text-teal-400"    },
      { href: "/timeclock",   icon: FiClock,         label: "Timeclock",      color: "text-lime-400"    },
    ]
  },
]

const groupAccent: Record<string, string> = {
  "Core":         "bg-orange-500",
  "Communication":"bg-cyan-500",
  "Finance":      "bg-green-500",
  "Resources":    "bg-indigo-500",
}

// ─── Main pages list (no back button needed) ──────────────────────────────────
const MAIN_PAGES = [
  "/dashboard", "/login", "/sales", "/shipping", "/messages", "/collections",
  "/commissions", "/stats", "/tools", "/training", "/catalog",
  "/timeclock", "/tasks", "/intro-offer", "/docs",
]

// ─── SidebarLink ─────────────────────────────────────────────────────────────

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
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
        transition-all duration-150 whitespace-nowrap z-tooltip
        flex items-center gap-1.5
      ">
        <span className={`w-1.5 h-1.5 rounded-full ${item.color.replace("text-", "bg-")}`} />
        {item.label}
      </span>
    </Link>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { zohoContext: user } = useZoho()
  const { preferences } = usePreferences()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [navVisits, setNavVisits] = useState<Record<string, number>>({})

  // ── Auth / layout bypass ──────────────────────────────────────────────────
  const isPublicPage = pathname === "/" 
    || pathname.startsWith("/shop") 
    || pathname.startsWith("/catalog")
    || pathname === "/about" 
    || pathname === "/contact" 
    || pathname.startsWith("/resources") 
    || pathname.startsWith("/blade-finder") 
    || pathname.startsWith("/applications") 
    || pathname.startsWith("/signature-series") 
    || pathname.startsWith("/knowledge-test") 
    || pathname.startsWith("/rpm-calculator") 
    || pathname.startsWith("/blade-comparator") 
    || pathname.startsWith("/unit-converter") 
    || pathname.startsWith("/tools")
    || pathname.startsWith("/training")
    || pathname.startsWith("/careers") 
    || pathname === "/admin-login" 
    || pathname === "/employee-login"
    || pathname === "/customer-portal"
    || pathname === "/privacy" 
    || pathname === "/terms"
  if (pathname === "/login" || pathname === "/intro-offer" || pathname.startsWith("/tv") || isPublicPage) {
    return <>{children}</>
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const isAdminPage = pathname.startsWith("/admin")

  const effectiveRole = preferences.impersonatedUser?.role ?? user?.role ?? ""
  const isAdmin = isAdminRole(effectiveRole)

  const showBackButton = !MAIN_PAGES.includes(pathname) && !isAdminPage

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/")

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try { localStorage.removeItem("sales_portal_user") } catch { }
    await signOut({ callbackUrl: "/employee-login" })
  }

  // ── Adaptive nav — load visits on mount ───────────────────────────────────
  useEffect(() => {
    setNavVisits(loadVisits())
  }, [])

  // ── Adaptive nav — track every page visit ────────────────────────────────
  useEffect(() => {
    const trackable = ALL_TRACKABLE.find(item =>
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(item.href + "/")
    )
    if (!trackable) return
    const visits = loadVisits()
    visits[trackable.href] = (visits[trackable.href] || 0) + 1
    saveVisits(visits)
    setNavVisits({ ...visits })
  }, [pathname])

  // ── Adaptive nav — compute top 4 by weighted score ───────────────────────
  const adaptiveBottomItems = useMemo(() =>
    [...ALL_TRACKABLE]
      .sort((a, b) => {
        const sa = (navVisits[a.href] || 0) * 10 + a.defaultScore
        const sb = (navVisits[b.href] || 0) * 10 + b.defaultScore
        return sb - sa
      })
      .slice(0, 4),
    [navVisits]
  )

  // ── Close mobile overlays on navigation ──────────────────────────────────
  useEffect(() => {
    setMobileOpen(false)
    setShowMoreMenu(false)
  }, [pathname])

  return (
    <div className="flex bg-[var(--background)] text-[var(--foreground)]" style={{ height: "100dvh" }}>

      {/* ════════════════════════════════════════════════════════════════════
          DESKTOP SIDEBAR (md+) — Hidden on admin pages (AdminLayout has own nav)
      ═════════════════════════════════════════════════════════════════════= */}
      {!isAdminPage && (
        <aside
          className="
            hidden md:flex flex-col items-center
            w-[3.5rem] shrink-0
            fixed top-3 left-3 bottom-3
            glass-panel rounded-2xl border-white/10
            shadow-[0_20px_60px_rgba(0,0,0,0.5)]
            py-3 z-40 overflow-visible
          "
          aria-label="Main navigation"
        >
          {/* Brand mark */}
          <div className="shrink-0 mb-3 flex justify-center w-full">
            <Link href="/dashboard" className="w-10 h-10 flex items-center justify-center relative group">
              <img 
                src="/images/logo_dark.png" 
                alt="Titan Diamond USA" 
                className="h-9 w-auto object-contain filter drop-shadow-[0_0_12px_rgba(245,158,11,0.3)] group-hover:scale-110 transition-transform duration-200" 
              />
              <span className="
                pointer-events-none absolute left-[3.25rem] top-1/2 -translate-y-1/2
                bg-[#111214]/95 backdrop-blur-xl border border-white/15
                text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg
                shadow-[0_8px_24px_rgba(0,0,0,0.7)]
                opacity-0 group-hover:opacity-100 group-hover:translate-x-1
                transition-all duration-150 whitespace-nowrap z-[9999]
                flex items-center gap-2
              ">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                Titan Diamond Hub
              </span>
            </Link>
          </div>

          {/* Back button */}
          {showBackButton && (
            <button
              onClick={() => router.back()}
              title="Go Back"
              aria-label="Go Back"
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
            {navGroups.map((group, gi) => (
              <div key={group.label} className="flex flex-col items-center w-full">
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

            {/* Admin Hub link — visible only to admins */}
            {isAdmin && (
              <div className="flex flex-col items-center w-full">
                <div className="flex flex-col items-center my-1.5 w-full">
                  <div className="w-5 h-[2px] rounded-full bg-purple-500 opacity-40" />
                </div>
                <div className="mb-0.5 w-full flex justify-center">
                  <SidebarLink
                    item={{ href: "/admin", icon: FiGrid, label: "Admin Hub", color: "text-purple-400" }}
                    active={isActive("/admin")}
                  />
                </div>
              </div>
            )}
          </nav>

          {/* Bottom: avatar + sign out */}
          <div className="shrink-0 flex flex-col gap-1.5 items-center border-t border-white/8 pt-2 mt-1 w-full px-1.5">
            {user && (
              <button
                onClick={() => setShowSettings(true)}
                title="Account Settings"
                aria-label="Account Settings"
                className="relative group cursor-pointer w-8 h-8 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 border border-white/15 hover:border-orange-500 flex items-center justify-center shadow-lg transition-all duration-200"
              >
                <span className="text-xs font-bold text-white">{user.name?.charAt(0) ?? "?"}</span>
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
              </button>
            )}
            <button
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
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
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MOBILE TOP BAR (<md)
      ═════════════════════════════════════════════════════════════════════= */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-14 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/8 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(249,115,22,0.5)]">
            <span className="font-black text-white text-xs">T</span>
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Titan Hub</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-drawer"
          className="p-2 -mr-2 text-neutral-400 hover:text-white transition-colors rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
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

      {/* ════════════════════════════════════════════════════════════════════
          MOBILE FULL-SCREEN MENU DRAWER
      ═════════════════════════════════════════════════════════════════════= */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            id="mobile-drawer"
            className="
              relative w-72 max-w-[85vw] bg-[#0d0e11]/98 backdrop-blur-2xl
              border-r border-white/8 h-full flex flex-col z-modal
              shadow-[8px_0_40px_rgba(0,0,0,0.6)]
              animate-fade-in
            "
            role="navigation"
            aria-label="Mobile navigation"
          >
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
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="p-2 text-neutral-500 hover:text-white transition-colors rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Nav groups */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {navGroups.map(group => (
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
                          aria-current={active ? "page" : undefined}
                          className={`
                            flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold
                            transition-all duration-150 min-h-[44px]
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

              {/* Admin Hub — admins only */}
              {isAdmin && (
                <div>
                  <div className="flex items-center gap-2 px-3 mb-2">
                    <div className="w-3 h-[2px] rounded-full bg-purple-500" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Admin</span>
                  </div>
                  <Link
                    href="/admin"
                    onClick={() => setMobileOpen(false)}
                    aria-current={isActive("/admin") ? "page" : undefined}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold
                      transition-all duration-150 min-h-[44px]
                      ${isActive("/admin")
                        ? "bg-white/10 text-white border border-white/10"
                        : "text-neutral-400 hover:bg-white/5 hover:text-white border border-transparent"
                      }
                    `}
                  >
                    <FiGrid size={16} className={isActive("/admin") ? "text-purple-400" : "opacity-60"} />
                    <span className="flex-1">Admin Hub</span>
                    {isActive("/admin") && <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
                  </Link>
                </div>
              )}
            </nav>

            {/* Drawer footer */}
            <div className="shrink-0 border-t border-white/8 px-4 py-4 space-y-2">
              {user && (
                <button
                  onClick={() => { setMobileOpen(false); setShowSettings(true) }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-neutral-400 hover:bg-white/5 hover:text-white transition-all min-h-[44px]"
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
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-neutral-500 hover:bg-red-500/10 hover:text-red-400 transition-all min-h-[44px]"
              >
                <FiLogOut size={16} />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MOBILE BOTTOM TAB BAR (<md) — Adaptive top-4 + More
          Min height 56px ensures comfortable touch targets (≥44px Apple HIG)
      ═════════════════════════════════════════════════════════════════════= */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/8 flex pb-[env(safe-area-inset-bottom)]"
        aria-label="Quick navigation"
      >
        {adaptiveBottomItems.map(item => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={`flex-1 flex flex-col items-center justify-center pt-2.5 pb-2 gap-1 text-[10px] font-semibold transition-colors min-h-[56px] ${
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

        {/* More button */}
        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          aria-label="More navigation options"
          aria-expanded={showMoreMenu}
          className={`flex-1 flex flex-col items-center justify-center pt-2.5 pb-2 gap-1 text-[10px] font-semibold transition-colors min-h-[56px] ${
            showMoreMenu ? "text-white" : "text-neutral-600 hover:text-neutral-400"
          }`}
        >
          <FiGrid size={19} className={showMoreMenu ? "text-orange-400" : ""} />
          <span className={showMoreMenu ? "text-white" : ""}>More</span>
        </button>

        {/* More slide-up sheet */}
        {showMoreMenu && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setShowMoreMenu(false)}
              aria-hidden="true"
            />
            <div 
              role="dialog"
              aria-modal="true"
              className="
              absolute bottom-full right-0 left-0 z-30
              bg-[#0d0e11]/98 backdrop-blur-2xl
              border-t border-white/10
              rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.6)]
              p-4 max-h-[75vh] overflow-y-auto
              animate-slide-up
            ">
              <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
              <div className="space-y-5">
                {navGroups.map(group => {
                  // Only show items not already in the bottom tab bar
                  const bottomHrefs = adaptiveBottomItems.map(i => i.href)
                  const extraItems = group.items.filter(i => !bottomHrefs.includes(i.href))
                  if (extraItems.length === 0) return null
                  return (
                    <div key={group.label}>
                      <div className="flex items-center gap-2 px-1 mb-2">
                        <div className={`w-3 h-[2px] rounded-full ${groupAccent[group.label] || "bg-white/20"}`} />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{group.label}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {extraItems.map(item => {
                          const Icon = item.icon
                          const active = isActive(item.href)
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setShowMoreMenu(false)}
                              aria-current={active ? "page" : undefined}
                              className={`
                                flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold
                                transition-all duration-150 min-h-[44px]
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
                  )
                })}

                {/* Admin Hub in More sheet — only for admins when not in bottom bar */}
                {isAdmin && !adaptiveBottomItems.find(i => i.href === "/admin") && (
                  <div>
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <div className="w-3 h-[2px] rounded-full bg-purple-500" />
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Admin</span>
                    </div>
                    <Link
                      href="/admin"
                      onClick={() => setShowMoreMenu(false)}
                      className={`
                        flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold
                        transition-all duration-150 min-h-[44px]
                        ${isActive("/admin")
                          ? "bg-white/10 text-white border border-white/10"
                          : "text-neutral-400 hover:bg-white/5 hover:text-white border border-transparent"
                        }
                      `}
                    >
                      <FiGrid size={15} className={isActive("/admin") ? "text-purple-400" : "opacity-60"} />
                      <span className="text-xs">Admin Hub</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </nav>

      {/* ════════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
          - pt-14 on mobile accounts for the fixed top bar (h-14 = 56px)
          - pb accounts for bottom tab bar (3.5rem) + safe-area
          - No left padding on admin pages (no sidebar)
      ═════════════════════════════════════════════════════════════════════= */}
      <main className={`
        flex-1 overflow-hidden flex flex-col
        pt-14 md:pt-0
        pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0
        ${isAdminPage ? "" : "md:pl-[4.75rem]"}
      `}>
        <GlobalTopBar />
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </main>

      <CommandPalette />
      <AiAssistant user={user ? { id: user.id, name: user.name || undefined, role: user.role } : undefined} />
      <UserSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
