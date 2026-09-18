"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { signIn, signOut, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { FiAlertCircle, FiArrowRight, FiLock, FiShield } from "react-icons/fi"
import { SparkCanvas } from "@/components/SparkCanvas"

export default function MasterAdministratorLoginPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [loginIdentifier, setLoginIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (status === "authenticated" && session.user.role === "MASTER_ADMIN" && session.user.authSource === "LOCAL_MASTER") {
      router.replace("/admin")
    }
  }, [router, session, status])

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 p-4 text-white">
      <SparkCanvas />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-red-500/40 bg-neutral-900/95 p-8 shadow-[0_0_60px_rgba(239,68,68,0.12)] backdrop-blur-2xl">
        <div className="text-center">
          <FiShield className="mx-auto mb-4 text-red-400" size={42} />
          <span className="text-[10px] font-black uppercase tracking-[0.28em] text-red-400">Local break-glass access</span>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight">Master Administrator</h1>
          <p className="mt-2 text-sm text-neutral-400">This independent local login does not use Zoho credentials or Zoho availability.</p>
        </div>

        {status === "authenticated" && !(session.user.role === "MASTER_ADMIN" && session.user.authSource === "LOCAL_MASTER") && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <FiAlertCircle className="mr-2 inline" />Unable to authenticate account.
            <button onClick={() => signOut({ callbackUrl: "/master-admin-login" })} className="mt-3 block text-xs font-bold underline">Use a different session</button>
          </div>
        )}

        {status !== "authenticated" && (
          <form className="mt-7 space-y-4" onSubmit={async event => {
            event.preventDefault()
            setLoading(true)
            setError("")
            const result = await signIn("master-admin", { email: loginIdentifier, password, redirect: false })
            setPassword("")
            if (!result || result.error) {
              setError("Unable to authenticate account.")
              setLoading(false)
              return
            }
            router.replace("/admin")
          }}>
            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><FiAlertCircle className="mr-2 inline" />{error}</div>}
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300">Master administrator login
              <input value={loginIdentifier} onChange={event => setLoginIdentifier(event.target.value)} type="text" required autoComplete="username" className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm" />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300"><FiLock className="mr-1 inline" />Password
              <input value={password} onChange={event => setPassword(event.target.value)} type="password" required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm" />
            </label>
            <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-xs font-black uppercase tracking-wider hover:bg-red-500 disabled:opacity-50">
              {loading ? "Authenticating..." : "Sign in locally"}<FiArrowRight />
            </button>
          </form>
        )}

        <div className="mt-7 border-t border-white/10 pt-5 text-center text-xs text-neutral-500">
          <Link href="/admin-login" className="hover:text-amber-400">Return to Zoho Administrator login</Link>
        </div>
      </div>
    </main>
  )
}
