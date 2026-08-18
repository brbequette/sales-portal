"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FiLogOut, FiMenu, FiX, FiHome, FiShoppingBag, FiBox, FiRefreshCw, FiTruck } from "react-icons/fi"
import * as jose from "jose"

export default function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [customerName, setCustomerName] = useState<string>("")
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const token = localStorage.getItem("td_customer_token")
    if (!token) {
      router.push("/login")
      return
    }

    try {
      const decoded = jose.decodeJwt(token)
      if (decoded && typeof decoded.name === "string") {
        setCustomerName(decoded.name)
      }
    } catch (e) {
      console.error("Invalid token", e)
      localStorage.removeItem("td_customer_token")
      router.push("/login")
    }
  }, [router])

  if (!isMounted) return null

  const handleSignOut = () => {
    localStorage.removeItem("td_customer_token")
    router.push("/login")
  }

  const tabs = [
    { name: "Dashboard", href: "/customer-portal", icon: FiHome },
    { name: "Orders", href: "/customer-portal/orders", icon: FiShoppingBag },
    { name: "My Blades", href: "/customer-portal/blades", icon: FiBox },
    { name: "Autoship", href: "/customer-portal/autoship", icon: FiRefreshCw },
    { name: "Tracking", href: "/customer-portal/tracking", icon: FiTruck },
  ]

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-amber-500/30">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/customer-portal" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center font-black text-neutral-950">
                  TD
                </div>
                <span className="font-black text-xl tracking-tight hidden sm:block">
                  TITAN <span className="text-amber-500">DIAMOND</span>
                </span>
              </Link>
            </div>
            
            <div className="hidden md:flex items-center space-x-1">
              {tabs.map((tab) => {
                const isActive = pathname === tab.href
                const Icon = tab.icon
                return (
                  <Link
                    key={tab.name}
                    href={tab.href}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                      isActive 
                        ? "bg-white/10 text-amber-400" 
                        : "text-neutral-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={16} />
                    {tab.name}
                  </Link>
                )
              })}
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <div className="text-xs text-neutral-400 font-medium">Logged in as</div>
                <div className="text-sm font-bold text-white truncate max-w-[150px]">{customerName}</div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 text-neutral-400 hover:text-rose-400 transition-colors bg-white/5 hover:bg-rose-500/10 rounded-lg"
                title="Sign Out"
              >
                <FiLogOut size={18} />
              </button>
              
              <button 
                className="md:hidden p-2 text-neutral-400 hover:text-white bg-white/5 rounded-lg"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-neutral-900">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {tabs.map((tab) => {
                const isActive = pathname === tab.href
                const Icon = tab.icon
                return (
                  <Link
                    key={tab.name}
                    href={tab.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`block px-3 py-3 rounded-lg text-sm font-bold flex items-center gap-3 ${
                      isActive 
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                        : "text-neutral-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={18} />
                    {tab.name}
                  </Link>
                )
              })}
              <div className="px-3 py-3 mt-4 border-t border-white/5">
                <div className="text-xs text-neutral-400 font-medium mb-1">Account</div>
                <div className="text-sm font-bold text-white truncate">{customerName}</div>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
