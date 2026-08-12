"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FiFileText, FiHelpCircle, FiLogOut, FiPackage, FiShoppingBag, FiUser, FiCheckCircle } from "react-icons/fi"

interface CustomerSession {
  accountName?: string
  accountNumber?: string
  tier?: string
  repName?: string
  repPhone?: string
}

export default function CustomerPortalPage() {
  const router = useRouter()
  const [customer, setCustomer] = useState<CustomerSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("td_customer_session") : null
      if (saved) {
        setCustomer(JSON.parse(saved))
      } else {
        // Fallback demo contractor session for preview
        setCustomer({
          accountName: "Apex Sawing & Core Drilling",
          accountNumber: "TITAN-8890",
          tier: "Platinum Wholesale (25% OFF)",
          repName: "Mark Johnson",
          repPhone: "(800) 555-0199 ext 104"
        })
      }
    } catch {
      setCustomer(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("td_customer_session")
    }
    router.replace("/login")
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 rounded-3xl border border-amber-500/30 bg-neutral-900/90 p-6 sm:p-8 sm:flex-row sm:items-center sm:justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400">
              <FiCheckCircle size={14} /> Wholesale Contractor Account
            </div>
            <h1 className="mt-2 text-3xl font-black">{customer?.accountName || "Contractor Account"}</h1>
            <p className="mt-1 text-xs text-neutral-400 font-mono">Account #: {customer?.accountNumber || "TITAN-8890"} • {customer?.tier || "Wholesale Tier"}</p>
          </div>
          <button 
            onClick={handleLogout} 
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition-colors"
          >
            <FiLogOut /> Sign Out
          </button>
        </header>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <Link href="/shop" className="group rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-6 transition hover:border-amber-400 shadow-xl">
            <FiShoppingBag className="text-amber-400" size={28} />
            <h2 className="mt-4 text-lg font-black">Shop Catalog with Wholesale Rates</h2>
            <p className="mt-2 text-xs text-neutral-400">Browse Titan Diamond blades, core bits, and cup wheels with active contractor pricing.</p>
          </Link>

          <Link href="/contact" className="group rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-transparent p-6 transition hover:border-sky-400 shadow-xl">
            <FiHelpCircle className="text-sky-400" size={28} />
            <h2 className="mt-4 text-lg font-black">Assigned Sales Rep Support</h2>
            <p className="mt-2 text-xs text-neutral-400">Direct Contact: {customer?.repName || "Mark Johnson"} • {customer?.repPhone || "(800) 555-0199"}</p>
          </Link>

          <div className="rounded-3xl border border-white/10 bg-neutral-900/60 p-6">
            <FiPackage className="text-emerald-400" size={28} />
            <h2 className="mt-4 text-lg font-black">Order Status & Tracking</h2>
            <p className="mt-2 text-xs text-neutral-400">Order tracking and shipment dispatches are connected to your account.</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-neutral-900/60 p-6">
            <FiFileText className="text-violet-400" size={28} />
            <h2 className="mt-4 text-lg font-black">Saved Blade Specs & Quotes</h2>
            <p className="mt-2 text-xs text-neutral-400">Access custom diamond segment formulas and jobsite spec sheets.</p>
          </div>
        </section>

        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/40 p-5 text-xs text-neutral-400">
          <FiUser className="shrink-0 text-amber-400" size={16} />
          Contractor portal accounts are isolated from Titan employee and sales representative internal systems.
        </div>
      </div>
    </main>
  )
}
