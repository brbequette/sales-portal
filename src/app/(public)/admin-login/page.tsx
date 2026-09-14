"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { signIn, signOut, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { FiAlertCircle, FiArrowRight, FiShield, FiLock } from "react-icons/fi"
import { SparkCanvas } from "@/components/SparkCanvas"
import { isAdminRole } from "@/lib/roles"

export default function AdminLoginPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (status === "authenticated" && isAdminRole(session.user.role)) {
      router.replace("/admin")
    }
  }, [router, session, status])

  const accessDenied = status === "authenticated" && !isAdminRole(session.user.role)

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
      <SparkCanvas />
      <div className="w-full max-w-md rounded-3xl border border-amber-500/40 bg-neutral-900/90 p-8 shadow-[0_0_60px_rgba(245,158,11,0.15)] backdrop-blur-2xl relative z-10">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 items-center justify-center">
            <img src="/images/brand/logo-system/titan-wordmark-light.png" alt="Titan Diamond USA Admin" className="h-14 max-w-full w-auto object-contain filter drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]" />
          </div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.28em] text-amber-400">Restricted Access</span>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight">Administrative Portal</h1>
          <p className="mt-2 text-sm text-neutral-400">Zoho SSO plus an approved administrator role is required.</p>
        </div>

        {accessDenied && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <div className="flex items-start gap-3"><FiAlertCircle className="mt-0.5 shrink-0" /><span>Your Zoho account is valid, but it does not have administrator access.</span></div>
            <button onClick={() => signOut({ callbackUrl: "/admin-login" })} className="mt-3 text-xs font-bold text-red-200 underline">Sign in with a different Zoho account</button>
          </div>
        )}

        {!accessDenied && (
          <>
          {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><FiAlertCircle className="mr-2 inline" />{error}</div>}
          <form className="mt-6 space-y-3" onSubmit={async (event) => {
            event.preventDefault(); setLoading(true); setError("")
            const result = await signIn("credentials", { email, password, redirect: false })
            if (result?.error) { setError("Unable to authenticate account."); setLoading(false) }
            else router.replace("/admin")
          }}>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300">Local administrator email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="username" className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm" />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300"><FiLock className="mr-1 inline" />Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm" />
            </label>
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-3 text-xs font-black uppercase tracking-wider text-emerald-300 disabled:opacity-50">{loading ? "Authenticating..." : "Sign in locally"}<FiArrowRight /></button>
          </form>
          <button 
            onClick={() => { 
              setLoading(true); 
              window.location.href = "/api/auth/signin/zoho?callbackUrl=" + encodeURIComponent("/admin");
            }} 
            disabled={loading || status === "loading"} 
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-4 text-sm font-black uppercase tracking-wider text-neutral-950 transition hover:from-amber-400 disabled:opacity-60"
          >
            <FiShield />{loading || status === "loading" ? "Connecting to Zoho..." : "Continue with Zoho"}<FiArrowRight />
          </button>
          </>
        )}

        <div className="mt-7 flex justify-center gap-4 border-t border-white/10 pt-5 text-xs text-neutral-500">
          <Link href="/employee-login" className="hover:text-emerald-400">Employee login</Link><span>•</span><Link href="/login" className="hover:text-amber-400">Customer login</Link>
        </div>
      </div>
    </main>
  );
}
