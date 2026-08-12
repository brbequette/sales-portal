"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { signIn, useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { FiAlertCircle, FiArrowRight, FiBriefcase, FiShield } from "react-icons/fi"

function EmployeeLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()
  const [loading, setLoading] = useState(false)
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard"

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard")
  }, [router, status])

  const hasError = Boolean(searchParams.get("error"))

  return (
    <main className="min-h-screen bg-[#070a0d] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-[130px]" />
      <div className="w-full max-w-md rounded-3xl border border-emerald-500/20 bg-neutral-950/90 p-8 shadow-[0_0_70px_rgba(16,185,129,0.12)] relative z-10">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-700 shadow-lg"><FiBriefcase size={28} /></div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-400">Titan Diamond Team</p>
          <h1 className="mt-2 text-2xl font-black">Employee Portal</h1>
          <p className="mt-2 text-sm text-neutral-400">Sign in with your company-managed Zoho account.</p>
        </div>

        {hasError && <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><FiAlertCircle className="mt-0.5 shrink-0" />Zoho sign-in could not be completed. Please try again or contact an administrator.</div>}

        <button onClick={() => { setLoading(true); signIn("zoho", { callbackUrl }) }} disabled={loading || status === "loading"} className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-4 text-sm font-black shadow-lg transition hover:from-emerald-400 disabled:opacity-60">
          <FiShield size={18} />{loading || status === "loading" ? "Connecting to Zoho..." : "Continue with Zoho"}<FiArrowRight size={17} />
        </button>

        <p className="mt-4 text-center text-xs text-neutral-500">Passwords are never entered or stored in this portal.</p>
        <div className="mt-7 border-t border-white/10 pt-5 text-center text-xs text-neutral-500">Customer? <Link href="/login" className="font-semibold text-amber-400 hover:text-amber-300">Use customer login</Link></div>
      </div>
    </main>
  )
}

export default function EmployeeLoginPage() {
  return <Suspense><EmployeeLoginContent /></Suspense>
}
