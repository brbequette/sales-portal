"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getUser, logout, type User } from "@netlify/identity"
import { useRouter } from "next/navigation"
import { FiFileText, FiHelpCircle, FiLogOut, FiPackage, FiShoppingBag, FiUser } from "react-icons/fi"

export default function CustomerPortalPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUser().then((currentUser) => {
      if (!currentUser) {
        router.replace("/login")
        return
      }
      setUser(currentUser)
      setLoading(false)
    })
  }, [router])

  if (loading || !user) {
    return <main className="min-h-screen bg-[#080a0d] flex items-center justify-center text-white"><div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" /></main>
  }

  const firstName = user.name?.split(" ")[0] || "there"

  return (
    <main className="min-h-screen bg-[#080a0d] text-white px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-neutral-950/80 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-400">Customer Portal</p><h1 className="mt-2 text-3xl font-black">Welcome, {firstName}</h1><p className="mt-2 text-sm text-neutral-400">Signed in as {user.email}</p></div>
          <button onClick={async () => { await logout(); router.replace("/login") }} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold hover:bg-white/10"><FiLogOut /> Sign out</button>
        </header>

        <section className="mt-7 grid gap-4 md:grid-cols-2">
          <Link href="/shop" className="group rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-6 transition hover:border-amber-400/50"><FiShoppingBag className="text-amber-400" size={25} /><h2 className="mt-5 text-lg font-black">Shop Products</h2><p className="mt-2 text-sm text-neutral-400">Browse Titan Diamond tools and current product offerings.</p></Link>
          <Link href="/contact" className="group rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-transparent p-6 transition hover:border-sky-400/50"><FiHelpCircle className="text-sky-400" size={25} /><h2 className="mt-5 text-lg font-black">Contact Your Rep</h2><p className="mt-2 text-sm text-neutral-400">Request order help, product guidance, or account support.</p></Link>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"><FiPackage className="text-emerald-400" size={25} /><h2 className="mt-5 text-lg font-black">Orders</h2><p className="mt-2 text-sm text-neutral-400">Order history is being connected to your verified customer account.</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"><FiFileText className="text-violet-400" size={25} /><h2 className="mt-5 text-lg font-black">Invoices & Documents</h2><p className="mt-2 text-sm text-neutral-400">Secure document access is being prepared for your account.</p></div>
        </section>

        <div className="mt-7 flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-950/60 p-5 text-sm text-neutral-400"><FiUser className="shrink-0 text-amber-400" />Customer accounts are isolated from Titan employee and administrator systems.</div>
      </div>
    </main>
  )
}
